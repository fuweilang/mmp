<template>
  <section class="login-page">
    <div class="login-shell">
      <div v-if="booting" class="login-booting">
        <img class="login-boot-logo" src="/mengma-logo.png" alt="" width="56" height="56" />
        <p>正在进入猛犸专家…</p>
      </div>

      <template v-else>
        <form class="login-card" :class="{ 'login-card--register': mode === 'register' }" @submit.prevent="onSubmit">
          <div class="login-card-head">
            <img class="login-logo" src="/mengma-logo.png" alt="" width="72" height="72" />
            <h2>猛犸专家</h2>
            <p>{{ mode === 'register' ? '注册后立即开通企业空间' : '企业用户使用手机号和密码进入系统' }}</p>
          </div>

          <el-segmented v-model="mode" class="mode-switch" :options="modeOptions" />

          <label v-if="mode === 'register'" class="field">
            <span>姓名</span>
            <el-input
              v-model="form.name"
              placeholder="请输入姓名"
              maxlength="40"
              @input="form.name = sanitizeText(form.name)"
            />
          </label>

          <label class="field">
            <span>手机号</span>
            <el-input
              v-model="form.phone"
              placeholder="请输入手机号"
              maxlength="11"
              autocomplete="username"
              @input="form.phone = form.phone.replace(/[^\d]/g, '').slice(0, 11)"
            />
          </label>

          <label v-if="mode === 'register'" class="field">
            <span>企业/主体名称</span>
            <el-input
              v-model="form.enterpriseName"
              placeholder="请输入企业或经营主体名称"
              maxlength="80"
              @input="form.enterpriseName = sanitizeText(form.enterpriseName)"
            />
          </label>

          <label v-if="mode === 'register'" class="field">
            <span>品牌</span>
            <el-input
              v-model="form.slug"
              placeholder="品牌标识，如 腾讯 / tencent"
              maxlength="40"
              @input="form.slug = sanitizeText(form.slug)"
            />
          </label>

          <label class="field">
            <span>{{ mode === 'register' ? '设置密码' : '密码' }}</span>
            <el-input
              v-model="form.password"
              type="password"
              :placeholder="mode === 'register' ? '请设置密码' : '请输入密码'"
              show-password
              :autocomplete="mode === 'register' ? 'new-password' : 'current-password'"
            />
          </label>

          <div class="agreement">
            <div class="agreement-consent">
              <el-checkbox v-model="form.agree" />
              <span>
                我已阅读并同意
                <span class="agreement-document">用户协议</span>
                和
                <span class="agreement-document">隐私政策</span>
              </span>
            </div>
          </div>

          <el-button class="submit-button" type="primary" native-type="submit" :loading="loading" :disabled="!form.agree">
            {{ mode === 'register' ? '注册并进入系统' : '登录' }}
          </el-button>
        </form>
        <ClientDownloadLink variant="login" />
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { canAccessConsole } from '@mammoth/shared';
import { useAuthStore } from '../stores/auth';
import ClientDownloadLink from '../components/ClientDownloadLink.vue';
import { sanitizeText } from '../utils/sanitizeText';
import { redirectToAgentWeb, trustedAgentReturn } from '../utils/agent';

const CONSOLE_HOME = '/console';
const auth = useAuthStore();

function nextParam() {
  return new URLSearchParams(location.search).get('next');
}
const loading = ref(false);
/** 免登/已登录时先不渲染表单，避免登录页一闪而过。 */
const booting = ref(true);
const mode = ref<'password' | 'register'>('password');
const modeOptions = [
  { label: '密码登录', value: 'password' },
  { label: '注册', value: 'register' },
];
const form = reactive({
  name: '',
  phone: '',
  enterpriseName: '',
  slug: '',
  password: '',
  agree: true,
});

onMounted(async () => {
  const sso = new URLSearchParams(location.search).get('sso');
  if (sso) {
    const params = new URLSearchParams(location.search);
    params.delete('sso');
    const qs = params.toString();
    history.replaceState(null, '', `/login${qs ? `?${qs}` : ''}`);
    try {
      await auth.consumeBrowserSso(sso);
      goAfterLogin();
      return;
    } catch {
      ElMessage.error('登录已失效，请重新登录');
      booting.value = false;
      return;
    }
  }
  try {
    await auth.load();
    if (auth.session) {
      goAfterLogin();
      return;
    }
  } catch {
    /* stay on login */
  }
  booting.value = false;
});
function goAgent() {
  if (!redirectToAgentWeb()) ElMessage.error('猛犸专家地址未配置，请联系管理员');
}

function goConsoleOrAgent() {
  if (canAccessConsole(auth.session)) {
    window.location.href = CONSOLE_HOME;
    return;
  }
  goAgent();
}

