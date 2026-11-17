import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { parseSkillZip, writeSkillPackageToDisk } from '../../src/official-skill/skill-package';
async function main() {
 const root = await mkdtemp(join(tmpdir(), 'skill-adversarial-impact-')), previous = process.env.UPLOAD_DIR; process.env.UPLOAD_DIR = root;
 try {
  const zip = new JSZip(); zip.file('SKILL.md', '# Fixture'); zip.file('assets/'+'a'.repeat(256), 'data'); const bytes = await zip.generateAsync({type:'nodebuffer'});
  let longName: Record<string, unknown>;
  try {
   const parsed = await parseSkillZip(bytes);
   let storageError: string | null = null;
   try { await writeSkillPackageToDisk('impact',1,parsed,bytes) } catch (error) { storageError = error instanceof Error && 'code' in error ? String(error.code) : String(error) }
   longName = { previewRejected: false, acceptedFiles: parsed.files.size, componentCharacters: 256, storageError };
  } catch (error) { longName = { previewRejected: true, componentCharacters: 256, message: error instanceof Error ? error.message : String(error) }; }
  const corrupt = new JSZip(); corrupt.file('SKILL.md','# Fixture'); corrupt.file('assets/value.txt','CRC_ORIGINAL_SENTINEL'); const crcBytes = await corrupt.generateAsync({type:'nodebuffer',compression:'STORE'}); crcBytes[crcBytes.indexOf(Buffer.from('CRC_ORIGINAL_SENTINEL'))] = 88;
  let crc: Record<string, unknown>;
  try { const accepted = await parseSkillZip(crcBytes); crc = { rejected: false, accepted: accepted.files.get('assets/value.txt')!.toString() }; }
  catch (error) { crc = { rejected: true, message: error instanceof Error ? error.message : String(error) }; }
  process.stdout.write(JSON.stringify({filesystem:process.platform,longName,crc},null,2)+'\n');
 } finally { if(previous===undefined)delete process.env.UPLOAD_DIR;else process.env.UPLOAD_DIR=previous;await rm(root,{recursive:true,force:true}); }
}
void main();
