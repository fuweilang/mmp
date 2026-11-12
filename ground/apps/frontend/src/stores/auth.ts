import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { SessionMe } from '@mammoth/shared';
import { authApi } from '../api/auth';
import { clearOctopToken, clearSessionCache, getCachedSession, setSessionCache } from '../utils/session';

export const useAuthStore = defineStore('auth', () => {
  const session = ref<SessionMe | null>(getCachedSession());

  function apply(next: SessionMe) {
    session.value = next;
    setSessionCache(next);
  }

  function clear() {
    session.value = null;
    clearSessionCache();
    clearOctopToken();
  }

  /** 无本地会话时向中台要当前登录态；缓存已在 store 初始化时读入（ref(getCachedSession())）。 */
  async function load() {
    session.value = await authApi.me();
    if (session.value) setSessionCache(session.value);
  }

  async function login(phone: string, password: string) {
    apply(await authApi.login(phone, password));
  }

  async function smsLogin(phone: string, smsCode: string) {
    apply(await authApi.smsLogin(phone, smsCode));
  }

  async function sendSms(phone: string, scene: 'login' | 'register') {
    return authApi.sendSms(phone, scene);
  }

  async function register(body: {
    name: string;
    phone: string;
    password: string;
    enterpriseName: string;
    slug: string;
    smsCode: string;
  }) {
    apply(await authApi.register(body));
  }

  /** 退出：先同步清本地会话，再尽力通知中台（Cookie 已失效时 401 会挂起 http() 的 Promise，不能依赖它落地）。 */
  function logout() {
    clear();
    return authApi.logout().catch(() => undefined);
  }

  async function switchTenant(tenantId: string) {
    apply(await authApi.switchTenant(tenantId));
  }

  async function exitWorkbench() {
    apply(await authApi.exitWorkbench());
  }

  /** 票据接管只清理本地旧身份；服务端验证并决定是否更新 Cookie，避免影响其他标签页。 */
  async function consumeBrowserSso(ticket: string) {
    clear();
    apply(await authApi.consumeBrowserSso(ticket));
  }

  return { session, load, login, smsLogin, sendSms, register, logout, switchTenant, exitWorkbench, consumeBrowserSso };
});
