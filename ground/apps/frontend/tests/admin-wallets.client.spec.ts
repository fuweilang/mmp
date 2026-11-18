import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, type App } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useAdminEnterpriseWallets } from '@/components/admin/wallets/useAdminEnterpriseWallets';

const billing = vi.hoisted(() => ({
  listWallets: vi.fn(),
  getEnterpriseFunds: vi.fn(),
  listRechargeOrders: vi.fn(async () => ({ items: [], page: 1, pageSize: 20, total: 0 })),
  adjustWallet: vi.fn(),
}));

vi.mock('@/api/admin', () => ({
  adminBillingApi: {
    listWallets: billing.listWallets,
    getEnterpriseFunds: billing.getEnterpriseFunds,
    listRechargeOrders: billing.listRechargeOrders,
    adjustWallet: billing.adjustWallet,
  },
}));

const wallet = {
  tenantId: 't-hong',
  tenantName: '洪海测试',
  tenantSlug: 'hong',
  tenantType: 'ENTERPRISE',
  tenantStatus: 'ACTIVE',
  balanceCoins: 50000,
  totalCredited: 50000,
  totalDebited: 0,
  updatedAt: '2026-11-18T09:25:00.000Z',
  admins: [{ id: 'u1', name: '洪海', phone: '17385948389' }],
};

function fundsReport() {
  return {
    tenant: { id: 't-hong', name: '洪海测试', slug: 'hong' },
    wallet: { balanceCoins: 50000, totalCredited: 50000, totalDebited: 0 },
    ledger: [],
    ledgerPage: { page: 1, pageSize: 20, total: 1 },
  };
}

describe('企业 AI 币列表', () => {
  const mounted: App[] = [];

  afterEach(() => {
    for (const app of mounted) app.unmount();
    mounted.length = 0;
    localStorage.clear();
    vi.clearAllMocks();
  });

  async function openFundsPage() {
    localStorage.setItem('admin.enterprise-wallets.tenantId', 't-hong');
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/admin/enterprise-wallets', component: { render: () => h('div') } }],
    });
    await router.push('/admin/enterprise-wallets?tenantId=t-hong&tab=wallets');
    await router.isReady();
    let api!: ReturnType<typeof useAdminEnterpriseWallets>;
    const Root = defineComponent({
      setup() {
        api = useAdminEnterpriseWallets();
        return () => h('div');
      },
    });
    const app = createApp(Root);
    app.use(router);
    const el = document.createElement('div');
    document.body.appendChild(el);
    app.mount(el);
    mounted.push(app);
    return api;
  }

  it('入账后的列表盖过更早发出的空列表，并保留当前企业筛选', async () => {
    let releaseStale: () => void = () => {};
    billing.listWallets.mockImplementation(() => {
      if (billing.listWallets.mock.calls.length === 1) {
        return new Promise((resolve) => {
          releaseStale = () => resolve([]);
        });
      }
      return Promise.resolve([wallet]);
    });
    billing.getEnterpriseFunds.mockResolvedValue(fundsReport());

    const api = await openFundsPage();
    await vi.waitFor(() => expect(billing.listWallets).toHaveBeenCalledTimes(2));
    releaseStale();
    await vi.waitFor(() => expect(api.filteredWallets.value.map((row) => row.tenantId)).toEqual(['t-hong']));
    expect(api.drawerTitle.value).toBe('洪海测试');
    expect(api.selectedTenantId.value).toBe('t-hong');
    expect(api.walletsPage.value).toBe(1);

    await api.onLedgerPageChange(2);
    expect(billing.listWallets).toHaveBeenCalledTimes(2);
    expect(billing.getEnterpriseFunds).toHaveBeenCalledTimes(2);
  });
});
