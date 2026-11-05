import { Injectable, LoggerService, OnModuleDestroy } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

/** No bodies, headers or credentials enter operational logs. */
export function redactLog(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[TRUNCATED]';
  if (value instanceof Error) return { name:value.name, message:redactLog(value.message), stack:redactLog(value.stack) };
  if (typeof value === 'string') return value
    .replace(/Bearer\s+[^\s"']+/gi,'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[JWT REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]+/g,'[KEY REDACTED]')
    .replace(/([?&](?:token|code|password|secret|api_?key)=)[^&\s"']*/gi,'$1[REDACTED]')
    .replace(/((?:api[_-]?key|password|authorization|cookie|access[_-]?token)\s*[:=]\s*)[^\s,;]+/gi,'$1[REDACTED]')
    .slice(0,8000);
  if (Array.isArray(value)) return value.slice(0,20).map(v=>redactLog(v,depth+1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0,40).map(([key,v])=>[
    key,/password|secret|^token$|access.?token|refresh.?token|cookie|authorization|api.?key|^body$|^data$|^headers$|^messages$|^config$|^prompt$|^content$/i.test(key) ? '[REDACTED]' : redactLog(v,depth+1),
  ]));
  return typeof value === 'bigint' ? value.toString() : value;
}

@Injectable()
export class ApplicationLog implements LoggerService, OnModuleDestroy {
  private readonly context = new AsyncLocalStorage<{requestId:string}>();
  private readonly directory = resolve(process.env.LOG_DIR || '.logs/backend');
  private readonly retention = Math.max(1,Number(process.env.LOG_RETENTION_DAYS)||14);
  private queue: Promise<void> = Promise.resolve();
  private day = '';
  requestId(): string | undefined { return this.context.getStore()?.requestId; }
  runRequest<T>(operation:(id:string)=>T):T { const requestId=randomUUID(); return this.context.run({requestId},()=>operation(requestId)); }
  event(level:'info'|'warn'|'error'|'debug', event:string, fields:Record<string,unknown> = {}):void {
    const line=JSON.stringify(redactLog({time:new Date().toISOString(),level,event,requestId:this.requestId(),...fields}));
    if (level==='error') console.error(line); else console.log(line);
    const day=new Date().toISOString().slice(0,10);
    this.queue=this.queue.then(async()=>{
      if(this.day!==day){
        await mkdir(this.directory,{recursive:true,mode:0o700});
        const cutoff=Date.now()-this.retention*86400000;
        for(const file of await readdir(this.directory)) if(/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(file)&&Date.parse(file.slice(0,10))<cutoff) await unlink(resolve(this.directory,file));
        this.day=day;
      }
      await appendFile(resolve(this.directory,`${day}.jsonl`),line+'\n',{mode:0o600});
    }).catch(()=>{console.error('Application log file unavailable; structured logs continue on stderr/stdout.');});
  }
  log(message:unknown,...details:unknown[]):void{this.event('info','application',{message,details});}
  warn(message:unknown,...details:unknown[]):void{this.event('warn','application',{message,details});}
  error(message:unknown,...details:unknown[]):void{this.event('error','application',{message,details});}
  debug(message:unknown,...details:unknown[]):void{this.event('debug','application',{message,details});}
  verbose(message:unknown,...details:unknown[]):void{this.debug(message,...details);}
  async onModuleDestroy(){await this.queue;}
}
