import * as yauzl from 'yauzl';
import type { Readable } from 'node:stream';
import { crc32 } from 'node:zlib';
import { HttpException } from '@nestjs/common';
import { assertSkillFilePaths, isSkillPackagePath, SKILL_ZIP_MAX_BYTES, type SkillPackageLimits } from './skill-package-format';

function invalid(message: string): HttpException {
  return new HttpException({ code: 'SKILL_PACKAGE_INVALID', message, statusCode: 400 }, 400);
}

/** Read ordinary ZIP entries one at a time; enforce limits before and during decompression. */
export async function readSkillZip(buffer: Buffer, limits: SkillPackageLimits): Promise<{ files: Map<string, Buffer>; executable: Set<string> }> {
  if (buffer.length > SKILL_ZIP_MAX_BYTES) throw invalid('技能包压缩文件超过 12MB 限制');
  const archive = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) reject(invalid('技能包已损坏或包含不安全路径，无法解压')); else resolve(zip);
    });
  });
  return new Promise((resolve, reject) => {
    const files = new Map<string, Buffer>(), executable = new Set<string>();
    const explicitDirectories = new Map<string, string>();
    let settled = false, total = 0, entries = 0, active: Readable | undefined;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true; active?.destroy(); archive.close();
      reject(error instanceof HttpException ? error : invalid('技能包已损坏或包含不安全路径，无法解压'));
    };
    archive.on('error', fail);
    archive.on('end', () => {
      if (settled) return;
      try {
        assertSkillFilePaths([...files.keys()]);
        for (const [key, path] of explicitDirectories) {
          if ([...files.keys()].some(f => f.toLowerCase() === key)) throw invalid(`技能包文件与目录路径冲突：${path}`);
        }
        settled = true; archive.close(); resolve({ files, executable });
      } catch (error) { fail(error); }
    });
    archive.on('entry', async (entry: yauzl.Entry) => {
      try {
        if (settled) return;
        if (++entries > limits.maxFiles * 4 + 16) throw invalid('技能包文件数量超过限制');
        const raw = entry.fileName, directory = raw.endsWith('/'), path = directory ? raw.slice(0, -1) : raw;
        if (!isSkillPackagePath(path)) throw invalid(`技能包包含不安全路径：${raw}`);
        const mode = entry.externalFileAttributes >>> 16, type = mode & 0o170000;
        if (type && type !== 0o100000 && type !== 0o040000) throw invalid(`技能包不能包含链接或特殊文件：${path}`);
        if ((type === 0o040000) !== directory && type !== 0) throw invalid(`技能包文件类型冲突：${path}`);
        const parts = path.split('/');
        if (parts.includes('__MACOSX') || /^(\.DS_Store|Thumbs\.db|desktop\.ini)$/.test(parts.at(-1)!) || parts.at(-1)!.startsWith('._')) {
          archive.readEntry(); return;
        }
        if (parts.some(p => ['.git', '.svn', '.hg', 'node_modules', '.venv', 'venv', '__pycache__'].includes(p))) {
          throw invalid(`技能包包含仓库或依赖缓存目录，请移除后重新打包：${path}`);
        }
        if (directory) {
          const key = path.toLowerCase();
          if (explicitDirectories.has(key) && explicitDirectories.get(key) !== path) throw invalid(`技能包目录路径冲突：${path}`);
          explicitDirectories.set(key, path); archive.readEntry(); return;
        }
        if (files.has(path)) throw invalid(`技能包重复文件路径冲突：${path}`);
        if (files.size >= limits.maxFiles) throw invalid('技能包文件数量超过限制');
        if (entry.uncompressedSize > limits.maxTotalBytes - total) throw invalid('技能包解压后超过 10MB 容量限制');
        active = await new Promise<Readable>((resolveStream, rejectStream) => archive.openReadStream(entry, (error, stream) => {
          if (error || !stream) rejectStream(error); else resolveStream(stream);
        }));
        const chunks: Buffer[] = [];
        let checksum = 0;
        for await (const chunk of active) {
          const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          total += data.length;
          if (total > limits.maxTotalBytes) throw invalid('技能包解压后超过 10MB 容量限制');
          checksum = crc32(data, checksum);
          chunks.push(data);
        }
        active = undefined;
        if (checksum !== entry.crc32) throw invalid(`技能包文件 CRC 校验失败：${path}`);
        if (settled) return;
        files.set(path, Buffer.concat(chunks));
        if (mode & 0o111) executable.add(path);
        archive.readEntry();
      } catch (error) { fail(error); }
    });
    archive.readEntry();
  });
}
