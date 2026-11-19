import { catalogCategoryNameError, catalogCategoryNameKey } from '@mammoth/shared';
export type CategoryDraft = { key?: string; name: string };
export function categoryDraftError(items: CategoryDraft[]): string {
  const names = new Set<string>();
  for (const item of items) {
    const error = catalogCategoryNameError(item.name, names);
    if (error) return error;
    names.add(catalogCategoryNameKey(item.name));
  }
  return '';
}
export function moveCategory<T>(items: T[], index: number, direction: -1 | 1): void {
  const target = index + direction;
  if (index < 0 || target < 0 || index >= items.length || target >= items.length) return;
  [items[index], items[target]] = [items[target]!, items[index]!];
}
