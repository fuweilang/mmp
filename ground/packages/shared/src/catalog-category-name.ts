/** Locale-independent comparison used by both category editors and API writes. */
export function catalogCategoryNameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Return a user-facing error; preserve meaningful joiners in multilingual text/emoji. */
export function catalogCategoryNameError(value: unknown, usedNames?: ReadonlySet<string>): string {
  if (typeof value !== 'string') return '分类名称无效';
  // Reject controls before trim, including NUL, and unpaired UTF-16 surrogates.
  if (/[\p{Cc}\p{Cs}]/u.test(value)) return '分类名称不能包含控制字符或无效字符';
  const name = value.trim();
  if (!name || [...name].length > 32 || !name.replace(/[\p{White_Space}\p{Default_Ignorable_Code_Point}]/gu, '')) {
    return '分类名称需为 1–32 个可见字符';
  }
  const key = catalogCategoryNameKey(name);
  if (['全部', '未分类', '未设置', 'all', 'uncategorized'].includes(key)) return `“${name}”是保留名称，请使用其他名称`;
  if (usedNames?.has(key)) return `分类名称“${name}”重复`;
  return '';
}
