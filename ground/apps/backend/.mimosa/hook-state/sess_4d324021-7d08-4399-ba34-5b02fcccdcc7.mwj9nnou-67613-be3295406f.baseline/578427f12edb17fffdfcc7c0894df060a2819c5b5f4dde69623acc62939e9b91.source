export type AuthCode = {
  sub: string;
  nonce: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  issuer: string;
  tenantId: string | null;
  exp: number;
};

const codes = new Map<string, AuthCode>();

export function saveCode(code: string, data: AuthCode) {
  // 顺带清扫过期 code，避免长期运行时 Map 无限增长（授权码本就 5 分钟有效）。
  const now = Date.now();
  for (const [key, row] of codes) {
    if (row.exp < now) codes.delete(key);
  }
  codes.set(code, data);
}

export function takeCode(code: string): AuthCode | undefined {
  const row = codes.get(code);
  if (!row) return undefined;
  codes.delete(code);
  if (row.exp < Date.now()) return undefined;
  return row;
}
