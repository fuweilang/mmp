/** Managed-object capability profile, NOT a full local-machine sandbox. */
export const GALLERY_EXECUTION_POLICY=Object.freeze({policyVersion:'gallery-v3-managed-documents-1',available:true,
 allowedTools:['skill','create_document','read_uploaded_text','read_skill_reference'] as readonly string[],
 unavailable:['arbitrary filesystem','shell','MCP','subtasks','network','external side effects'] as readonly string[],
 reasonCode:'GALLERY_CAPABILITY_UNAVAILABLE',reason:'当前安全范围：会话上传文本、受管文档产出、已绑定技能资源；任意路径／Shell／MCP／出网／外部副作用未开放。'})
export function assertGalleryExecutionReady():void { /* readiness is checked against real native services at create */ }
export function galleryExecutionIsAvailable():boolean{return true}
