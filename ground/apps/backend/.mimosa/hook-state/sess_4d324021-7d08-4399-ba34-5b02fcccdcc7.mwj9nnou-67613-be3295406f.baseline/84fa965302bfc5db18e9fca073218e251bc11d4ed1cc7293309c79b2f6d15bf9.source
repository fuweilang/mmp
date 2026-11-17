import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { Response } from 'express';
import { ApplicationLog } from './application-log.service';
@Catch()
export class ApplicationExceptionFilter implements ExceptionFilter {
  constructor(private readonly log:ApplicationLog){}
  catch(error:unknown,host:ArgumentsHost):void {
    const response=host.switchToHttp().getResponse<Response>();
    const rawStatus=error instanceof HttpException ? error.getStatus() :
      error && typeof error==='object' && 'status' in error && typeof error.status==='number' ? error.status : 500;
    const status=rawStatus>=400&&rawStatus<=599?rawStatus:500;
    this.log.event(status>=500?'error':'warn','http.exception',{status,error});
    if(response.headersSent){response.end();return;}
    const body=error instanceof HttpException?error.getResponse():null;
    response.status(status).json({...(typeof body==='object'&&body!==null?body:{}),
      message:status>=500?'服务暂时不可用，请提供请求编号联系管理员':typeof body==='string'?body:body&&typeof body==='object'&&'message' in body?body.message:'请求失败',
      statusCode:status,requestId:this.log.requestId()});
  }
}
