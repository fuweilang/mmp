import { spawn } from 'node:child_process';

const VIDEO_NAME = /\.(mp4|webm|mov)$/i;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
type Transcriber = (name: string, bytes: Buffer) => Promise<string>;

let transcriber: Transcriber | null = null;

export function setLibraryTranscriber(fn: Transcriber | null): void {
  transcriber = fn;
}

export function libraryAsrConfigured(): boolean {
  return transcriber !== null || Boolean(process.env.LIBRARY_ASR_BASE_URL && process.env.LIBRARY_ASR_API_KEY);
}

export async function transcribeVideo(name: string, bytes: Buffer): Promise<string> {
  if (!VIDEO_NAME.test(name) || bytes.length < 16 || bytes.length > MAX_VIDEO_BYTES) return '';
  try {
    if (transcriber) return (await transcriber(name, bytes)).trim();
    const base = process.env.LIBRARY_ASR_BASE_URL;
    const key = process.env.LIBRARY_ASR_API_KEY;
    if (!base || !key) return '';
    return await transcribeWav(base, key, process.env.LIBRARY_ASR_MODEL || 'FunAudioLLM/SenseVoiceSmall', bytes);
  } catch {
    return '';
  }
}

export async function transcribeWav(base: string, key: string, model: string, bytes: Buffer): Promise<string> {
  const wav = await extractWav(bytes);
  if (!wav) return '';
  const copy = new ArrayBuffer(wav.byteLength);
  new Uint8Array(copy).set(wav);
  const form = new FormData();
  form.set('model', model);
  form.set('file', new Blob([copy], { type: 'audio/wav' }), 'audio.wav');
  const response = await fetch(`${base.replace(/\/$/, '')}/audio/transcriptions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) return '';
  const body = await response.json() as { text?: unknown };
  return typeof body.text === 'string' ? body.text.trim() : '';
}

function extractWav(bytes: Buffer): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', 'pipe:1'], {
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const parts: Buffer[] = [];
    let size = 0;
    let settled = false;
    const finish = (value: Buffer | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 25 * 1024 * 1024) {
        child.kill();
        finish(null);
        return;
      }
      parts.push(chunk);
    });
    child.on('error', () => finish(null));
    child.on('close', (code) => finish(code === 0 ? Buffer.concat(parts) : null));
    child.stdin.on('error', () => undefined);
    child.stdin.end(bytes);
  });
}
