import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ApplicationLog } from './logging/application-log.service';
type AuthedRequest=Request & {user?:{id?:string;tenantId?:string|null};tenantId?:string|null};
@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  constructor(private readonly log:ApplicationLog){}
  use(req:AuthedRequest,res:Response,next:NextFunction):void {
    this.log.runRequest(requestId=>{
      const started=performance.now();
      res.setHeader('X-Request-Id',requestId);
      const path=(req.originalUrl||req.url||'').split('?')[0];
      this.log.event('info','http.start',{method:req.method,path});
      let finished=false;
      const finish=(aborted:boolean)=>{
        if(finished)return;finished=true;
        this.log.event(res.statusCode>=500||aborted?'error':res.statusCode>=400?'warn':'info','http.finish',{
          requestId,method:req.method,path,status:res.statusCode,durationMs:Math.round(performance.now()-started),
          userId:req.user?.id,tenantId:req.tenantId??req.user?.tenantId,aborted,
        });
      };
      res.once('finish',()=>finish(false));res.once('close',()=>finish(!res.writableFinished));
      next();
    });
  }
}
