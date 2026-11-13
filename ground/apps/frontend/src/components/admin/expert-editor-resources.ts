import type { InjectionKey } from 'vue';
import { adminKnowledgeCoreApi as api, adminLlmProviderApi } from '../../api/admin';

async function fetchResources() {
  const [catalog, profiles, providers] = await Promise.all([api.editorCatalog(),api.profiles(),adminLlmProviderApi.list()]);
  const health=Object.fromEntries(await Promise.all(profiles.filter(p=>p.enabled).map(async profile=>{
    try {return [profile.id,(await api.health(profile.id)).configured] as const;}
    catch {return [profile.id,false] as const;}
  })));
  return {catalog,profiles,providers,health};
}
export type ExpertEditorResources = Awaited<ReturnType<typeof fetchResources>>;
/** Page-owned cache: coalesce the two panels and prefetch without sharing data across sign-ins. */
export function createExpertEditorResources() {
  let value: ExpertEditorResources | undefined;
  let pending: {version:number;promise:Promise<ExpertEditorResources>} | undefined;
  let version=0;
  let updatedAt=0;
  const store = {
    peek:()=>value,
    invalidate:()=>{version++;updatedAt=0;},
    async load(force=false):Promise<ExpertEditorResources> {
      if (pending?.version===version) return pending.promise;
      if (value && !force && Date.now()-updatedAt<30_000) return value;
      const revision=version;
      const promise=fetchResources().then(result=>{
        if(revision!==version) return store.load();
        value=result;updatedAt=Date.now();return result;
      },error=>{
        if(revision!==version) return store.load();
        throw error;
      }).finally(()=>{if(pending?.promise===promise) pending=undefined;});
      pending={version:revision,promise};
      return promise;
    },
  };
  return store;
}
export const expertEditorResourcesKey: InjectionKey<ReturnType<typeof createExpertEditorResources>>=Symbol('expert-editor-resources');
