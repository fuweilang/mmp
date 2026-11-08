import { BadRequestException, Body, Controller, Get, Header, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentTenantId, CurrentUser } from '../auth/current-user';
import { JwtGuard } from '../auth/jwt.guard';
import { PrismaService } from '../prisma/prisma.service';
import { OfficialAgentService } from './official-agent.service';
import { OfficialSkillService } from '../official-skill/official-skill.service';
class PreferenceWrite {
 @IsIn(['expert','skill']) kind!: 'expert'|'skill';
 @IsString() @MaxLength(256) resourceId!: string;
 @IsIn(['favourite','used']) action!: 'favourite'|'used';
 @IsOptional() @IsBoolean() favourite?: boolean;
 @IsOptional() @IsString() @MaxLength(256) expectedScope?:string;
 @IsOptional() @IsString() @MaxLength(256) expectedUserId?:string;
}
/** References, isolated by authenticated user and verified active tenant, never browser-global storage. */
@Controller('official-agents/catalog-preferences')
@UseGuards(JwtGuard)
export class CatalogPreferenceController {
 constructor(private db:PrismaService,private experts:OfficialAgentService,private skills:OfficialSkillService){}
 private async scope(user:User,tenantId:string|null){
  if(tenantId&&!user.isPlatformAdmin&&!await this.db.orgMember.findFirst({where:{userId:user.id,tenantId}}))throw new BadRequestException('当前企业成员权限不可用');
  return tenantId ? `tenant:${tenantId}` : 'personal';
 }
 @Get('scope') @Header('Cache-Control','private, no-store')
 async currentScope(@CurrentUser() user:User,@CurrentTenantId() tenantId:string|null){return {userId:user.id,scope:await this.scope(user,tenantId)};}
 @Get() @Header('Cache-Control','private, no-store')
 async list(@CurrentUser() user:User,@CurrentTenantId() tenantId:string|null,@Query('kind') kind:string,@Query('view') view:string){
  if(!['expert','skill'].includes(kind)||!['favourites','recent'].includes(view))throw new BadRequestException('无效的常用/最近类型');
  const scope=await this.scope(user,tenantId);
  return this.db.officialCatalogPreference.findMany({where:{scope,userId:user.id,kind,...view==='favourites'?{favourite:true}:{lastUsedAt:{not:null}}},orderBy:[{lastUsedAt:'desc'},{updatedAt:'desc'},{resourceId:'asc'}],take:256,select:{kind:true,resourceId:true,favourite:true,lastUsedAt:true}});
 }
 @Post() @HttpCode(200) @Header('Cache-Control','private, no-store')
 async write(@CurrentUser() user:User,@CurrentTenantId() tenantId:string|null,@Body() dto:PreferenceWrite){
  const scope=await this.scope(user,tenantId),where={scope_userId_kind_resourceId:{scope,userId:user.id,kind:dto.kind,resourceId:dto.resourceId}};
  if((dto.expectedScope!==undefined&&dto.expectedScope!==scope)||(dto.expectedUserId!==undefined&&dto.expectedUserId!==user.id))throw new BadRequestException('任务所属企业或用户已变更');
  if(dto.action==='favourite'&&typeof dto.favourite!=='boolean')throw new BadRequestException('请明确收藏或取消');
  // Removing a stale reference remains possible after unpublish/revoke, but cannot grant new use.
  if(dto.action==='favourite'&&dto.favourite===false){await this.db.officialCatalogPreference.updateMany({where:{scope,userId:user.id,kind:dto.kind,resourceId:dto.resourceId},data:{favourite:false}});return {ok:true};}
  if(dto.kind==='expert')await this.experts.catalogCard(user,dto.resourceId);else await this.skills.catalogDetail(user,dto.resourceId);
  const data=dto.action==='used'?{lastUsedAt:new Date()}:{favourite:true};
  await this.db.officialCatalogPreference.upsert({where,create:{scope,userId:user.id,kind:dto.kind,resourceId:dto.resourceId,...data},update:data});
  return {ok:true};
 }
}
