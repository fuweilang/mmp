import { modelPurpose } from './model-purpose';
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import axios from 'axios';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApplicationLog } from '../logging/application-log.service';
import { decryptApiKey } from './llm-key-crypto';
import { withUpstreamThinking } from './upstream-thinking';

export type HealthStatus='unchecked'|'healthy'|'degraded'|'limited'|'unavailable';
export type HealthState={id:string;status:HealthStatus;failures:number;checkedAt:Date|null;retryAt:Date|null;reason:string|null;latencyMs:number|null};
export type HealthTarget={id:string;providerId:string};
/** User-caused validation and cancellation must never take down a provider. */
export function failureDisposition(status:number,probe=false):'provider'|'model'|'limited'|'transient'|'ignore' {
  if([401,402,403].includes(status))return 'provider';
  if(status===404||(probe&&status===400))return 'model';
  if(status===429)return 'limited';
  if(status===0||status>=500||status===408)return 'transient';
  return 'ignore';
}
function milliseconds(key:string,fallback:number,min:number){const n=Number(process.env[key]);return Number.isFinite(n)&&n>=min?n:fallback;}
const DAY=86_400_000;
/** Healthy and degraded models stay quiet. Failures stay quiet until retryAt. */
export function healthProbeDue(state:{status:HealthStatus;checkedAt:Date|null;retryAt:Date|null}|undefined,now:number,freshMs=DAY):boolean{
  if(state?.retryAt&&state.retryAt.getTime()>now&&state.status!=='healthy'&&state.status!=='degraded')return false;
  if(!state||state.status==='unchecked')return true;
  if(state.status==='healthy'||state.status==='degraded'){const checked=state.checkedAt?.getTime()??0;return now-checked>=freshMs;}
  return true;
}
@Injectable()
export class LlmHealthService implements OnModuleInit,OnModuleDestroy {
  private timer?:ReturnType<typeof setTimeout>;
  private readonly stop=new AbortController();
  private polling?:Promise<void>;
  private readonly probes=new Map<string,Promise<{ok:boolean;latencyMs:number;message:string;statusCode?:number}>>();
  private readonly cancels=new Map<string,AbortController>();
  private readonly interval=milliseconds('LLM_HEALTH_INTERVAL_MS',300000,1000);
  private readonly cooldown=milliseconds('LLM_HEALTH_COOLDOWN_MS',6*60*60*1000,1000);
  private readonly fresh=milliseconds('LLM_HEALTH_FRESH_MS',DAY,1000);
  private readonly timeout=milliseconds('LLM_HEALTH_TIMEOUT_MS',20000,1000);
  private readonly threshold=Math.max(1,Math.floor(Number(process.env.LLM_HEALTH_FAILURE_THRESHOLD)||3));
  constructor(private readonly prisma:PrismaService,private readonly log:ApplicationLog){}
  onModuleInit(){if(process.env.LLM_HEALTH_ENABLED==='0')return;this.schedule(0);}
  private schedule(delay:number){this.timer=setTimeout(()=>{this.polling=this.poll().catch(error=>this.log.event('error','model.health.poll_failed',{error})).finally(()=>{this.polling=undefined;if(!this.stop.signal.aborted)this.schedule(this.interval);});},delay);this.timer.unref();}
  async onModuleDestroy(){this.stop.abort();clearTimeout(this.timer);await this.polling;await Promise.allSettled(this.probes.values());}
  async states():Promise<Map<string,HealthState>> {
    const rows=await this.prisma.$queryRaw<HealthState[]>`SELECT id,status,failures,checked_at AS "checkedAt",retry_at AS "retryAt",reason,latency_ms AS "latencyMs" FROM llm_health_state`;
    return new Map(rows.map(row=>[row.id,row]));
  }
  available(target:HealthTarget,states:Map<string,HealthState>):boolean {
    const model=states.get('m:'+target.id),provider=states.get('p:'+target.providerId);
    return !!model&&['healthy','degraded'].includes(model.status)&&(!provider||['healthy','degraded'].includes(provider.status));
  }
  view(target:HealthTarget,states:Map<string,HealthState>):HealthState {
    const provider=states.get('p:'+target.providerId);
    return provider&&!['healthy','degraded'].includes(provider.status)?provider:states.get('m:'+target.id)??{id:'m:'+target.id,status:'unchecked',failures:0,checkedAt:null,retryAt:null,reason:'等待自动检查',latencyMs:null};
  }
  async success(target:HealthTarget,latencyMs?:number):Promise<void>{
    for(const [id,modelId,providerId]of [['m:'+target.id,target.id,null],['p:'+target.providerId,null,target.providerId]] as const){
      await this.prisma.$executeRaw`INSERT INTO llm_health_state(id,model_id,provider_id,status,failures,checked_at,latency_ms) VALUES(${id},${modelId},${providerId},'healthy',0,now(),${latencyMs??null}) ON CONFLICT(id) DO UPDATE SET status='healthy',failures=0,checked_at=now(),retry_at=NULL,reason=NULL,latency_ms=COALESCE(EXCLUDED.latency_ms,llm_health_state.latency_ms)`;
    }
  }
  async failure(target:HealthTarget,status:number,probe=false):Promise<boolean>{
    const kind=failureDisposition(status,probe);if(kind==='ignore')return false;
    const channel=kind==='provider',id=(channel?'p:':'m:')+(channel?target.providerId:target.id);
    const immediate=kind!=='transient',limited=kind==='limited';
    const reason=channel?(status===402?'厂商余额不足':'厂商凭据不可用'):limited?'请求限流':kind==='model'?'模型不可用或探测不兼容':'上游超时或服务异常';
    const cooldown=limited?60000:this.cooldown;
    const changed=await this.prisma.$queryRaw<HealthState[]>`INSERT INTO llm_health_state(id,model_id,provider_id,status,failures,checked_at,retry_at,reason) VALUES(${id},${channel?null:target.id},${channel?target.providerId:null},${immediate?(limited?'limited':'unavailable'):'unchecked'},1,now(),CASE WHEN ${immediate} THEN now()+${cooldown}*interval '1 millisecond' ELSE NULL END,${reason}) ON CONFLICT(id) DO UPDATE SET failures=CASE WHEN llm_health_state.checked_at<now()-${this.interval}*interval '1 millisecond' THEN 1 ELSE llm_health_state.failures+1 END,checked_at=now(),status=CASE WHEN ${immediate} THEN ${limited?'limited':'unavailable'} WHEN llm_health_state.checked_at>=now()-${this.interval}*interval '1 millisecond' AND llm_health_state.failures+1>=${this.threshold} THEN 'unavailable' WHEN llm_health_state.status='unavailable' THEN 'unavailable' WHEN llm_health_state.status='unchecked' THEN 'unchecked' ELSE 'degraded' END,retry_at=now()+${cooldown}*interval '1 millisecond',reason=${reason} RETURNING id,status,failures,checked_at AS "checkedAt",retry_at AS "retryAt",reason,latency_ms AS "latencyMs"`;
    this.log.event('warn','model.health.failure',{modelId:target.id,providerId:target.providerId,status,health:changed[0]?.status,reason});return true;
  }
  /** A failed probe turns this model off. Live chat failures only update health. */
  private async disableProbedModel(modelId:string):Promise<void>{
    await this.prisma.llmModel.updateMany({where:{id:modelId},data:{enabled:false}});
  }
  /** Remove old observation after an operator changes a model/key, without changing manual switches. */
  async reset(providerId:string,modelId?:string):Promise<void>{
    await this.prisma.$executeRaw`DELETE FROM llm_health_state WHERE provider_id=${providerId} OR ${modelId?Prisma.sql`model_id=${modelId}`:Prisma.sql`model_id IN (SELECT id FROM llm_model WHERE provider_id=${providerId})`}`;
  }
  private async poll(){
    const providers=await this.prisma.llmProvider.findMany({where:{enabled:true,apiKeyEnc:{not:null}},include:{models:{where:{enabled:true},orderBy:{sortOrder:'asc'}}}});
    const states=await this.states();
    const now=Date.now();
    const due:{id:string;providerId:string}[]=[];
    for(const provider of providers){
      const channel=states.get('p:'+provider.id);
      if(channel?.retryAt&&channel.retryAt.getTime()>now&&!['healthy','degraded'].includes(channel.status))continue;
      for(const model of provider.models){if(modelPurpose(model)!=='chat')continue;if(healthProbeDue(states.get('m:'+model.id),now,this.fresh))due.push({id:model.id,providerId:provider.id});}
    }
    const blocked=new Set<string>();
    let cursor=0;
    const run=async()=>{
      while(!this.stop.signal.aborted){
        const item=due[cursor++];
        if(!item)return;
        if(blocked.has(item.providerId))continue;
        const result=await this.probeSaved(item.id);
        if(result.statusCode&&failureDisposition(result.statusCode)==='provider')blocked.add(item.providerId);
      }
    };
    await Promise.all(Array.from({length:Math.min(2,due.length)},()=>run()));
  }
  /** Low-output model call; operational expense is never charged to an enterprise wallet. */
  requestProbe(modelId:string):void {void this.probeSaved(modelId).catch(error=>this.log.event('error','model.health.check_failed',{modelId,error}));}
  /** Stop one in-flight probe. Cancellation is not a failure. */
  cancelProbe(modelId:string):void {this.cancels.get(modelId)?.abort();}
  probeSaved(modelId:string,parent?:AbortSignal):Promise<{ok:boolean;latencyMs:number;message:string;statusCode?:number}>{
    if(parent?.aborted)return Promise.resolve({ok:false,latencyMs:0,message:'已中断'});
    let cancel=this.cancels.get(modelId);
    if(!cancel){cancel=new AbortController();this.cancels.set(modelId,cancel);}
    if(parent)parent.addEventListener('abort',()=>cancel!.abort(),{once:true});
    const existing=this.probes.get(modelId);if(existing)return existing;
    const operation=this.performProbe(modelId,cancel.signal).finally(()=>{this.probes.delete(modelId);this.cancels.delete(modelId);});
    this.probes.set(modelId,operation);return operation;
  }
  private async performProbe(modelId:string,cancel:AbortSignal):Promise<{ok:boolean;latencyMs:number;message:string;statusCode?:number}>{
    const model=await this.prisma.llmModel.findUnique({where:{id:modelId},include:{provider:true}});
    if(!model)return{ok:false,latencyMs:0,message:'模型不存在'};
    if(modelPurpose(model)!=='chat')return{ok:false,latencyMs:0,message:'该模型不是对话模型，请使用头像生图预览'};
    const target={id:model.id,providerId:model.providerId},start=Date.now();
    let apiKey:string;
    try{apiKey=model.provider.apiKeyEnc?decryptApiKey(model.provider.apiKeyEnc):'';}catch(error){this.log.event('error','model.health.key_failed',{providerId:model.providerId,error});await this.failure(target,401,true);await this.disableProbedModel(model.id);return{ok:false,latencyMs:0,message:'厂商凭据不可用',statusCode:401};}
    if(!apiKey||!model.provider.baseUrl){await this.failure(target,401,true);await this.disableProbedModel(model.id);return{ok:false,latencyMs:0,message:'厂商配置不完整',statusCode:401};}
    const base=model.provider.baseUrl.replace(/\/+$/,'');const url=/\/chat\/completions$/i.test(base)?base:/\/v1$/i.test(base)?base+'/chat/completions':base+'/v1/chat/completions';
    const attempt=new AbortController();
    const abort=()=>attempt.abort();
    if(cancel.aborted||this.stop.signal.aborted)attempt.abort();
    cancel.addEventListener('abort',abort);
    this.stop.signal.addEventListener('abort',abort);
    try{
      const response=await axios.post(url,withUpstreamThinking({model:model.modelId,messages:[{role:'user',content:'Reply OK'}],max_tokens:16,stream:false},model.provider.baseUrl,false),{headers:{Authorization:`Bearer ${apiKey}`},timeout:this.timeout,signal:attempt.signal,validateStatus:()=>true,maxRedirects:0});
      const latencyMs=Date.now()-start;
      const ok=response.status>=200&&response.status<300&&Array.isArray(response.data?.choices)&&response.data.choices.length>0;
      if(ok)await this.success(target,latencyMs);else{await this.failure(target,response.status>=400?response.status:502,true);await this.disableProbedModel(model.id);}
      this.log.event(ok?'info':'warn','model.health.probe',{modelId,providerId:model.providerId,status:response.status,latencyMs,ok});
      return{ok,latencyMs,message:ok?'检查通过':`检查失败（HTTP ${response.status}）`,statusCode:response.status};
    }catch(error){
      if(cancel.aborted)return{ok:false,latencyMs:Date.now()-start,message:'已中断'};
      if(this.stop.signal.aborted)return{ok:false,latencyMs:Date.now()-start,message:'检查已取消'};
      await this.failure(target,0,true);await this.disableProbedModel(model.id);this.log.event('error','model.health.probe_error',{modelId,error});return{ok:false,latencyMs:Date.now()-start,message:'模型连接失败'};
    }finally{cancel.removeEventListener('abort',abort);this.stop.signal.removeEventListener('abort',abort);}
  }
}
