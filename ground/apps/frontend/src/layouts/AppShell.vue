<template>
  <main class="app-shell" :class="{ 'sidebar-collapsed': isSidebarCollapsed }">
    <aside class="sidebar">
      <div class="brand-row">
        <RouterLink class="brand" :to="homePath" :title="appVersion ? `${brandName} · v${appVersion}` : brandName">
          <span class="brand-logo">
            <img class="brand-logo-mark" src="/logo-icon.png" :alt="brandName" />
            <span class="brand-logo-rest">{{ brandName }}</span>
          </span>
        </RouterLink>
        <el-dropdown trigger="click" popper-class="product-switch-menu" @command="onSwitchProduct">
          <button class="product-switch" type="button" :title="`切换产品 · 当前：${brandName}`">
            <Building2 class="product-switch-icon" />
            <ChevronDown class="product-switch-caret" />
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="console" class="product-switch-current">
                <Check class="dropdown-icon" />{{ brandName }}
              </el-dropdown-item>
              <el-dropdown-item
                command="agent"
                :disabled="!canOpenAgent"
                :title="canOpenAgent ? '' : '当前账号还没有企业工作区'"
              >
                <MessageSquare class="dropdown-icon" />打开猛犸专家客户端
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>

      <nav class="sidebar-nav">
        <template v-for="item in navItems" :key="item.path">
          <div v-if="item.children" class="nav-group" :class="{ 'nav-group-active': isActive(item.path) }">
            <button type="button" class="nav-group-trigger" :title="item.label" :aria-expanded="libraryExpanded && !isSidebarCollapsed" aria-controls="console-library-subnav" @click="toggleLibraryGroup">
              <component :is="item.icon" class="nav-icon" />
              <span class="nav-label">{{ item.label }}</span>
              <ChevronDown class="nav-group-chevron" :class="{ expanded: libraryExpanded }" />
            </button>
            <div id="console-library-subnav" v-show="libraryExpanded && !isSidebarCollapsed" class="sidebar-subnav">
              <RouterLink v-for="child in item.children" :key="child.path" :to="libraryTarget(child.path)" :class="{ active: isActive(child.path) }" :title="child.label"><span class="nav-label">{{ child.label }}</span></RouterLink>
            </div>
          </div>
          <RouterLink v-else :class="{ active: isActive(item.path) }" :to="item.path" :title="item.label">
            <component :is="item.icon" class="nav-icon" />
            <span class="nav-label">{{ item.label }}</span>
          </RouterLink>
        </template>
      </nav>

      <div class="sidebar-footer">
        <div class="chat-jump">
          <button class="chat-jump-open" type="button" title="打开猛犸专家网页版" :disabled="!agentWebUrl" @click="openAgentWeb">
            <MessageSquare class="chat-jump-icon" />
            <span class="chat-jump-label">猛犸专家</span>
          </button>
          <el-dropdown trigger="click" popper-class="agent-open-menu" @command="onAgentCommand">
            <button class="chat-jump-menu" type="button" title="其他打开方式">
              <ChevronDown class="chat-jump-arrow" />
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="client">打开客户端</el-dropdown-item>
                <el-dropdown-item command="download">下载客户端</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        <button
          class="sidebar-collapse"
          type="button"
          :title="isSidebarCollapsed ? '展开侧边栏' : '收起侧边栏'"
          @click="isSidebarCollapsed = !isSidebarCollapsed"
        >
          <ChevronLeft class="collapse-icon" />
          <span class="collapse-label">{{ isSidebarCollapsed ? '展开' : '收起' }}</span>
        </button>
      </div>
    </aside>

    <section class="main-area">
      <WorkbenchBanner v-if="!isPlatformArea" />
      <header class="navbar">
        <div class="navbar-leading">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item>{{ areaLabel }}</el-breadcrumb-item>
            <el-breadcrumb-item>{{ pageTitle }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="navbar-actions">
          <ClientDownloadLink />
          <TenantSwitcher v-if="!isPlatformArea" />
          <el-dropdown trigger="click" popper-class="user-dropdown">
            <span class="user-menu">
              <span class="user-avatar">{{ avatar }}</span>
              <span class="username">{{ session?.user.name }}</span>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <div class="user-menu-card">
                  <span class="user-menu-card-avatar">{{ avatar }}</span>
                  <div class="user-menu-card-info">
                    <div class="user-menu-card-line">
                      <span class="user-menu-card-name">{{ session?.user.name }}</span>
                      <span class="user-menu-card-phone">{{ session?.user.phone || '未绑定手机号' }}</span>
                    </div>
                    <div class="user-menu-card-tags">
                      <span class="user-menu-card-tag">{{ session?.currentTenant?.name || brandName }}</span>
                      <span
                        v-for="r in session?.user.roleNames ?? []"
                        :key="r"
                        class="user-menu-card-tag user-menu-card-tag--role"
                      >{{ r }}</span>
                    </div>
                  </div>
                </div>
                <el-dropdown-item divided @click="openAccountProfile">
                  <UserRound class="dropdown-icon" />
                  个人账号
                </el-dropdown-item>
                <el-dropdown-item @click="openChangePassword">
                  <Lock class="dropdown-icon" />
                  修改密码
                </el-dropdown-item>
                <el-dropdown-item @click="goSettings">
                  <Settings class="dropdown-icon" />
                  企业设置
                </el-dropdown-item>
                <el-dropdown-item @click="openClientDownload">
                  <Download class="dropdown-icon" />
                  下载客户端
                </el-dropdown-item>
                <el-dropdown-item @click="onLogout">
                  <LogOut class="dropdown-icon" />
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>
      <section class="workspace" :class="{ 'library-workspace': isConsoleLibraryPage, 'admin-library-workspace': isAdminLibraryPage }">
        <router-view />
      </section>
    </section>
    <AccountProfileDialog ref="accountDialog" />
    <ChangePasswordDialog ref="passwordDialog" />
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch, type Component } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { consoleLibraryMenuTarget, consoleLibraryNav, consoleLibraryViews, memberLibraryView } from '../utils/libraryNavigation';
import {
  BarChart3,
  Bot,
  Building2,
  Coins,
  Wallet,
  Check,
  ChevronDown,
  ChevronLeft,
  Download,
  FolderOpen,
  Library,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  MessageSquare,
  ScrollText,
  Sparkles,
  Settings,
  Shield,
  UserRound,
  Users,
} from 'lucide-vue-next';
import { hasEnterpriseWorkspace, hasPermission } from '@mammoth/shared';
import { useAuthStore } from '../stores/auth';
import { openClientDownload } from '../stores/clientDownload';
import { clearOctopSession } from '../utils/session';
import { agentWebUrl, openAgentClient, openAgentWeb } from '../utils/agent';
import { useResponsiveSidebar } from './useResponsiveSidebar';
import { fetchAppVersion } from '../api/version';
import WorkbenchBanner from './WorkbenchBanner.vue';
import ClientDownloadLink from '../components/ClientDownloadLink.vue';
import TenantSwitcher from '../components/TenantSwitcher.vue';
import AccountProfileDialog from './AccountProfileDialog.vue';
import ChangePasswordDialog from './ChangePasswordDialog.vue';

