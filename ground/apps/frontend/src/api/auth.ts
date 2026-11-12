import type { SessionMe } from '@mammoth/shared';
import { http } from './http';

export const authApi = {
  login: (phone: string, password: string) =>
    http<SessionMe>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
    }),
  smsLogin: (phone: string, smsCode: string) =>
    http<SessionMe>('/api/auth/sms-login', {
      method: 'POST',
      body: JSON.stringify({ phone, smsCode }),
    }),
  sendSms: (phone: string, scene: 'login' | 'register') =>
    http<{ ok: true; retryAfterSeconds: number; mockCode?: string }>('/api/auth/sms/send', {
      method: 'POST',
      body: JSON.stringify({ phone, scene }),
    }),
  register: (body: { name: string; phone: string; password: string; enterpriseName: string; slug: string; smsCode: string }) =>
    http<SessionMe>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  me: () => http<SessionMe>('/api/auth/me'),
  changePassword: (oldPassword: string, newPassword: string) =>
    http<{ ok: boolean }>('/api/auth/password', {
      method: 'PATCH',
      body: JSON.stringify({ oldPassword, newPassword }),
    }),
  updateMe: (name: string) =>
    http<SessionMe>('/api/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  logout: () => http<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  switchTenant: (tenantId: string) =>
    http<SessionMe>('/api/auth/switch-tenant', {
      method: 'POST',
      body: JSON.stringify({ tenantId }),
    }),
  exitWorkbench: () => http<SessionMe>('/api/auth/exit-workbench', { method: 'POST' }),
  issueBrowserSsoTicket: () =>
    http<{ ticket: string; next: string }>('/api/auth/browser-sso-ticket', { method: 'POST' }),
  consumeBrowserSso: (ticket: string) =>
    http<SessionMe>('/api/auth/browser-sso-consume', {
      method: 'POST',
      body: JSON.stringify({ ticket }),
    }),
};
