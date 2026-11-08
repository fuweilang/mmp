import { http, apiUrl, ApiError } from './http';
import type { LibraryPreview, LibraryVersion } from './library';
export type AdminVersion=Pick<LibraryVersion,'id'|'versionNo'|'mimeType'|'sizeBytes'|'parseStatus'|'parseReason'|'originalName'|'createdAt'>&{createdByUserId:string};
export type AdminTenant={id:string;name:string;status:string;activeFiles:number;folderCount:number;linkCount:number;recycledCount:number;usedBytes:number;failed:number};
export type AdminPage<T>={items:T[];total:number;page:number;pageSize:number};
export type AdminGrant={id:string;contentScope:'ENTERPRISE'|'PRIVATE_OWNER';ownerUserId:string|null;powers:'READ'|'CRUD';expiresAt:string};
export type AdminFolder={id:string;name:string;parentId:string|null;ownerUserId:string;scope:'PRIVATE'|'ENTERPRISE';grantIds:string[]};
export type AdminOptions={tenant:Pick<AdminTenant,'id'|'name'|'status'>;limits:{maxFileBytes:number;allowedExtensions:string[]};owners:{id:string;name:string|null}[];filterOwners?:{id:string;name:string|null}[];filterFolders?:{id:string;name:string;parentId:string|null}[];grants:AdminGrant[];folders:AdminFolder[]};
export type AdminItem={id:string;name:string;kind:'FILE'|'FOLDER'|'LINK';scope:'PRIVATE'|'ENTERPRISE';state:'ACTIVE'|'RECYCLED';parentId:string|null;parentPath:string[];ownerUserId:string;ownerName:string|null;updatedAt:string;currentVersion:AdminVersion|null;fileType:string;readGrantId:string|null;writeGrantId:string|null;targetScopeGrantId:string|null;purgeBlockedReason:string|null};
export type AdminTarget={ownerUserId:string;scope:'PRIVATE'|'ENTERPRISE';parentId:string;grantId:string;reason:string;confirmShare:boolean};
export type AdminContext={grantId:string;requestId:string;reason:string};
export type AdminCommand=AdminContext&{nodeId:string;action:'rename'|'move'|'scope'|'recycle'|'restore'|'purge'|'retry'|'replace';expectedUpdatedAt:string;expectedVersionId?:string;name?:string;parentId?:string;scope?:'PRIVATE'|'ENTERPRISE';targetGrantId?:string;confirmShare?:boolean;confirmPurge?:boolean;confirmMissingParent?:boolean};
export type AdminResult={nodeId:string;versionId:string|null;replayed:boolean};
export type AdminDetail={versions:AdminVersion[];versionCount:number;versionsTruncated:boolean;audit:{id:string;userId:string|null;createdAt:string;meta:{operation:string;success:boolean;reason:string;code?:string;before?:unknown;after?:unknown;grantId?:string}}[]};
export type AdminImpact={nodeId:string;versionCount:number;bytes:number;children:number;referenceStatus:'UNVERIFIED';activeUseStatus:'UNVERIFIED';canPurge:boolean;blockedReason:string|null};
const base=(tenant:string)=>`/api/library/admin/tenants/${encodeURIComponent(tenant)}`;
const query=(values:Record<string,string|number|undefined>)=>{const result=new URLSearchParams();for(const[k,v]of Object.entries(values))if(v!==undefined&&v!=='')result.set(k,String(v));return result.toString();};
export const adminLibraryTenants=(values:Record<string,string|number|undefined>)=>http<AdminPage<AdminTenant>>('/api/library/admin/tenants?'+query(values));
export const adminLibraryOptions=(tenant:string)=>http<AdminOptions>(base(tenant)+'/options');
export const adminLibraryItems=(tenant:string,values:Record<string,string|number|undefined>)=>http<AdminPage<AdminItem>>(base(tenant)+'/items?'+query(values));
export const adminLibraryDetail=(tenant:string,id:string)=>http<AdminDetail>(base(tenant)+'/nodes/'+encodeURIComponent(id));
export const adminLibraryImpact=(tenant:string,id:string)=>http<AdminImpact>(base(tenant)+'/nodes/'+encodeURIComponent(id)+'/impact');
export const adminLibraryPreview=(tenant:string,item:AdminItem,versionId?:string)=>http<LibraryPreview>(base(tenant)+'/nodes/'+encodeURIComponent(item.id)+'/preview?'+query({grantId:item.readGrantId??'',versionId:versionId??item.currentVersion?.id}));
export const adminLibraryDownload=(tenant:string,item:AdminItem,versionId?:string,inline=false)=>apiUrl(base(tenant)+'/nodes/'+encodeURIComponent(item.id)+'/download?'+query({grantId:item.readGrantId??'',versionId:versionId??item.currentVersion?.id,...(inline?{inline:'1'}:{})}));
export const adminLibraryFolder=(tenant:string,body:AdminTarget&{name:string;requestId:string})=>http<AdminResult>(base(tenant)+'/folders',{method:'POST',body:JSON.stringify({...body,parentId:body.parentId||undefined})});
export const adminLibraryCommand=(tenant:string,body:AdminCommand)=>http<AdminResult>(base(tenant)+'/commands',{method:'POST',body:JSON.stringify(body)});
/** Uses the existing cookie transport and real byte progress, not a simulated percentage. */
export function adminLibraryUpload(tenant:string,body:(AdminTarget&{requestId:string})|AdminCommand,file:File,progress:(ratio:number)=>void,replace=false):Promise<AdminResult>{
 return new Promise((resolve,reject)=>{const form=new FormData();for(const[k,v]of Object.entries(body))if(v!==undefined&&v!=='')form.append(k,String(v));form.append('files',file);const xhr=new XMLHttpRequest();xhr.open('POST',apiUrl(base(tenant)+(replace?'/replace':'/files')));xhr.withCredentials=true;xhr.upload.onprogress=event=>{if(event.lengthComputable)progress(event.loaded/event.total);};xhr.onerror=()=>reject(new ApiError(0,'请求结果未知，请先刷新核对；不要盲目重新上传。'));xhr.onload=()=>{let data:unknown;try{data=JSON.parse(xhr.responseText);}catch{reject(new ApiError(xhr.status||502,'结果无法解析，请刷新核对。'));return;}if(xhr.status<200||xhr.status>=300){const message=data&&typeof data==='object'&&'message'in data?data.message:undefined;reject(new ApiError(xhr.status,Array.isArray(message)?message.join('；'):typeof message==='string'?message:'上传失败'));return;}resolve(data as AdminResult);};xhr.send(form);});
}
