import { ServiceUnavailableException } from '@nestjs/common';
import { decryptApiKey } from './llm-key-crypto';
/** Side-effect-free local readiness used by publication and actual chat dispatch. Never serialize the key. */
export function resolveChatProviderConfiguration(provider: {
    name: string;
    baseUrl: string | null;
    apiKeyEnc: string | null;
}) {
    if (!provider.apiKeyEnc)
        throw new ServiceUnavailableException(`厂商「${provider.name}」未配置 API Key`);
    const baseUrl = (provider.baseUrl || '').trim();
    if (!baseUrl)
        throw new ServiceUnavailableException(`厂商「${provider.name}」未配置 base_url`);
    try {
        const url = new URL(baseUrl);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
            throw new Error();
    }
    catch {
        throw new ServiceUnavailableException('厂商 base_url 配置无效');
    }
    let apiKey: string;
    try {
        apiKey = decryptApiKey(provider.apiKeyEnc);
    }
    catch {
        throw new ServiceUnavailableException('厂商 Key 解密失败，请联系平台管理员重配');
    }
    if (!apiKey.trim())
        throw new ServiceUnavailableException(`厂商「${provider.name}」API Key 为空`);
    return { baseUrl, apiKey };
}
