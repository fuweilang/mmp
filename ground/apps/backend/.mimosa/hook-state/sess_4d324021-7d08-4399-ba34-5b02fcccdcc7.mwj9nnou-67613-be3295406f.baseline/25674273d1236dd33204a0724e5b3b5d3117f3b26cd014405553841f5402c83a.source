/** Read text from images and scanned PDFs with the macOS text recognizer, when it is installed. */
import { spawn } from 'node:child_process';
import { accessSync } from 'node:fs';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

function sourceFile(): string | null {
  const here = __dirname;
  const candidates = [join(here, 'macos-ocr.m'), join(here, '../../src/library/macos-ocr.m')];
  return candidates.find((path) => { try { accessSync(path); return true; } catch { return false; } }) ?? null;
}

const SOURCE = sourceFile();
let binary: Promise<string | null> | null = null;

async function recognizer(): Promise<string | null> {
  if (!binary) {
    binary = (async () => {
      if (!SOURCE) return null;
      const dir = join(tmpdir(), 'mmp-library-ocr');
      const output = join(dir, 'macos-ocr');
      try {
        const sourceTime = (await stat(SOURCE)).mtimeMs;
        const builtTime = (await stat(output)).mtimeMs;
        if (builtTime >= sourceTime) return output;
      } catch { /* compile when the helper is missing or older than the source */ }
      await mkdir(dir, { recursive: true });
      const ok = await new Promise<boolean>((resolve) => {
        const child = spawn('clang', ['-fobjc-arc', '-framework', 'Foundation', '-framework', 'AppKit', '-framework', 'ImageIO', '-framework', 'Vision', '-framework', 'PDFKit', '-O2', '-o', output, SOURCE], { stdio: 'ignore' });
        const timer = setTimeout(() => { child.kill(); resolve(false); }, 90_000);
        child.on('error', () => { clearTimeout(timer); resolve(false); });
        child.on('close', (code) => { clearTimeout(timer); resolve(code === 0); });
      });
      return ok ? output : null;
    })();
  }
  return binary;
}

/** @returns recognized text, or an empty string when this image has no readable text or OCR is unavailable. */
export async function recognizeImageText(name: string, bytes: Buffer): Promise<string> {
  const extension = name.slice(name.lastIndexOf('.')).toLowerCase();
  if (extension !== '.pdf') {
    try {
      const meta = await sharp(bytes).metadata();
      if ((meta.width ?? 0) < 32 || (meta.height ?? 0) < 32) return '';
    } catch {
      return '';
    }
  }
  const tool = await recognizer();
  if (!tool) return '';
  const dir = await mkdtemp(join(tmpdir(), 'library-ocr-'));
  try {
    const input = join(dir, `source${extension || '.img'}`);
    await writeFile(input, bytes);
    return await new Promise<string>((resolve) => {
      const child = spawn(tool, [input], { stdio: ['ignore', 'pipe', 'ignore'] });
      const chunks: Buffer[] = [];
      let size = 0;
      child.stdout.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size <= 200_000) chunks.push(chunk);
      });
      const timer = setTimeout(() => { child.kill(); resolve(''); }, 30_000);
      child.on('error', () => { clearTimeout(timer); resolve(''); });
      child.on('close', () => { clearTimeout(timer); resolve(Buffer.concat(chunks).toString('utf8').trim()); });
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
