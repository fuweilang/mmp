import { BadRequestException, Body, Controller, Get, Param, Post, Query, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { User } from '@prisma/client';
import type { Response } from 'express';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user';
import { LibraryAdminService } from './library.admin.service';
import { AdminLibraryCommand, AdminLibraryCreate, AdminLibraryQuery } from './library.admin.dto';
import { libraryUploadLimit } from './library.dto';
import { LibraryError } from './library.errors';
import { HttpException } from '@nestjs/common';
type Upload={originalname:string;mimetype:string;buffer:Buffer};
function filename(name:string){if([...name].some(char=>char.charCodeAt(0)>255))return name;const restored=Buffer.from(name,'latin1').toString('utf8');return restored.includes('\uFFFD')?name:restored;}
@Controller('library/admin')
@UseGuards(JwtGuard)
export class LibraryAdminController {
 constructor(private readonly admin:LibraryAdminService){}
 private async run<T>(fn:()=>Promise<T>){try{return await fn();}catch(error){if(error instanceof LibraryError)throw new HttpException({message:error.message,code:error.code},error.status);throw error;}}
 @Get('tenants') tenants(@CurrentUser() user:User,@Query() query:AdminLibraryQuery){return this.run(()=>this.admin.tenants(user,query));}
 @Get('tenants/:tenantId/options') options(@CurrentUser() user:User,@Param('tenantId') id:string){return this.run(()=>this.admin.options(user,id));}
 @Get('tenants/:tenantId/items') items(@CurrentUser() user:User,@Param('tenantId') id:string,@Query() query:AdminLibraryQuery){return this.run(()=>this.admin.items(user,id,query));}
 @Get('tenants/:tenantId/nodes/:id') detail(@CurrentUser() user:User,@Param('tenantId') tenant:string,@Param('id') id:string){return this.run(()=>this.admin.detail(user,tenant,id));}
 @Get('tenants/:tenantId/nodes/:id/impact') impact(@CurrentUser() user:User,@Param('tenantId') tenant:string,@Param('id') id:string){return this.run(()=>this.admin.impact(user,tenant,id));}
 @Get('tenants/:tenantId/nodes/:id/preview') preview(@CurrentUser() user:User,@Param('tenantId') tenant:string,@Param('id') id:string,@Query('grantId') grant:string,@Query('versionId') version?:string){return this.run(()=>this.admin.content(user,tenant,id,grant,version));}
 @Get('tenants/:tenantId/nodes/:id/download') async download(@CurrentUser() user:User,@Param('tenantId') tenant:string,@Param('id') id:string,@Query('grantId') grant:string,@Res() res:Response,@Query('versionId') version?:string,@Query('inline') inline?:string){const file=await this.run(()=>this.admin.content(user,tenant,id,grant,version,true,inline==='1'));if(!('bytes' in file))throw new BadRequestException('无文件可下载');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");res.setHeader('Content-Type',file.contentType);res.setHeader('Content-Disposition',`${inline==='1'?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(file.filename)}`);res.send(file.bytes);}
 @Post('tenants/:tenantId/folders') folder(@CurrentUser() user:User,@Param('tenantId') id:string,@Body() body:AdminLibraryCreate){return this.run(()=>this.admin.create(user,id,body));}
 @Post('tenants/:tenantId/files') @UseInterceptors(FilesInterceptor('files',1,{limits:{fileSize:libraryUploadLimit}})) upload(@CurrentUser() user:User,@Param('tenantId') id:string,@Body() body:AdminLibraryCreate,@UploadedFiles() files:Upload[]){const file=files?.[0];if(!file)throw new BadRequestException('请选择文件');return this.run(()=>this.admin.create(user,id,body,{...file,originalname:filename(file.originalname)}));}
 @Post('tenants/:tenantId/commands') command(@CurrentUser() user:User,@Param('tenantId') id:string,@Body() body:AdminLibraryCommand){if(body.action==='replace')throw new BadRequestException('替换需要上传文件');return this.run(()=>this.admin.command(user,id,body));}
 @Post('tenants/:tenantId/replace') @UseInterceptors(FilesInterceptor('files',1,{limits:{fileSize:libraryUploadLimit}})) replace(@CurrentUser() user:User,@Param('tenantId') id:string,@Body() body:AdminLibraryCommand,@UploadedFiles() files:Upload[]){const file=files?.[0];if(body.action!=='replace'||!file)throw new BadRequestException('请选择替换文件');return this.run(()=>this.admin.command(user,id,body,{...file,originalname:filename(file.originalname)}));}
}
