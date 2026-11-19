import { adminHttp, http } from '../http';
import type { CategoryDraft } from '../../utils/catalog-categories';
export type CatalogCategoryKind = 'expert' | 'skill';
export type CatalogCategory = { key: string; name: string; sortOrder: number };
export type CatalogCategoryDirectory = { version: number; items: CatalogCategory[] };
export const catalogCategoryApi = {
  read: (kind: CatalogCategoryKind) => http<CatalogCategoryDirectory>(`/api/catalog-categories/${kind}`),
  get: (kind: CatalogCategoryKind) => adminHttp<CatalogCategoryDirectory>(`/catalog-categories/${kind}`),
  usage: (kind: CatalogCategoryKind, key: string) => adminHttp<{ count: number }>(`/catalog-categories/${kind}/${encodeURIComponent(key)}/usage`),
  save: (kind: CatalogCategoryKind, version: number, items: CategoryDraft[]) =>
    adminHttp<CatalogCategoryDirectory>(`/catalog-categories/${kind}`, { method: 'PUT', body: JSON.stringify({ version, items }) }),
};
