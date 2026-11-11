import { Injectable } from '@nestjs/common';
import { constants } from 'node:fs';
import { mkdir, open, lstat, link, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { KnowledgeCoreError } from './errors';
import { KNOWLEDGE_UPLOAD_MAX_BYTES } from './parser';
/** Content addressed, private immutable blobs. Never serve root as static files. */
@Injectable()
export class KnowledgeBlobStorage {
  private root() {
    return resolve(
      process.env.KNOWLEDGE_CORE_DIR ||
        join(
          process.env.UPLOAD_DIR || join(process.cwd(), 'uploads'),
          'knowledge-core',
          'blobs',
        ),
    );
  }
  private path(key: string) {
    if (!/^[0-9a-f]{64}$/.test(key))
      throw new KnowledgeCoreError('INVALID_STORAGE_KEY');
    return join(this.root(), key.slice(0, 2), key);
  }
  async put(
    bytes: Buffer,
  ): Promise<{ storageKey: string; contentHash: string; sizeBytes: number }> {
    if (!bytes.length || bytes.length > KNOWLEDGE_UPLOAD_MAX_BYTES)
      throw new KnowledgeCoreError('UPLOAD_SIZE_LIMIT');
    const hash = createHash('sha256').update(bytes).digest('hex'),
      path = this.path(hash);
    await mkdir(join(this.root(), hash.slice(0, 2)), {
      recursive: true,
      mode: 0o700,
    });
    const temporary = join(
      this.root(),
      hash.slice(0, 2),
      `.upload-${randomUUID()}`,
    );
    try {
      const fd = await open(
        temporary,
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          constants.O_NOFOLLOW,
        0o400,
      );
      try {
        await fd.writeFile(bytes);
        await fd.sync();
      } finally {
        await fd.close();
      }
      // A hard link publishes a complete synced inode atomically; concurrent uploads never see a partially written final blob.
      try {
        await link(temporary, path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        await this.read(hash);
      }
      const directory = await open(
        join(this.root(), hash.slice(0, 2)),
        constants.O_RDONLY,
      );
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } catch (error) {
      if (error instanceof KnowledgeCoreError) throw error;
      throw new KnowledgeCoreError('BLOB_WRITE_FAILED');
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
    return { storageKey: hash, contentHash: hash, sizeBytes: bytes.length };
  }
  async read(key: string): Promise<Buffer> {
    const path = this.path(key);
    let fd;
    try {
      const stat = await lstat(path);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.size > KNOWLEDGE_UPLOAD_MAX_BYTES
      )
        throw new Error();
      fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      const bytes = await fd.readFile();
      if (createHash('sha256').update(bytes).digest('hex') !== key)
        throw new Error();
      return bytes;
    } catch {
      throw new KnowledgeCoreError('BLOB_UNAVAILABLE');
    } finally {
      await fd?.close();
    }
  }
}
