import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { categoryKind, normalizeCategoryItems, readCategoryDirectory } from './catalog-category';

@Injectable()
export class CatalogCategoryService {
  constructor(private readonly prisma: PrismaService) {}
  read(kind: string) { return readCategoryDirectory(this.prisma, categoryKind(kind)); }
  async usage(kindValue: string, key: string) {
    const kind = categoryKind(kindValue);
    const item = await this.prisma.catalogCategory.findUnique({ where: { kind_key: { kind, key } } });
    if (!item) throw new NotFoundException('分类不存在，请刷新后重试');
    return { count: await this.referenceCount(this.prisma, kind, key) };
  }
  private referenceCount(db: Pick<Prisma.TransactionClient, 'officialAgent' | 'officialSkill'>, kind: 'expert' | 'skill', key: string) {
    return kind === 'expert' ? db.officialAgent.count({ where: { category: key } }) : db.officialSkill.count({ where: { categories: { has: key } } });
  }
  async save(kindValue: string, input: unknown, actorId: string) {
    const kind = categoryKind(kindValue);
    const body = input as { version?: unknown; items?: unknown };
    if (!body || !Number.isSafeInteger(body.version) || (body.version as number) < 0 || (body.version as number) >= 2_147_483_647) throw new BadRequestException('分类版本无效');
    return this.prisma.$transaction(async tx => {
      const claimed = await tx.catalogCategoryDirectory.updateMany({ where: { kind, version: body.version as number }, data: { version: { increment: 1 } } });
      if (claimed.count !== 1) throw new ConflictException('分类已被其他管理员修改，请重新加载后保存');
      // Lock category rows before checking usage; skill assignment trigger takes KEY SHARE.
      await tx.$queryRaw`SELECT key FROM catalog_category WHERE kind=${kind} FOR UPDATE`;
      const current = await tx.catalogCategory.findMany({ where: { kind } });
      const items = normalizeCategoryItems(body.items, current.map(item => item.key));
      const removed = current.filter(old => !items.some(item => item.key === old.key));
      for (const item of removed) {
        const count = await this.referenceCount(tx, kind, item.key);
        if (count) throw new ConflictException({ code: 'CATEGORY_IN_USE', message: `“${item.name}”仍被${count}个${kind === 'expert' ? '专家' : '技能'}使用，请先调整分类` });
      }
      // Temporarily free unique names so swapping two labels is legal in one save.
      for (const item of current) await tx.catalogCategory.update({ where: { kind_key: { kind, key: item.key } }, data: { name: `__pending_${randomUUID()}` } });
      if (removed.length) await tx.catalogCategory.deleteMany({ where: { kind, key: { in: removed.map(item => item.key) } } });
      for (const item of items) await tx.catalogCategory.upsert({ where: { kind_key: { kind, key: item.key } }, create: { kind, ...item }, update: { name: item.name, sortOrder: item.sortOrder } });
      await tx.auditLog.create({ data: { userId: actorId, action: 'admin_save_catalog_categories', meta: { kind, version: (body.version as number) + 1, before: current.map(({ key, name, sortOrder }) => ({ key, name, sortOrder })), after: items } } });
      return { version: (body.version as number) + 1, items };
    });
  }
}
