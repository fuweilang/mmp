/** Strip control / injection-prone marks; keep CJK and normal punctuation. */
const DANGEROUS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F<>"'`\\]/g;

export function sanitizeText(value: string): string {
  return value.replace(DANGEROUS, '');
}
