import { BadGatewayException, BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException, ConflictException } from '@nestjs/common';
import type { User } from '@prisma/client';
import axios from 'axios';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { resolveChatProviderConfiguration } from './provider-configuration';

import { IMAGE_MODEL_SIZES as MODEL_SIZES, modelPurpose } from './model-purpose';
export interface GenerateAvatarInput { providerId: string; model: string; prompt: string }
@Injectable()
export class AvatarGenerationService {
  private readonly active = new Set<string>();
  constructor(private readonly prisma: PrismaService) {}
  private authorize(actor: User) {
    if (!actor.isPlatformAdmin) throw new ForbiddenException('仅平台管理员可操作');
  }
  private async providers() {
    const rows = await this.prisma.llmProvider.findMany({where:{enabled:true},include:{models:true},orderBy:{sortOrder:'asc'}});
    return rows.filter(p => {
      try {const u=new URL(p.baseUrl || '');return u.origin==='https://api.siliconflow.cn' && /^\/v1\/?$/.test(u.pathname) && !u.username && !u.password && !u.search && !u.hash && !!p.apiKeyEnc;}
      catch {return false;}
    });
  }
  private async available(provider: Awaited<ReturnType<AvatarGenerationService['providers']>>[number]) {
    const {apiKey}=resolveChatProviderConfiguration(provider);
    const response=await axios.get('https://api.siliconflow.cn/v1/models', {headers:{Authorization:`Bearer ${apiKey}`},timeout:15000,maxRedirects:0,maxContentLength:2*1024*1024});
    const ids=new Set((Array.isArray(response.data?.data)?response.data.data:[]).map((m:any)=>m.id));
    return Object.keys(MODEL_SIZES).filter(id=>ids.has(id));
  }
  async models(actor: User) {
    this.authorize(actor);
    const providers=await this.providers();
    const results=await Promise.all(providers.map(async p=>{
      try {const remote=await this.available(p);return {models:p.models.filter(m=>m.enabled && modelPurpose(m)==='image' && remote.includes(m.modelId)).map(m=>({providerId:p.id,providerName:p.displayName || p.name,model:m.modelId,displayName:m.displayName || m.modelId.split('/').pop()!})),failed:false};}
      catch {return {models:[],failed:true};}
    }));
    return {models:results.flatMap(r=>r.models),unavailableProviders:results.filter(r=>r.failed).length};
  }
  /** Explicit operator action; never mutate model registration from a read endpoint. */
  async sync(actor: User) {
    this.authorize(actor);
    const providers=await this.providers();
    let registered=0,unavailableProviders=0;
    for(const provider of providers){
      let remote:string[];
      try{remote=await this.available(provider);}catch{unavailableProviders++;continue;}
      await this.prisma.$transaction(async tx=>{
        for(const modelId of remote){
          const existing=await tx.llmModel.findUnique({where:{providerId_modelId:{providerId:provider.id,modelId}}});
          const meta=existing?.meta && typeof existing.meta==='object' && !Array.isArray(existing.meta)?existing.meta:{};
          await tx.llmModel.upsert({where:{providerId_modelId:{providerId:provider.id,modelId}},
            create:{providerId:provider.id,modelId,displayName:modelId.split('/').pop()!,enabled:true,isPreferred:false,thinkingEnabled:false,meta:{purpose:'image'}},
            update:{meta:{...meta,purpose:'image'},isPreferred:false,thinkingEnabled:false},
          });
        }
        await tx.auditLog.create({data:{userId:actor.id,action:'llm_image_models_sync',meta:{providerId:provider.id,models:remote}}});
      });
      registered+=remote.length;
    }
    return {registered,unavailableProviders};
  }
  async generate(actor: User, input: GenerateAvatarInput) {
    this.authorize(actor);
    if (typeof input.prompt!=='string' || !input.prompt.trim() || input.prompt.length>1000) throw new BadRequestException('请填写 1–1000 字的头像描述');
    if (typeof input.model!=='string' || !Object.prototype.hasOwnProperty.call(MODEL_SIZES,input.model)) throw new BadRequestException('不支持该生图模型');
    if (this.active.has(actor.id)) throw new ConflictException('已有头像正在生成，请稍候');
    this.active.add(actor.id);
    try {
      const provider=(await this.providers()).find(p=>p.id===input.providerId);
      if (!provider) throw new BadRequestException('生图供应商不可用，请重新选择');
      if(!provider.models.some(m=>m.enabled && m.modelId===input.model && modelPurpose(m)==='image'))throw new BadRequestException('生图模型未在模型管理中启用或已被停用');
      if (!(await this.available(provider)).includes(input.model)) throw new BadRequestException('该模型已不可用，请重新选择');
      const {apiKey}=resolveChatProviderConfiguration(provider);
      const response=await axios.post('https://api.siliconflow.cn/v1/images/generations',{
        model:input.model,prompt:`生成一张精致的正方形应用头像，主体居中，适合小尺寸展示，无文字。${input.prompt.trim()}`,
        image_size:MODEL_SIZES[input.model],num_inference_steps:input.model==='Qwen/Qwen-Image'?50:20,
      },{headers:{Authorization:`Bearer ${apiKey}`},timeout:120000,maxRedirects:0,maxContentLength:1024*1024});
      let url: URL;
      try {url=new URL(response.data?.images?.[0]?.url);}
      catch {throw new BadGatewayException('供应商未返回有效图片地址');}
      // The vendor's own image storage only; no arbitrary URL fetch, auth forwarding or redirects.
      if (url.origin!=='https://s3.siliconflow.cn' || url.username || url.password) throw new BadGatewayException('供应商返回了不受支持的图片地址');
      const image=await axios.get<ArrayBuffer>(url.href,{responseType:'arraybuffer',timeout:30000,maxRedirects:0,maxContentLength:10*1024*1024});
      const buffer=await sharp(Buffer.from(image.data),{limitInputPixels:40_000_000}).rotate().resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).png().toBuffer();
      if(buffer.length>5*1024*1024) throw new BadGatewayException('生成图片过大，请重新生成');
      return {base64:buffer.toString('base64'),mimeType:'image/png',model:input.model};
    } catch(error) {
      if (error instanceof BadRequestException || error instanceof BadGatewayException) throw error;
      // Do not serialize Axios errors: they contain the provider authorization header.
      const status=axios.isAxiosError(error)?error.response?.status:undefined;
      if(status===402) throw new ServiceUnavailableException('生图供应商余额不足，请联系管理员');
      if(status===401 || status===403) throw new ServiceUnavailableException('生图供应商密钥或模型权限不可用');
      if(status===429) throw new ServiceUnavailableException('生图服务繁忙，请稍后再试');
      throw new BadGatewayException('头像生成失败或超时，请稍后重试');
    } finally {this.active.delete(actor.id);}
  }
}
