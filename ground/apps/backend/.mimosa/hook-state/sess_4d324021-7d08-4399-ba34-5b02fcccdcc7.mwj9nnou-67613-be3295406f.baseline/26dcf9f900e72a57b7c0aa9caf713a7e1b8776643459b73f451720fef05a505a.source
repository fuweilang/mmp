/** Multer reads multipart filenames as latin1. A browser UTF-8 name has no code point above 255 until this repair. */
export function uploadedName(name: string): string {
  if ([...name].some((char) => char.charCodeAt(0) > 255)) return name;
  const repaired = Buffer.from(name, 'latin1').toString('utf8');
  return repaired.includes('\uFFFD') ? name : repaired;
}

/** Read compatibility for names stored before multipart decoding was fixed.
 * C1 byte markers distinguish these historical names from ordinary Unicode or
 * ambiguous accented text. Project a readable value without rewriting sealed metadata.
 */
export function storedUploadedName(name: string): string {
  return /[\u0080-\u009f]/.test(name) ? uploadedName(name) : name;
}

