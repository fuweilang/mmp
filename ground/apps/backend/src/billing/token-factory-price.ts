/** Bill the Token Factory flash model at the public DeepSeek flash tariff. */
import { officialModelPrice, type OfficialPrice } from './official-model-prices';

const HOST = 'proxy.token-factory.digicore-ai.com';
const MODEL = 'deepseek-v4.1-flash';

/** Same purchase price as api.deepseek.com deepseek-flash, including peak and off-peak. */
export async function tokenFactoryPurchasePrice(baseUrl: string | null | undefined, model: string, now = new Date()): Promise<OfficialPrice | null> {
  if (model !== MODEL) return null;
  let url: URL;
  try { url = new URL(baseUrl || ''); } catch { return null; }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.search || url.hash) return null;
  if (url.hostname !== HOST || !['/v1', '/v1/'].includes(url.pathname)) return null;
  return officialModelPrice('https://api.deepseek.com', 'deepseek-flash', now);
}
