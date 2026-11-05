import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { exportJWK, exportPKCS8, exportSPKI, generateKeyPair, importPKCS8, importSPKI, type JWK } from 'jose';

const KEY_FILE = process.env.OIDC_KEYS_FILE || join(__dirname, '../../.oidc-keys.json');
const KID = 'mammoth-oidc-1';

export type OidcKeyset = { privateKey: CryptoKey; publicJwk: JWK };

export async function loadOidcKeys(): Promise<OidcKeyset> {
  if (existsSync(KEY_FILE)) {
    const raw = JSON.parse(readFileSync(KEY_FILE, 'utf8')) as { privateKey: string; publicKey: string };
    const privateKey = await importPKCS8(raw.privateKey, 'RS256');
    const publicKey = await importSPKI(raw.publicKey, 'RS256');
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = KID;
    publicJwk.use = 'sig';
    publicJwk.alg = 'RS256';
    return { privateKey, publicJwk };
  }
  mkdirSync(dirname(KEY_FILE), { recursive: true, mode: 0o700 });
  const pair = await generateKeyPair('RS256', { extractable: true });
  writeFileSync(
    KEY_FILE,
    JSON.stringify({
      privateKey: await exportPKCS8(pair.privateKey),
      publicKey: await exportSPKI(pair.publicKey),
    }),
    { mode: 0o600 },
  );
  const publicJwk = await exportJWK(pair.publicKey);
  publicJwk.kid = KID;
  publicJwk.use = 'sig';
  publicJwk.alg = 'RS256';
  return { privateKey: pair.privateKey, publicJwk };
}

export const OIDC_KID = KID;