const accountDialog = ref<InstanceType<typeof AccountProfileDialog>>();
const passwordDialog = ref<InstanceType<typeof ChangePasswordDialog>>();

function openAccountProfile() {
  accountDialog.value?.show();
}

function openChangePassword() {
  passwordDialog.value?.show();
}

/** 总后台只出平台菜单；企业控制台只出业务菜单。进企业走「进入工作台」。 */
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { isSidebarCollapsed } = useResponsiveSidebar();
const session = computed(() => auth.session);

/** 版本号只读 /console/api/version（同源于 config/version.json）。 */
const appVersion = ref('');
onMounted(async () => {
  try {
    appVersion.value = (await fetchAppVersion()).version;
  } catch {
    // 版本号是装饰信息，取不到就留空，不打断页面。
  }
});

const isConsoleLibraryPage = computed(() => consoleLibraryViews.some(child => child.path === route.path) || route.path === memberLibraryView.path);
const isAdminLibraryPage = computed(() => route.path === '/admin/library' || route.path.startsWith('/admin/library/'));
const libraryChildren = computed(() => consoleLibraryNav(session.value?.currentRole));
const pageTitle = computed(() => (typeof route.meta.title === 'string' ? route.meta.title : '工作台'));
const avatar = computed(() => (session.value?.user.name || '猛').slice(0, 1));
const isPlatformArea = computed(() => route.path.startsWith('/admin'));
const areaLabel = computed(() => (isPlatformArea.value ? '总后台' : '企业控制台'));
const brandName = computed(() => (isPlatformArea.value ? '猛犸管理端' : '企业控制台'));
const homePath = computed(() => (session.value?.user.isPlatformAdmin ? '/admin' : '/console/'));

/** 没有企业工作区的账号切过去只会 403，先禁用。 */
const canOpenAgent = computed(() => hasEnterpriseWorkspace(session.value));

function onAgentCommand(command: string) {
  if (command === 'client') {
    openAgentClient();
  } else if (command === 'download') {
    openClientDownload();
  }
}

function onSwitchProduct(command: string) {
  if (command === 'agent' && canOpenAgent.value) openAgentClient();
}

