const LOCAL_AGENT_WEB_URL = 'http://127.0.0.1:3080/';

function normalizeAgentWebUrl(value: string | undefined): string {
  const raw = value?.trim() || (import.meta.env.DEV ? LOCAL_AGENT_WEB_URL : '');
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

/** 智能终端网页版地址；生产构建必须显式配置。 */
export const agentWebUrl = normalizeAgentWebUrl(import.meta.env.VITE_AGENT_WEB_URL);

export function openAgentClient() {
  window.location.href = 'mmp://open';
}

export function openAgentWeb() {
  if (agentWebUrl) window.open(agentWebUrl, '_blank', 'noopener,noreferrer');
}

/** @returns 是否已发起跳转；生产未配置地址时由调用方给出明确错误。 */
export function redirectToAgentWeb(): boolean {
  if (!agentWebUrl) return false;
  window.location.assign(agentWebUrl);
  return true;
}

/** 只允许回到配置的终端源，避免登录页的任意外部跳转。 */
export function trustedAgentReturn(next: string | null): string | null {
  if (!next || !agentWebUrl || (!next.startsWith('http://') && !next.startsWith('https://'))) return null;
  try {
    const target = new URL(next);
    const agent = new URL(agentWebUrl);
    if (target.origin !== agent.origin || target.username || target.password) return null;
    return target.href;
  } catch {
    return null;
  }
}
