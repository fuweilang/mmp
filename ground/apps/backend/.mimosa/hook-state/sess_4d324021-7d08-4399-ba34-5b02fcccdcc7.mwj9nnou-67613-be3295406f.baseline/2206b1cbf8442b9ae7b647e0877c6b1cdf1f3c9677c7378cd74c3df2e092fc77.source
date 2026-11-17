/** Convert legacy Office bytes with a local LibreOffice when one is installed. */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TARGET: Record<string, string> = { '.doc': 'docx', '.ppt': 'pptx', '.xls': 'xlsx' };
const CANDIDATES = [
  process.env.LIBREOFFICE_PATH,
  '/opt/homebrew/bin/soffice',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  '/usr/bin/soffice',
  '/usr/bin/libreoffice',
].filter((path): path is string => Boolean(path));

async function sofficePath(): Promise<string | null> {
  for (const path of CANDIDATES) {
    try {
      await access(path);
      return path;
    } catch { /* try the next install */ }
  }
  return null;
}

/** @returns converted package bytes, or null when this machine cannot convert. */
export async function convertLegacyOffice(bytes: Buffer, extension: string): Promise<Buffer | null> {
  const target = TARGET[extension];
  const binary = target ? await sofficePath() : null;
  if (!target || !binary) return null;
  const dir = await mkdtemp(join(tmpdir(), 'library-office-'));
  try {
    const input = join(dir, `source${extension}`);
    await writeFile(input, bytes);
    const profile = join(dir, 'profile');
    await new Promise<void>((resolve, reject) => {
      const child = spawn(binary, [
        `-env:UserInstallation=file://${profile}`,
        '--headless', '--norestore', '--nolockcheck', '--nologo',
        '--convert-to', target,
        '--outdir', dir,
        input,
      ], { stdio: 'ignore', timeout: 45_000 });
      child.on('error', reject);
      child.on('close', (code) => code === 0 ? resolve() : reject(new Error('office conversion failed')));
    });
    return await readFile(join(dir, `source.${target}`));
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
