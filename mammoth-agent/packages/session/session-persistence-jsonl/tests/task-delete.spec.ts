/** t166: real compressed native persistence, isolated temp tasks only; no user history. */
import {Context} from '@mammoth-ai/cordis'
import {it,expect,onTestFinished} from 'vitest'
import {mkdtemp,mkdir,writeFile,readFile,rm,rename,symlink} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {SessionId,SESSION_FORMAT_VERSION} from '@mammoth-ai/mmp-session'
import * as Persistence from '../src/index.ts'
import {sessionDir,generationLogPath} from '../src/format.ts'
async function fixture(){const root=await mkdtemp(join(tmpdir(),'mmp-t166-delete-')),ctx=new Context();await ctx.plugin(Persistence,{root:join(root,'logs'),compression:'zstd'});onTestFinished(async()=>{await ctx.fiber.dispose();await rm(root,{recursive:true,force:true})});return {root,ctx,p:ctx.sessionPersistence}}
const header=(id:string)=>({id:SessionId(id),version:SESSION_FORMAT_VERSION,createdAt:0,isSeeded:false})
it('t166 delete refuses an active writer, removes only canonical owned logs and retains unrelated/shared files and another task',async()=>{
 const f=await fixture(),a=header('t166-delete-a'),b=header('t166-retain-b'),ha=await f.p.create(a),hb=await f.p.create(b)
 await ha.flush();await hb.flush();await expect(f.p.remove(a.id)).rejects.toThrow();await ha.close();await hb.close()
 const ownDir=sessionDir(join(f.root,'logs'),undefined,a.id),unknown=join(ownDir,'user-file.txt'),source=join(f.root,'workspace','source.txt'),shared=join(f.root,'attachments','shared.txt')
 await mkdir(join(f.root,'workspace'));await mkdir(join(f.root,'attachments'));for(const file of [unknown,source,shared])await writeFile(file,'DO NOT DELETE')
 const before=await f.p.stat(b.id);expect(before).toBeDefined();await f.p.remove(a.id);expect(await f.p.stat(a.id)).toBeUndefined();expect(await f.p.stat(b.id)).toEqual(before)
 for(const file of [unknown,source,shared])expect(await readFile(file,'utf8')).toBe('DO NOT DELETE')
 await expect(f.p.remove(SessionId('../escape'))).rejects.toThrow()
})
it('t166 delete refuses a replaced symlink log rather than following or deleting the target',async()=>{
 const f=await fixture(),a=header('t166-link-a'),b=header('t166-link-b');for(const h of [a,b]){const handle=await f.p.create(h);await handle.flush();await handle.close()}
 const aPath=generationLogPath(join(f.root,'logs'),undefined,a.id,SESSION_FORMAT_VERSION,'zstd'),bPath=generationLogPath(join(f.root,'logs'),undefined,b.id,SESSION_FORMAT_VERSION,'zstd'),before=await readFile(bPath)
 await rename(aPath,aPath+'.owned-backup');await symlink(bPath,aPath);await expect(f.p.remove(a.id)).rejects.toThrow();expect(await readFile(bPath)).toEqual(before);expect(await readFile(aPath+'.owned-backup')).toBeDefined()
})
