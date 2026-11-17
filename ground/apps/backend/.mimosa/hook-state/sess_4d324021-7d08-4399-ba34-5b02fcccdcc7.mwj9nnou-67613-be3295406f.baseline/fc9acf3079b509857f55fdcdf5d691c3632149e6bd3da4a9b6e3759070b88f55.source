import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { OfficialAgentKind } from '@prisma/client';
import { normalizeExpertDefinition } from './expert-definition';
import { normalizeAvatarRelativePath } from './gallery-avatars';

export type OfficialKbAssetFile = {
  assetKey: string;
  name: string;
  originalName: string;
  /** Relative to assets root, e.g. kb/ip/1.md */
  sourcePath?: string;
  content?: string;
};

export type OfficialAgentAsset = {
  key: string;
  kind: OfficialAgentKind;
  name: string;
  summary: string;
  openingQuestions: string[];
  systemPrompt: string;
  toolScope: string[];
  /** Gallery main category; presentation-only, editable without publishing. */
  category?: 'common' | 'productivity' | 'content' | 'sales' | 'expertise' | 'analytics';
  /** Content capability labels (zh); tool labels are derived separately. */
  capabilities?: string[];
  /** Optional relative avatar under assets, e.g. avatars/growth.jpg. */
  avatar?: string;
  batch?: string;
  publish?: boolean;
  kbFiles: OfficialKbAssetFile[];
  linkedSkillKeys: string[];
  expertDefinition: import('@prisma/client').Prisma.InputJsonObject;
};

/** Resolve assets dir for both src (tsx) and dist (compiled) layouts. */
export function officialAgentAssetsRoot(): string {
  const candidates = [
    join(__dirname, 'assets'),
    join(__dirname, '..', '..', 'src', 'official-agent', 'assets'),
    join(process.cwd(), 'src', 'official-agent', 'assets'),
    join(process.cwd(), 'apps', 'backend', 'src', 'official-agent', 'assets'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'agents'))) return dir;
  }
  return candidates[0];
}

export function loadOfficialAgentAssets(filterKeys?: string[]): OfficialAgentAsset[] {
  const root = officialAgentAssetsRoot();
  const directories = [{ base: root, dir: join(root, 'agents') }, { base: join(root, 'managed/v1'), dir: join(root, 'managed/v1/experts') }];
  const files = directories.flatMap(({ base, dir }) => existsSync(dir) ? readdirSync(dir).filter(name => name.endsWith('.json')).sort().map(file => ({ base, path: join(dir, file) })) : []);
  const out: OfficialAgentAsset[] = [];
  for (const file of files) {
    const raw = JSON.parse(readFileSync(file.path, 'utf8')) as {
      key: string;
      kind: 'GENERAL' | 'KNOWLEDGE';
      name: string;
      summary: string;
      openingQuestions?: string[];
      toolScope?: string[];
      category?: 'common' | 'productivity' | 'content' | 'sales' | 'expertise' | 'analytics';
      capabilities?: string[];
      avatar?: string;
      systemPrompt?: string;
      promptFile?: string;
      batch?: string;
      publish?: boolean;
      kb?: Array<{ file: string; name: string }>;
      linkedSkillKeys?: string[];
      expertDefinition?: Record<string, unknown>;
    };
    if (filterKeys && filterKeys.length > 0 && !filterKeys.includes(raw.key)) continue;
    let systemPrompt = (raw.systemPrompt ?? '').trim();
    if (!systemPrompt && raw.promptFile) {
      const promptPath = join(file.base, raw.promptFile);
      if (!existsSync(promptPath)) {
        throw new Error(`官方专家资产缺少提示词文件: ${raw.promptFile}`);
      }
      systemPrompt = readFileSync(promptPath, 'utf8').trim();
    }
    if (!systemPrompt) throw new Error(`官方专家资产缺少 systemPrompt: ${raw.key}`);
    const kbFiles: OfficialKbAssetFile[] = (raw.kb ?? []).map((item) => {
      const assetKey = item.file.trim();
      return {
        assetKey,
        name: item.name.trim() || assetKey,
        originalName: assetKey,
        sourcePath: join('kb', raw.key, assetKey),
      };
    });
    const category = normalizeCategory(raw.category);
    const coreKeys = new Set(['key','kind','name','summary','openingQuestions','toolScope','category','capabilities','avatar','systemPrompt','promptFile','batch','publish','kb','linkedSkillKeys','expertDefinition']);
    const vendorFields = Object.fromEntries(Object.entries(raw).filter(([key]) => !coreKeys.has(key)));
    const normalizedDefinition = normalizeExpertDefinition(raw.expertDefinition, { name: raw.name, summary: raw.summary ?? '' });
    const definition = Object.keys(vendorFields).length ? { ...normalizedDefinition, extensions: { ...(normalizedDefinition.extensions as import('@prisma/client').Prisma.InputJsonObject), upstreamManifest: vendorFields as import('@prisma/client').Prisma.InputJsonObject } } : normalizedDefinition;
    if (out.some(asset => asset.key === raw.key)) throw new Error(`专家资产 key 重复: ${raw.key}`);
    out.push({
      key: raw.key,
      kind: raw.kind === 'KNOWLEDGE' ? OfficialAgentKind.KNOWLEDGE : OfficialAgentKind.GENERAL,
      name: raw.name.trim(),
      summary: (raw.summary ?? '').trim(),
      openingQuestions: normalizeList(raw.openingQuestions ?? []),
      systemPrompt,
      toolScope: normalizeList(raw.toolScope ?? []),
      category,
      capabilities: normalizeList(raw.capabilities ?? []).slice(0, 8),
      avatar: normalizeAvatarRelativePath(raw.avatar) ?? undefined,
      batch: raw.batch,
      publish: raw.publish,
      kbFiles,
      linkedSkillKeys: normalizeList(raw.linkedSkillKeys ?? []),
      expertDefinition: definition,
    });
  }
  return out;
}

function normalizeList(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

const CATEGORIES = new Set([
  'common',
  'productivity',
  'content',
  'sales',
  'expertise',
  'analytics',
]);

function normalizeCategory(
  value: string | undefined,
): OfficialAgentAsset['category'] | undefined {
  if (!value) return undefined;
  const key = value.trim();
  return CATEGORIES.has(key) ? (key as OfficialAgentAsset['category']) : undefined;
}

/** Keep dirname referenced so bundlers do not strip path helpers. */
void dirname;

/** Current-page icon metadata only; never load the whole catalog or role instructions for paging. */
export function loadOfficialAgentAvatarRef(key:string):string|null{
 if(!/^[a-z][a-z0-9-]{1,63}$/.test(key))return null;
 const root=officialAgentAssetsRoot();
 for(const folder of ['agents','managed/v1/experts']){
  const path=join(root,folder,`${key}.json`);if(!existsSync(path))continue;
  try{const raw=JSON.parse(readFileSync(path,'utf8'));if(raw.key===key)return normalizeAvatarRelativePath(raw.avatar);}catch{return null;}
 }
 return null;
}