function goAfterLogin() {
  const next = nextParam();
  const agentReturn = trustedAgentReturn(next);
  if (agentReturn) {
    window.location.replace(agentReturn);
    return;
  }
  if (next) {
    try {
      const target = new URL(next, window.location.origin);
      if (target.origin === window.location.origin && !target.username && !target.password) {
        const { pathname, search, hash } = target;
        // The original OIDC authorize request owns its callback and validates PKCE.
        if (['/console/api/oidc/authorize', '/middle/api/oidc/authorize', '/api/oidc/authorize', '/api/auth/oidc/authorize'].includes(pathname)) {
          window.location.replace(target.href);
          return;
        }
        if (pathname === '/admin' || pathname.startsWith('/admin/')) {
          if (auth.session?.user.isPlatformAdmin) window.location.href = target.href;
          else goConsoleOrAgent();
          return;
        }
        const legacyConsole = pathname === '/middle' || pathname.startsWith('/middle/');
        if (legacyConsole || pathname === '/console' || pathname.startsWith('/console/')) {
          if (auth.session?.user.isPlatformAdmin && !auth.session.currentTenant) window.location.href = '/admin';
          else if (!canAccessConsole(auth.session)) goAgent();
          else window.location.href = legacyConsole ? `/console${pathname.slice('/middle'.length)}${search}${hash}` : target.href;
          return;
        }
      }
    } catch {
      // Invalid return URLs fall through to the Web home.
    }
  }
  goAgent();
}

async function onSubmit() {
  if (!form.agree) {
    ElMessage.warning('请先勾选服务协议和隐私协议');
    return;
  }
  if (!/^1\d{10}$/.test(form.phone)) {
    ElMessage.warning('请输入正确的手机号');
    return;
  }
  if (mode.value === 'register' && !form.name.trim()) {
    ElMessage.warning('请输入姓名');
    return;
  }
  if (mode.value === 'register' && !form.enterpriseName.trim()) {
    ElMessage.warning('请输入企业/主体名称');
    return;
  }
  if (mode.value === 'register' && !form.slug.trim()) {
    ElMessage.warning('请输入品牌');
    return;
  }

  loading.value = true;
  try {
    if (mode.value === 'register') {
      await auth.register({
        name: form.name.trim(),
        phone: form.phone,
        password: form.password,
        enterpriseName: form.enterpriseName.trim(),
        slug: form.slug,
      });
      ElMessage.success('注册成功');
    } else {
      await auth.login(form.phone, form.password);
      ElMessage.success('登录成功');
    }
    goAfterLogin();
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : mode.value === 'register' ? '注册失败' : '登录失败');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  align-items: center;
  background: #F5F6FB;
  display: flex;
  justify-content: center;
  min-height: 100%;
  padding: 16px;
}
.login-shell {
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: min(440px, 100%);
}

.login-booting {
  align-items: center;
  color: #667085;
  display: flex;
  flex-direction: column;
  font-size: 13px;
  gap: 12px;
  padding: 64px 0;
}
.login-boot-logo {
  animation: login-boot-pulse 1.2s ease-in-out infinite;
  height: 56px;
  width: 56px;
}
.login-booting p {
  margin: 0;
}
@keyframes login-boot-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}

.login-card {
  background: #fff;
  border: 1px solid #e7eaf0;
  border-radius: 0;
  box-shadow: 0 24px 60px rgba(16, 24, 40, 0.08);
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 28px;
  width: 100%;
}
.login-card--register {
  gap: 8px;
  padding: 16px 20px;
}
.login-card-head {
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 4px;
  text-align: center;
}
.login-logo {
  display: block;
  height: 72px;
  width: 72px;
}
.login-card--register .login-logo {
  height: 56px;
  width: 56px;
}
.login-card-head h2 {
  color: #333946;
  font-size: 22px;
  margin: 0;
}
.login-card--register .login-card-head h2 {
  font-size: 18px;
}
.login-card-head p {
  color: #666;
  font-size: 13px;
  margin: 0;
}
.mode-switch {
  width: 100%;
}
.field {
  display: grid;
  gap: 8px;
}
.field > span {
  color: #666;
  font-size: 13px;
  font-weight: 500;
}
.field-hint {
  color: #98a2b3;
  font-size: 12px;
  line-height: 1.5;
}
.agreement {
  color: #666;
  font-size: 12px;
}
.agreement-consent {
  align-items: center;
  display: flex;
  gap: 8px;
}
.agreement-document {
  color: var(--app-primary-color);
}
.submit-button {
  width: 100%;
}
:deep(.el-input__wrapper) {
  background: #f8fafc;
  border: 1px solid #e7eaf0;
  border-radius: 0;
  box-shadow: none;
  height: 44px;
}
:deep(.el-input__wrapper.is-focus) {
  border-color: var(--app-primary-color);
  box-shadow: 0 0 0 3px rgba(65, 95, 255, 0.1);
}
:deep(.el-segmented),
:deep(.el-segmented__item),
:deep(.el-checkbox__inner) {
  border-radius: 0;
}
:deep(.el-button--primary:not(.is-text):not(.is-link)) {
  background: var(--app-primary-color);
  border-color: var(--app-primary-color);
  border-radius: 0;
  height: 44px;
}
.login-card--register :deep(.el-input__wrapper) {
  height: 36px;
}
.login-card--register :deep(.el-button--primary:not(.is-text):not(.is-link)) {
  height: 36px;
}
</style>