/** 企业控制台菜单按角色权限渲染；平台管理员直通（isPlatformAdmin 由 hasPermission 的数据保证）。 */
type NavItem = { path: string; label: string; icon: Component; perm?: string; children?: readonly { path: string; label: string }[] };
const businessItems: NavItem[] = [
  { path: '/console/', label: '工作台', icon: LayoutDashboard, perm: 'portal.console.workbench' },
  { path: '/console/knowledge', label: '知识库', icon: FolderOpen, perm: 'portal.console.kb' },
  { path: '/console/library', label: '资料库', icon: Library, perm: 'portal.console.access', children: consoleLibraryViews },
  { path: '/console/members', label: '成员管理', icon: Users, perm: 'portal.console.members' },
  { path: '/console/roles', label: '角色管理', icon: KeyRound, perm: 'portal.console.roles' },
  { path: '/console/usage', label: '操作审计', icon: BarChart3, perm: 'portal.console.usage' },
  { path: '/console/billing', label: 'AI币充值', icon: Coins, perm: 'portal.console.billing' },
  { path: '/console/ai-usage', label: 'AI币用量', icon: BarChart3, perm: 'portal.console.workbench' },
  { path: '/console/settings', label: '企业设置', icon: Settings, perm: 'portal.console.settings' },
];

const platformItems: NavItem[] = [
  { path: '/admin', label: '概况', icon: LayoutDashboard },
  { path: '/admin/users', label: '用户管理', icon: Users },
  { path: '/admin/roles', label: '角色管理', icon: Shield },
  { path: '/admin/enterprises', label: '企业管理', icon: Building2 },
  { path: '/admin/enterprise-wallets', label: '企业钱包', icon: Wallet },
  { path: '/admin/enterprise-token-stats', label: '企业token用量', icon: BarChart3 },
  { path: '/admin/official-agents', label: '专家配置', icon: Bot },
  { path: '/admin/official-skills', label: '技能管理', icon: Sparkles },
  { path: '/admin/official-knowledge', label: '猛犸知识库', icon: FolderOpen },
  { path: '/admin/models', label: '模型管理', icon: Bot },
  { path: '/admin/pricing-config', label: 'AI币计价配置', icon: Coins },
  { path: '/admin/audit', label: '操作审计', icon: ScrollText, perm: 'portal.admin.audit' },
  { path: '/admin/library', label: '企业资料库', icon: Library },
];

const navItems = computed(() => {
  const items = isPlatformArea.value
    ? platformItems.filter((item) => !item.perm || hasPermission(session.value, item.perm))
    : session.value?.user.isPlatformAdmin
      ? businessItems
      : businessItems.filter((item) => !item.perm || hasPermission(session.value, item.perm));
  return items.map((item) => item.path === '/console/library' ? { ...item, children: libraryChildren.value } : item);
});

// Expansion is navigation state only; the parent button never changes route/Layout.
const libraryExpanded = ref(true);
watch(() => route.fullPath, () => {
  if (consoleLibraryViews.some(item => item.path === route.path) || route.path === memberLibraryView.path) libraryExpanded.value = true;
}, { immediate: true });
function toggleLibraryGroup() {
  if (isSidebarCollapsed.value) { isSidebarCollapsed.value = false; libraryExpanded.value = true; }
  else libraryExpanded.value = !libraryExpanded.value;
}
function libraryTarget(path: string) {
  return consoleLibraryMenuTarget(path);
}

function isActive(path: string) {
  if (path === '/console/' || path === '/console') {
    return route.path === '/console' || route.path === '/console/';
  }
  if (path === '/admin') {
    return route.path === '/admin' || route.path === '/admin/';
  }
  return route.path === path || route.path.startsWith(`${path}/`);
}

function goSettings() {
  router.push(session.value?.user.isPlatformAdmin && !session.value.currentTenant ? '/admin' : '/console/settings');
}

async function onLogout() {
  // 先清 Octop 侧会话：clearOctopSession 走裸 fetch 不经 request()，Cookie 失效也不会被挂起；
  // 再清中台会话（auth.logout 内部已先同步 clear，不依赖请求落地），最后回登录页。
  await clearOctopSession();
  await auth.logout();
  // 跳转由 http.ts 401 分支兜底，此处 await 可能不落地，勿在其后追加逻辑。
  window.location.href = '/login';
}
</script>
<style scoped>
.workspace.library-workspace { background:#fff; display:flex; flex-direction:column; }
.workspace.admin-library-workspace { background:#fff; padding:0; display:flex; flex-direction:column; }
.nav-group-trigger { align-items:center; display:flex; gap:10px; width:100%; height:44px; padding:0 18px; border:0; background:transparent; color:#667085; font:inherit; cursor:pointer; text-align:left; }
.nav-group-trigger:hover { background:#EEF0F8; color:var(--app-primary-color); }
.nav-group-active > .nav-group-trigger { color:var(--app-primary-color); }
.nav-group-chevron { margin-left:auto; width:14px; height:14px; transition:transform .18s ease; }
.nav-group-chevron.expanded { transform:rotate(180deg); }
.sidebar-subnav a { height:38px; padding-left:46px; }
.sidebar-subnav .nav-label { font-size:13px; }
.sidebar-collapsed .nav-group-trigger { justify-content:center; gap:0; padding:0; }
.sidebar-collapsed .nav-group-chevron { display:none; }
.nav-group-trigger:focus-visible { outline:2px solid var(--app-primary-color); outline-offset:-3px; }
</style>
