import { createRouter, createWebHistory } from 'vue-router';
import { ElMessage } from 'element-plus';
import { canAccessAdmin, canAccessConsole, hasPermission } from '@mammoth/shared';
import { useAuthStore } from '../stores/auth';
import { redirectToAgentWeb } from '../utils/agent';
/** 本次整页加载是否已刷新过会话权限（含总后台与企业控制台，避免旧缓存里的 effectivePermissions 一直生效）。 */
let sessionRefreshed = false;
const AppShell = () => import('../layouts/AppShell.vue');

function goAgentOrReport() {
  if (!redirectToAgentWeb()) ElMessage.error('猛犸智能体地址未配置，请联系管理员');
  return false;
}

const router = createRouter({
  history: createWebHistory('/'),
  routes: [
    { path: '/login', component: () => import('../views/Login.vue') },
    { path: '/library', meta: { title: '资料库' }, component: () => import('../views/Library.vue') },
    { path: '/console/library', redirect: '/library' },
    {
      path: '/admin',
      component: AppShell,
      children: [
        { path: '', meta: { title: '概况' }, component: () => import('../views/admin/AdminHome.vue') },
        { path: 'users', meta: { title: '用户管理' }, component: () => import('../views/admin/AdminUsers.vue') },
        { path: 'roles', meta: { title: '角色管理' }, component: () => import('../views/admin/AdminRoles.vue') },
        {
          path: 'enterprises',
          meta: { title: '企业管理' },
          component: () => import('../views/admin/AdminEnterprises.vue'),
        },
        {
          path: 'enterprise-token-stats',
          meta: { title: '企业token用量' },
          component: () => import('../views/admin/AdminEnterpriseTokenStats.vue'),
        },
        {
          path: 'token-stats',
          redirect: (to) => ({
            path: '/admin/enterprise-token-stats',
            query: to.query,
            hash: to.hash,
          }),
        },
        {
          path: 'enterprise-usage',
          redirect: (to) => ({
            path: '/admin/enterprise-token-stats',
            query: to.query,
            hash: to.hash,
          }),
        },
        {
          path: 'models',
          meta: { title: '模型管理' },
          component: () => import('../views/admin/AdminModels.vue'),
        },
        {
          path: 'pricing-config',
          meta: { title: 'AI币计价配置' },
          component: () => import('../views/admin/AdminPricingConfig.vue'),
        },
        {
          path: 'enterprise-wallets',
          meta: { title: '企业钱包' },
          component: () => import('../views/admin/AdminEnterpriseWallets.vue'),
        },
        {
          path: 'audit',
          meta: { title: '操作审计', perm: 'portal.admin.audit' },
          component: () => import('../views/admin/AdminAudit.vue'),
        },
        {
          path: 'library',
          meta: { title: '资料库概况' },
          component: () => import('../views/admin/AdminLibrary.vue'),
        },
        {
          path: 'billing',
          redirect: (to) => {
            const q = to.query;
            const hasWalletIntent =
              typeof q.tenantId === 'string' ||
              q.tab === 'funds' ||
              q.tab === 'wallets' ||
              q.tab === 'orders';
            return {
              path: hasWalletIntent ? '/admin/enterprise-wallets' : '/admin/pricing-config',
              query: q,
              hash: to.hash,
            };
          },
        },
      ],
    },
    {
      path: '/console',
      component: AppShell,
      children: [
        { path: '', meta: { title: '工作台', perm: 'portal.console.workbench' }, component: () => import('../views/Home.vue') },
        { path: 'knowledge', meta: { title: '知识库', perm: 'portal.console.kb' }, component: () => import('../views/Knowledge.vue') },
        { path: 'members', meta: { title: '成员管理', perm: 'portal.console.members' }, component: () => import('../views/Members.vue') },
        { path: 'roles', meta: { title: '角色管理', perm: 'portal.console.roles' }, component: () => import('../views/Roles.vue') },
        { path: 'usage', meta: { title: '操作审计', perm: 'portal.console.usage' }, component: () => import('../views/Usage.vue') },
        { path: 'billing', meta: { title: 'AI币充值', perm: 'portal.console.billing' }, component: () => import('../views/ConsoleBilling.vue') },
        { path: 'ai-usage', meta: { title: 'AI币用量', perm: 'portal.console.workbench' }, component: () => import('../views/ConsoleAiUsage.vue') },
        { path: 'settings', meta: { title: '企业设置', perm: 'portal.console.settings' }, component: () => import('../views/Settings.vue') },
      ],
    },
    {
      path: '/middle/:pathMatch(.*)*',
      redirect: (to) => {
        const raw = to.params.pathMatch;
        const rest = Array.isArray(raw) ? raw.filter(Boolean).join('/') : raw || '';
        return { path: rest ? `/console/${rest}` : '/console', query: to.query, hash: to.hash };
      },
    },
  ],
});

router.beforeEach(async (to) => {
  if (to.path === '/login') return true;

  const auth = useAuthStore();
  if (!auth.session) {
    try {
      await auth.load();
    } catch {
      return '/login';
    }
  }

  // 权限按角色实时计算：每次整页加载首次进受保护区（总后台/控制台）时刷新一次会话，
  // 避免角色/权限改完后仍用 localStorage 里的旧 effectivePermissions。
  if (!sessionRefreshed && (to.path.startsWith('/admin') || to.path.startsWith('/console'))) {
    sessionRefreshed = true;
    try {
      await auth.load();
    } catch {
      return '/login';
    }
  }

  const session = auth.session;

  // 总后台只对平台管理员开放；无控制台权限的企业成员直接回智能终端。
  if (to.path.startsWith('/admin')) {
    if (!canAccessAdmin(session)) {
      if (canAccessConsole(session)) {
        ElMessage.warning('无权访问总后台');
        return '/console';
      }
      return goAgentOrReport();
    }
    const adminPerm = typeof to.meta.perm === 'string' ? to.meta.perm : '';
    if (adminPerm && !hasPermission(session, adminPerm)) {
      ElMessage.warning(`没有「${typeof to.meta.title === 'string' ? to.meta.title : '该模块'}」的访问权限`);
      return '/admin';
    }
    return true;
  }

  if (to.path.startsWith('/console')) {
    if (session?.user.isPlatformAdmin && !session.currentTenant) {
      const wanted = typeof to.query.tenantId === 'string' ? to.query.tenantId : '';
      if (wanted) {
        try {
          await auth.switchTenant(wanted);
          return true;
        } catch {
          return '/admin';
        }
      }
      return '/admin';
    }

    if (!canAccessConsole(session)) {
      if (session?.user.isPlatformAdmin) return '/admin';
      return goAgentOrReport();
    }
    // 企业被停用：平台管理员退回总后台，其余用户停止进入控制台。
    if (session?.currentTenant && session.currentTenant.status !== 'active') {
      ElMessage.warning('该企业已被停用');
      if (session.user.isPlatformAdmin) return '/admin';
      return false;
    }

    // 控制台子页面按模块权限路由；无权限时回工作台或停止导航。
    const perm = typeof to.meta.perm === 'string' ? to.meta.perm : '';
    if (perm && !hasPermission(session, perm)) {
      ElMessage.warning(`没有「${typeof to.meta.title === 'string' ? to.meta.title : '该模块'}」的访问权限`);
      if (hasPermission(session, 'portal.console.workbench')) return '/console/';
      if (session?.user.isPlatformAdmin) return '/admin';
      return false;
    }
  }

  return true;
});

export default router;