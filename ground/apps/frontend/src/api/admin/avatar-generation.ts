import { adminHttp } from '../http';
export interface AvatarModel {providerId:string;providerName:string;model:string;displayName?:string}
export const avatarGenerationApi={
 sync:()=>adminHttp<{registered:number;unavailableProviders:number}>('/avatar-generation/models/sync',{method:'POST'}),
 models:(signal?:AbortSignal)=>adminHttp<{models:AvatarModel[];unavailableProviders:number}>('/avatar-generation/models',{signal}),
 generate:(input:{providerId:string;model:string;prompt:string},signal?:AbortSignal)=>adminHttp<{base64:string;mimeType:string;model:string}>('/avatar-generation',{method:'POST',body:JSON.stringify(input),signal}),
};
