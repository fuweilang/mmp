import { catalogCategoryNameError, catalogCategoryNameKey } from '@mammoth/shared';
import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { PrismaService } from '../prisma/prisma.service';

export type CatalogCategoryKind = 'expert' | 'skill';
export type CategoryItem = { key: string; name: string; sortOrder: number };
export function categoryKind(value: string): CatalogCategoryKind {
  if (value !== 'expert' && value !== 'skill') throw new BadRequestException('分类类型无效');
  return value;
}
export function normalizeCategoryItems(input: unknown, existing: string[]): CategoryItem[] {
  if (!Array.isArray(input) || input.length > 200) throw new BadRequestException('分类列表无效，最多200个分类');
  const keys = new Set<string>(), names = new Set<string>();
  return input.map((item, sortOrder) => {
    if (!item || typeof item !== 'object' || typeof item.name !== 'string') throw new BadRequestException('分类名称无效');
    const error = catalogCategoryNameError(item.name, names);
    if (error) throw new BadRequestException(error);
    const name = item.name.trim();
    const folded = catalogCategoryNameKey(name);
    const key = item.key === undefined ? `cat-${randomUUID()}` : item.key;
    if (typeof key !== 'string' || (item.key !== undefined && !existing.includes(key)) || keys.has(key)) throw new BadRequestException('分类标识无效');
    names.add(folded); keys.add(key);
    return { key, name, sortOrder };
  });
}
export async function readCategoryDirectory(prisma: Pick<PrismaService, 'catalogCategoryDirectory'>, kind: CatalogCategoryKind) {
  const row = await prisma.catalogCategoryDirectory.findUnique({ where: { kind }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
  if (!row) throw new BadRequestException('分类目录尚未初始化，请先完成数据库迁移');
  return { version: row.version, items: row.items.map(({ key, name, sortOrder }) => ({ key, name, sortOrder })) };
}
export async function assertCategoryKeys(prisma: Pick<PrismaService, 'catalogCategory'>, kind: CatalogCategoryKind, keys: string[]) {
  if (!keys.length) return;
  const count = await prisma.catalogCategory.count({ where: { kind, key: { in: [...new Set(keys)] } } });
  if (count !== new Set(keys).size) throw new BadRequestException('分类不存在，请刷新后重新选择');
}
export async function categoryFacets(prisma: Pick<PrismaService, 'catalogCategoryDirectory'>, kind: CatalogCategoryKind, counts: Record<string, number>) {
  const directory = await readCategoryDirectory(prisma, kind);
  const items = directory.items.map(item => ({ id: item.key, name: item.name, sortOrder: item.sortOrder, count: counts[item.key] ?? 0 }));
  if (counts.uncategorized) items.push({ id: 'uncategorized', name: '未分类', sortOrder: items.length, count: counts.uncategorized });
  return items;
}
