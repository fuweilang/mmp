import type { SessionMe } from '@mammoth/shared';

export const IS_LOGIN_KEY = 'mammothai_is_login';
export const CURRENT_USER_KEY = 'mammothai_current_user';

/** Octop dashboard 自己存会话 token 的键（不是中台的键），集中在这里操作。 */
const OCTOP_TOKEN_KEY = 'auth_token';

export function getCachedSession(): SessionMe | null {
  const raw = localStorage.getItem(CURRENT_USER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SessionMe> | null;
    // 旧版本缓存缺 RBAC 字段（effectivePermissions / platformRoleKey）会让权限判定恒为 false，
    // 这里直接丢缓存，让路由守卫重新拉 /auth/me。
    if (
      !parsed
      || !parsed.user
      || !Array.isArray(parsed.effectivePermissions)
      || !('platformRoleKey' in parsed)
    ) {
      clearSessionCache();
      return null;
    }
    return parsed as SessionMe;
  } catch {
    clearSessionCache();
    return null;
  }
}

export function setSessionCache(session: SessionMe) {
  localStorage.setItem(IS_LOGIN_KEY, 'true');
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(session));
}

export function clearSessionCache() {
  localStorage.removeItem(IS_LOGIN_KEY);
  localStorage.removeItem(CURRENT_USER_KEY);
}

/** 是否还留着 Octop 的会话 token（localStorage 或 sessionStorage 任一）。 */
export function hasOctopToken() {
  return Boolean(getOctopToken());
}

export function getOctopToken() {
  return localStorage.getItem(OCTOP_TOKEN_KEY) || sessionStorage.getItem(OCTOP_TOKEN_KEY) || '';
}

/** 清掉本页存留的 Octop 会话 token（登录态换新或退出时用）。 */
export function clearOctopToken() {
  localStorage.removeItem(OCTOP_TOKEN_KEY);
  sessionStorage.removeItem(OCTOP_TOKEN_KEY);
}

/**
 * 尽力通知 Octop 登出（stateless，可能 401）；真正生效的是 clearOctopToken()，仅同源可见。
 * 走裸 fetch 而非 request()：http() 在 Cookie 失效时会挂起 401，这里不能被卡住。
 */
export async function clearOctopSession() {
  try {
    const res = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      // 网关接受连接但不响应时（挂起不报错），2s 超时兜底；超时抛错走 catch，token 照常清。
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) console.warn('[session] Octop 登出未成功', res.status);
  } catch {
    // 网关或 Octop 未启动时忽略；本地 token 仍会被清掉。
  }
  clearOctopToken();
}
