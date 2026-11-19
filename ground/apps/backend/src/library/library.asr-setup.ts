import { decryptApiKey } from '../llm/llm-key-crypto';
import type { PrismaService } from '../prisma/prisma.service';
import { setLibraryTranscriber, transcribeWav } from './library.asr';

export async function configureLibraryAsr(db: PrismaService): Promise<void> {
  if (process.env.LIBRARY_ASR_BASE_URL && process.env.LIBRARY_ASR_API_KEY) return;
  const profile = await db.knowledgeProfile.findFirst({
    where: { task: 'EMBEDDING', enabled: true },
    orderBy: { createdAt: 'desc' },
    include: { provider: true },
  }).catch(() => null);
  const provider = profile?.provider;
  if (!provider?.enabled || !provider.baseUrl || !provider.apiKeyEnc) return;
  let key = '';
  try { key = decryptApiKey(provider.apiKeyEnc); } catch { return; }
  if (!key) return;
  const base = provider.baseUrl;
  const model = process.env.LIBRARY_ASR_MODEL || 'FunAudioLLM/SenseVoiceSmall';
  setLibraryTranscriber((_name, bytes) => transcribeWav(base, key, model, bytes));
}
