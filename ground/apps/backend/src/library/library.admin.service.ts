import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma, type LibraryNode, type LibraryVersion, type User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FILE_PURGE_BLOCKED_REASON, LibraryError, libraryNotFound } from './library.errors';
import { LibraryService } from './library.service';
import { PrismaLibraryStore } from './library.prisma-store';
import type { Actor } from './library.types';
import type { AdminLibraryQuery, AdminLibraryCreate, AdminLibraryCommand, AdminLibraryContext, AdminLibraryScopeImpactQuery } from './library.admin.dto';
type Platform = Pick<User, 'id'|'isPlatformAdmin'>;
type Upload = { originalname: string; mimetype: string; buffer: Buffer };
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const brief = (v: LibraryVersion) => ({id:v.id,versionNo:v.versionNo,originalName:v.originalName,mimeType:v.mimeType,sizeBytes:v.sizeBytes,parseStatus:v.parseStatus,parseReason:v.parseReason,createdAt:v.createdAt.toISOString(),createdByUserId:v.createdByUserId});
function fileType(node: LibraryNode, v?: LibraryVersion) {
 if(node.kind==='FOLDER')return 'folder'; if(node.kind==='LINK')return 'link'; const mime=(v?.mimeType??'').toLowerCase().split(';')[0];
 if(mime.startsWith('image/'))return 'image';if(mime.startsWith('video/'))return 'video';if(mime==='application/pdf')return 'pdf';
 if(mime.includes('word')||mime==='application/msword')return 'word';if(mime.includes('spreadsheet')||mime.includes('excel'))return 'excel';if(mime.includes('presentation')||mime.includes('powerpoint'))return 'ppt';if(mime.startsWith('text/'))return 'text';return 'other';
}
@Injectable()
export class LibraryAdminService {
 constructor(private readonly prisma: PrismaService) {}
 private platform(user: Platform) { if(!user.isPlatformAdmin)throw new LibraryError(403,'只有平台管理员可管理企业资料','FORBIDDEN'); }
 private async tenant(db: Prisma.TransactionClient, id: string, write=false) { const tenant=await db.tenant.findUnique({where:{id},select:{id:true,name:true,status:true}});if(!tenant)throw libraryNotFound();if(write&&tenant.status!=='active')throw new LibraryError(409,'企业已停用，只允许查看','TENANT_INACTIVE');return tenant; }
 private actor(user: Platform, tenantId: string): Actor { return {userId:user.id,tenantId,isPlatformAdmin:true,isOrgAdmin:false,activeMember:false,libraryAdmin:true}; }
 async tenants(user: Platform, query: AdminLibraryQuery) {
  this.platform(user); const where: Prisma.TenantWhereInput=query.q?.trim()?{name:{contains:query.q.trim(),mode:'insensitive'}}:{};
  const [total,tenants]=await Promise.all([this.prisma.tenant.count({where}),this.prisma.tenant.findMany({where,skip:(query.page-1)*query.pageSize,take:query.pageSize,orderBy:[{name:'asc'},{id:'asc'}],select:{id:true,name:true,status:true}})]);
  const items=[];
  for(const t of tenants) {const nodes=await this.prisma.libraryNode.findMany({where:{tenantId:t.id},select:{kind:true,state:true,scope:true,ownerUserId:true,currentVersionId:true}});const versions=await this.prisma.libraryVersion.findMany({where:{tenantId:t.id,node:{state:{not:'PURGED'}}},select:{id:true,sizeBytes:true,parseStatus:true}});const current=new Set(nodes.filter(n=>n.state==='ACTIVE').map(n=>n.currentVersionId));items.push({...t,memberCount:new Set(nodes.filter(n=>n.state==='ACTIVE'&&n.kind==='FILE').map(n=>n.ownerUserId)).size,sharedFiles:nodes.filter(n=>n.state==='ACTIVE'&&n.kind==='FILE'&&n.scope==='ENTERPRISE').length,activeFiles:nodes.filter(n=>n.kind==='FILE'&&n.state==='ACTIVE').length,folderCount:nodes.filter(n=>n.kind==='FOLDER'&&n.state==='ACTIVE').length,linkCount:nodes.filter(n=>n.kind==='LINK'&&n.state==='ACTIVE').length,recycledCount:nodes.filter(n=>n.state==='RECYCLED').length,usedBytes:versions.reduce((sum,v)=>sum+v.sizeBytes,0),failed:versions.filter(v=>current.has(v.id)&&v.parseStatus==='FAILED').length});}
  return {items,total,page:query.page,pageSize:query.pageSize};
 }
 async options(user: Platform, tenantId: string) {
  this.platform(user);const tenant=await this.tenant(this.prisma,tenantId);
  const members=await this.prisma.orgMember.findMany({where:{tenantId,user:{status:'active'}},select:{user:{select:{id:true,name:true,phone:true}}}});
  const memberFiles=await this.prisma.libraryNode.findMany({where:{tenantId,kind:'FILE',state:'ACTIVE'},select:{ownerUserId:true}});
  const folders=await this.prisma.libraryNode.findMany({where:{tenantId,kind:'FOLDER',state:'ACTIVE'}});
  const ownerIds=await this.prisma.libraryNode.findMany({where:{tenantId,state:{not:'PURGED'}},distinct:['ownerUserId'],select:{ownerUserId:true}});const filterOwners=await this.prisma.user.findMany({where:{id:{in:ownerIds.map(n=>n.ownerUserId)}},select:{id:true,name:true}});
  return {tenant,members:members.map(m=>({...m.user,fileCount:memberFiles.filter(n=>n.ownerUserId===m.user.id).length})),filterOwners,filterFolders:folders.map(f=>({id:f.id,name:f.name,parentId:f.parentId})),limits:new LibraryService(new PrismaLibraryStore(this.prisma)).limitsView(),owners:members.map(m=>m.user),folders:folders.map(n=>({id:n.id,name:n.name,parentId:n.parentId,ownerUserId:n.ownerUserId,scope:n.scope}))};
 }
 async items(user: Platform, tenantId: string, query: AdminLibraryQuery) {
  this.platform(user);const tenant=await this.tenant(this.prisma,tenantId);const canWrite=tenant.status==='active';
  const nodes=await this.prisma.libraryNode.findMany({where:{tenantId,state:{not:'PURGED'}},orderBy:[{updatedAt:'desc'},{id:'asc'}]});
  const versions=await this.prisma.libraryVersion.findMany({where:{tenantId,id:{in:nodes.flatMap(n=>n.currentVersionId?[n.currentVersionId]:[])}}});const byVersion=new Map(versions.map(v=>[v.id,v]));
  const byId=new Map(nodes.map(n=>[n.id,n]));const owners=await this.prisma.user.findMany({where:{id:{in:[...new Set(nodes.map(n=>n.ownerUserId))]}},select:{id:true,name:true}});const byOwner=new Map(owners.map(o=>[o.id,o.name]));
  const state=query.state??'ACTIVE';
  const matched=nodes.filter(n=>{const v=byVersion.get(n.currentVersionId??'');return n.state===state&&(!query.scope||n.scope===query.scope)&&(!query.ownerUserId||n.ownerUserId===query.ownerUserId)&&(!query.folderId||n.parentId===query.folderId)&&(!query.q||n.name.toLocaleLowerCase().includes(query.q.trim().toLocaleLowerCase()))&&(!query.fileType||fileType(n,v)===query.fileType)&&(!query.status||v?.parseStatus===query.status);});
  const folderIds=new Set(nodes.filter(n=>n.state===state&&n.kind==='FOLDER'&&(!query.ownerUserId||n.ownerUserId===query.ownerUserId)).map(n=>n.id));
  const filtered=query.layer==='children'&&!query.folderId?matched.filter(n=>!n.parentId||!folderIds.has(n.parentId)):matched;
  const rows=filtered.slice((query.page-1)*query.pageSize,query.page*query.pageSize).map(n=>{
   const v=byVersion.get(n.currentVersionId??'');
   const path:string[]=[];const seen=new Set([n.id]);let parent=byId.get(n.parentId??'');while(parent&&!seen.has(parent.id)&&path.length<32){path.unshift(parent.name);seen.add(parent.id);parent=byId.get(parent.parentId??'');}
<<<<<<< HEAD
   return {id:n.id,name:n.name,kind:n.kind,scope:n.scope,state:n.state,parentId:n.parentId,parentPath:path,ownerUserId:n.ownerUserId,ownerName:byOwner.get(n.ownerUserId)??null,updatedAt:n.updatedAt.toISOString(),currentVersion:v?brief(v):null,fileType:fileType(n,v),canRead:true,canWrite,purgeBlockedReason:n.kind==='FILE'?'无法核实任务活动使用，暂不开放文件彻底删除；可回收并恢复。':null};
=======
   const targetScope=n.scope==='PRIVATE'?'ENTERPRISE':'PRIVATE';const target={...n,scope:targetScope} as LibraryNode;const scopeGrant=grants.find(g=>g.powers==='CRUD'&&this.covers(user,target,g));
   return {id:n.id,name:n.name,kind:n.kind,scope:n.scope,state:n.state,parentId:n.parentId,parentPath:path,ownerUserId:n.ownerUserId,ownerName:byOwner.get(n.ownerUserId)??null,updatedAt:n.updatedAt.toISOString(),currentVersion:v?brief(v):null,fileType:fileType(n,v),readGrantId:read?.id??null,writeGrantId:write?.id??null,targetScopeGrantId:scopeGrant?.id??null,purgeBlockedReason:n.kind==='FILE'?FILE_PURGE_BLOCKED_REASON:null};
>>>>>>> origin/4.0
  });return {items:rows,total:filtered.length,page:query.page,pageSize:query.pageSize};
 }
 async detail(user: Platform, tenantId: string, nodeId: string) {
  this.platform(user);const node=await this.prisma.libraryNode.findFirst({where:{id:nodeId,tenantId,state:{not:'PURGED'}}});if(!node)throw libraryNotFound();
  const versions=await this.prisma.libraryVersion.findMany({where:{nodeId,tenantId},orderBy:{versionNo:'desc'},take:100});const total=await this.prisma.libraryVersion.count({where:{nodeId,tenantId}});
  const audit=await this.prisma.auditLog.findMany({where:{tenantId,action:'library_admin_result',meta:{path:['nodeId'],equals:nodeId}},orderBy:{createdAt:'desc'},take:30,select:{id:true,userId:true,meta:true,createdAt:true}});
  return {versions:versions.map(brief),versionCount:total,versionsTruncated:total>versions.length,audit};
 }
 async scopeImpact(user: Platform, tenantId: string, nodeId: string, query: AdminLibraryScopeImpactQuery) {
  this.platform(user);
  return this.prisma.$transaction(async tx => {
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'library-tree:' + tenantId}))`;
   await this.tenant(tx,tenantId,true);
   const domain = new LibraryService(new PrismaLibraryStore(tx));
   return domain.scopeImpact(this.actor(user,tenantId),nodeId,query.scope);
  },{maxWait:10000,timeout:60000});
 }
 private async lockNode(tx: Prisma.TransactionClient, tenantId: string, id: string) {await tx.$queryRaw`SELECT id FROM library_node WHERE id=${id} AND tenant_id=${tenantId} FOR UPDATE`;const node=await tx.libraryNode.findFirst({where:{id,tenantId}});if(!node||node.state==='PURGED')throw libraryNotFound();return node;}
 private async owner(tx: Prisma.TransactionClient, tenantId: string, id: string) {const owner=await tx.orgMember.findUnique({where:{userId_tenantId:{userId:id,tenantId}},select:{user:{select:{status:true,isPlatformAdmin:true}}}});if(!owner||owner.user.status!=='active')throw new LibraryError(400,'所有者必须是此企业的有效成员','BAD_OWNER');}
 private async parent(tx: Prisma.TransactionClient,tenantId:string,parentId:string|undefined,ownerUserId:string) {if(!parentId)return;const p=await this.lockNode(tx,tenantId,parentId);if(p.kind!=='FOLDER'||p.state!=='ACTIVE'||p.ownerUserId!==ownerUserId)throw new LibraryError(403,'目标目录必须是该所有者的有效文件夹','BAD_PARENT');}
 private async busy(tx:Prisma.TransactionClient,node:LibraryNode) {if(!node.currentVersionId)return;const v=await tx.libraryVersion.findUnique({where:{id:node.currentVersionId},select:{parseStatus:true}});if(v&&['PENDING','PROCESSING'].includes(v.parseStatus))throw new LibraryError(409,'资料正在处理，请完成后再操作','BUSY');}
 private snapshot(n: LibraryNode|null) {return n?{id:n.id,ownerUserId:n.ownerUserId,parentId:n.parentId,name:n.name,scope:n.scope,state:n.state,currentVersionId:n.currentVersionId,updatedAt:n.updatedAt.toISOString()}:null;}
 private async operation(user: Platform, tenantId: string, input: AdminLibraryContext, action: string, nodeId: string|null, payload: object, work:(tx:Prisma.TransactionClient,domain:LibraryService,actor:Actor)=>Promise<{nodeId:string;versionId?:string|null}>) {
  this.platform(user);await this.tenant(this.prisma,tenantId);const requestHash=hash(JSON.stringify({action,nodeId,payload}));
  try {return await this.prisma.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'library-tree:' + tenantId}))`;await this.tenant(tx,tenantId,true);await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'library-admin-request:'+user.id+':'+tenantId+':'+input.requestId}))`;
   const prior=await tx.auditLog.findFirst({where:{tenantId,userId:user.id,action:'library_admin_result',meta:{path:['requestId'],equals:input.requestId}},orderBy:[{createdAt:'asc'},{id:'asc'}]});
   if(prior?.meta&&typeof prior.meta==='object'&&!Array.isArray(prior.meta)) {const m=prior.meta;if(m.requestHash!==requestHash)throw new LibraryError(409,'同一请求标识不能用于不同操作','REQUEST_CONFLICT');if(m.success===true&&typeof m.resultNodeId==='string')return {nodeId:m.resultNodeId,versionId:typeof m.resultVersionId==='string'?m.resultVersionId:null,replayed:true};}
   const before=nodeId?await this.lockNode(tx,tenantId,nodeId):null;
   const result=await work(tx,new LibraryService(new PrismaLibraryStore(tx), undefined, () => Math.max(Date.now(), (before?.updatedAt.getTime() ?? 0) + 1)),this.actor(user,tenantId));
   const after=await tx.libraryNode.findFirst({where:{id:result.nodeId,tenantId}});
   await tx.auditLog.create({data:{tenantId,userId:user.id,action:'library_admin_result',meta:{requestId:input.requestId,requestHash,operation:action,nodeId:result.nodeId,originalOwnerUserId:before?.ownerUserId??null,ownerUserId:after?.ownerUserId??null,reason:input.reason??'',success:true,before:this.snapshot(before),after:this.snapshot(after),resultNodeId:result.nodeId,resultVersionId:result.versionId??after?.currentVersionId??null}}});return {...result,replayed:false};
  },{maxWait:10000,timeout:60000});} catch(error) {
   await this.prisma.auditLog.create({data:{tenantId,userId:user.id,action:'library_admin_result',meta:{requestId:input.requestId,requestHash,operation:action,nodeId,reason:input.reason??'',success:false,code:error instanceof LibraryError?error.code:'OPERATION_FAILED'}}});throw error;
  }
 }
 async create(user:Platform,tenantId:string,input:AdminLibraryCreate,file?:Upload) {
  const payload={...input,file:file?{name:file.originalname,mime:file.mimetype,sha256:hash(file.buffer)}:null};
  return this.operation(user,tenantId,input,file?'upload':'folder',null,payload,async(tx,domain,actor)=>{
   await this.owner(tx,tenantId,input.ownerUserId);await this.parent(tx,tenantId,input.parentId,input.ownerUserId);
   if(input.scope==='ENTERPRISE'&&input.confirmShare!==true)throw new LibraryError(400,'企业共享需要明确确认','CONFIRM_SHARE');
   const result=file?await domain.uploadOwned(actor,input.ownerUserId,{originalName:file.originalname,mimeType:file.mimetype,bytes:file.buffer,parentId:input.parentId,scope:input.scope,confirmShare:input.confirmShare}):await domain.createOwnedFolder(actor,input.ownerUserId,input.name??'',input.parentId,input.scope);
   return {nodeId:result.id,versionId:result.currentVersion?.id??null};
  });
 }
 async command(user:Platform,tenantId:string,input:AdminLibraryCommand,file?:Upload) {
  return this.operation(user,tenantId,input,input.action,input.nodeId,{...input,file:file?{name:file.originalname,mime:file.mimetype,sha256:hash(file.buffer)}:null},async(tx,domain,actor)=>{
   const node=await this.lockNode(tx,tenantId,input.nodeId);
   if(node.updatedAt.getTime()!==Date.parse(input.expectedUpdatedAt)||(input.expectedVersionId!==undefined&&node.currentVersionId!==input.expectedVersionId))throw new LibraryError(409,'资料已更新，请刷新后重试','VERSION_CONFLICT');
   if(!['restore','purge'].includes(input.action)&&node.state!=='ACTIVE')throw new LibraryError(409,'资料不在使用中','BAD_STATE');
   if(['replace','recycle','purge','retry'].includes(input.action))await this.busy(tx,node);
   if(input.action==='rename')await domain.rename(actor,node.id,input.name??'');
   else if(input.action==='move'){await this.parent(tx,tenantId,input.parentId,node.ownerUserId);await domain.move(actor,node.id,input.parentId||null,{confirmShare:input.confirmShare,expectedTreeRevision:input.expectedTreeRevision});}
   else if(input.action==='scope') {if(!input.scope)throw new LibraryError(400,'缺少目标可见范围','BAD_SCOPE');await domain.setScope(actor,node.id,input.scope,input.confirmShare,{confirmUnshare:input.confirmUnshare,expectedTreeRevision:input.expectedTreeRevision});}
   else if(input.action==='recycle')await domain.recycle(actor,node.id);
   else if(input.action==='restore'){if(node.parentId){const parent=await tx.libraryNode.findUnique({where:{id:node.parentId}});if((!parent||parent.state==='PURGED')&&input.confirmMissingParent!==true)throw new LibraryError(409,'原目录已不存在，请明确确认恢复到当前企业根目录','CONFIRM_RESTORE');}await domain.restore(actor,node.id);}
   else if(input.action==='purge'){if(input.confirmPurge!==true)throw new LibraryError(400,'请确认永久删除','CONFIRM_PURGE');await domain.purge(actor,node.id);}
   else if(input.action==='retry')await domain.retryParse(actor,node.id);
   else if(input.action==='replace'){if(!file)throw new LibraryError(400,'请选择替换文件','NO_FILE');await domain.replaceVersion(actor,node.id,file.originalname,file.mimetype,file.buffer);}
   const current=await tx.libraryNode.findUnique({where:{id:node.id}});return {nodeId:node.id,versionId:current?.currentVersionId??null};
  });
 }
 async content(user:Platform,tenantId:string,nodeId:string,versionId?:string,download=false,inline=false) {
  this.platform(user);return this.prisma.$transaction(async tx=>{await this.tenant(tx,tenantId);await this.lockNode(tx,tenantId,nodeId);const domain=new LibraryService(new PrismaLibraryStore(tx));const actor=this.actor(user,tenantId);return download?domain.download(actor,nodeId,versionId,inline):domain.preview(actor,nodeId,versionId);},{timeout:60000});
 }
 async impact(user:Platform,tenantId:string,nodeId:string) {
  this.platform(user);const node=await this.prisma.libraryNode.findFirst({where:{id:nodeId,tenantId}});if(!node)throw libraryNotFound();const [versions,children]=await Promise.all([this.prisma.libraryVersion.aggregate({where:{nodeId,tenantId},_count:true,_sum:{sizeBytes:true}}),this.prisma.libraryNode.count({where:{tenantId,parentId:nodeId,state:{in:['ACTIVE','RECYCLED']}}})]);return {nodeId,versionCount:versions._count,bytes:versions._sum.sizeBytes??0,children,referenceStatus:'UNVERIFIED',activeUseStatus:'UNVERIFIED',canPurge:node.state==='RECYCLED'&&node.kind!=='FILE'&&children===0,blockedReason:node.kind==='FILE'?FILE_PURGE_BLOCKED_REASON:children?'目录非空，请先处理子项':node.state!=='RECYCLED'?'请先移入回收站':null};
 }
}
