import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import { MembershipService } from '../src/membership/membership.service';
import { effectivePlan, expiryAfterPayment } from '../src/membership/plan';
import { assertAgentMembership } from '../src/membership/access';
import { ForbiddenException } from '@nestjs/common';
import { RechargeSettleService } from '../src/pay/recharge-settle.service';

const paidAt = new Date('2026-01-15T00:00:00.000Z');

describe('membership plan', () => {
  it('keeps standard forever and drops expired paid plans', () => {
    assert.equal(effectivePlan('standard', null, paidAt), 'standard');
    assert.equal(effectivePlan('pro', new Date('2026-01-15T00:00:00.000Z'), paidAt), 'standard');
    assert.equal(effectivePlan('flagship', new Date('2026-06-01T00:00:00.000Z'), paidAt), 'flagship');
  });

  it('renews the same plan from the old expiry and restarts on upgrade', () => {
    const renewed = expiryAfterPayment({
      currentPlan: 'pro',
      currentExpiresAt: new Date('2026-06-01T00:00:00.000Z'),
      target: 'pro',
      paidAt,
    });
    assert.equal(renewed.toISOString(), '2027-06-01T00:00:00.000Z');
    const upgraded = expiryAfterPayment({
      currentPlan: 'pro',
      currentExpiresAt: new Date('2026-06-01T00:00:00.000Z'),
      target: 'flagship',
      paidAt,
    });
    assert.equal(upgraded.toISOString(), '2027-01-15T00:00:00.000Z');
  });

  it('does not lock the platform workspace and locks a standard enterprise', async () => {
    await assertAgentMembership({}, null, 'flagship');
    await assert.rejects(
      assertAgentMembership({
        tenant: { findUnique: async () => ({ membershipPlan: 'standard', membershipExpiresAt: null, type: 'ENTERPRISE' }) },
      }, 'tenant-1', 'pro'),
      (error: unknown) => error instanceof ForbiddenException && error.message === 'MEMBERSHIP_REQUIRED',
    );
  });
});

describe('membership payment', () => {
  it('writes one order and upgrades once for the same trade', async () => {
    const orders = new Map<string, { providerTradeNo: string; expiresAt: Date }>();
    const tenant = {
      id: 't1',
      type: 'ENTERPRISE',
      status: 'active',
      membershipPlan: 'standard',
      membershipExpiresAt: null as Date | null,
    };
    const prisma: any = {
      async $transaction(fn: (tx: typeof prisma) => Promise<unknown>) { return fn(prisma); },
      membershipOrder: {
        async findUnique({ where }: { where: { providerTradeNo: string } }) {
          return orders.get(where.providerTradeNo) ?? null;
        },
        async create({ data }: { data: { providerTradeNo: string; expiresAt: Date } }) {
          if (orders.has(data.providerTradeNo)) {
            throw new Prisma.PrismaClientKnownRequestError('Unique', { code: 'P2002', clientVersion: 'test' });
          }
          const row = { id: 'order-1', ...data };
          orders.set(data.providerTradeNo, row);
          return row;
        },
      },
      tenant: {
        async findUnique() { return { ...tenant }; },
        async update({ data }: { data: { membershipPlan: string; membershipExpiresAt: Date } }) {
          tenant.membershipPlan = data.membershipPlan;
          tenant.membershipExpiresAt = data.membershipExpiresAt;
          return tenant;
        },
      },
      auditLog: { async create() { return { id: 'audit' }; } },
    };
    const service = new MembershipService(prisma as never);
    const input = {
      tenantId: 't1',
      plan: 'pro' as const,
      amountCents: 200000,
      provider: 'wechat' as const,
      providerTradeNo: 'wx-1',
      paidAt,
    };
    const first = await service.applyPaymentSuccess(input);
    const second = await service.applyPaymentSuccess(input);
    assert.equal(first.applied, true);
    assert.equal(second.applied, false);
    assert.equal(orders.size, 1);
    assert.equal(tenant.membershipPlan, 'pro');
    assert.equal(tenant.membershipExpiresAt?.toISOString(), '2027-01-15T00:00:00.000Z');
  });

  it('settles one checkout once and ignores an unknown merchant number', async () => {
    const orders = new Map<string, { providerTradeNo: string }>();
    const tenant = { id: 't1', type: 'ENTERPRISE', membershipPlan: 'standard', membershipExpiresAt: null as Date | null };
    const checkout = { outTradeNo: 'W1', tenantId: 't1', plan: 'pro', amountCents: 200000, provider: 'wechat' };
    const prisma: any = {
      async $transaction(fn: (tx: typeof prisma) => Promise<unknown>) { return fn(prisma); },
      membershipCheckout: { async findUnique({ where }: { where: { outTradeNo: string } }) { return where.outTradeNo === 'W1' ? checkout : null; } },
      membershipOrder: {
        async findUnique({ where }: { where: { providerTradeNo: string } }) { return orders.get(where.providerTradeNo) ?? null; },
        async create({ data }: { data: { providerTradeNo: string } }) {
          if (orders.has(data.providerTradeNo)) throw new Prisma.PrismaClientKnownRequestError('Unique', { code: 'P2002', clientVersion: 'test' });
          const row = { id: 'order-1', ...data };
          orders.set(data.providerTradeNo, row);
          return row;
        },
      },
      tenant: {
        async findUnique() { return { ...tenant }; },
        async update({ data }: { data: { membershipPlan: string; membershipExpiresAt: Date } }) {
          tenant.membershipPlan = data.membershipPlan;
          tenant.membershipExpiresAt = data.membershipExpiresAt;
        },
      },
      auditLog: { async create() { return {}; } },
    };
    const service = new MembershipService(prisma);
    const input = { outTradeNo: 'W1', provider: 'wechat' as const, providerTradeNo: 'tx-1', amountCents: 200000, paidAt };
    const first = await service.settleCheckout(input);
    const second = await service.settleCheckout(input);
    const miss = await service.settleCheckout({ ...input, outTradeNo: 'missing' });
    assert.equal(first.handled && first.applied, true);
    assert.equal(second.handled && second.applied, false);
    assert.equal(miss.handled, false);
    assert.equal(orders.size, 1);
    await assert.rejects(() => service.settleCheckout({ ...input, amountCents: 1 }));
    assert.equal(orders.size, 1);
  });
});

describe('membership notify', () => {
  it('does not credit AI coins for a membership trade or an unpaid notice', async () => {
    let coins = 0;
    let recharged = 0;
    const paid = new RechargeSettleService(
      { $transaction() { recharged += 1; } } as never,
      {} as never,
      { creditQrTopup: async () => { coins += 1; } } as never,
      { parseNotify: async () => ({ outTradeNo: 'W1', transactionId: 'tx', tradeState: 'SUCCESS', amountFen: 100, successTime: '' }) } as never,
      {} as never,
      { settleCheckout: async () => ({ handled: true, applied: true }) } as never,
    );
    const result = await paid.handleWechatNotify(Buffer.from('{}'), {});
    assert.deepEqual(result, { code: 'SUCCESS', message: '成功' });
    assert.equal(coins, 0);
    assert.equal(recharged, 0);

    let settled = 0;
    const unpaid = new RechargeSettleService(
      {} as never,
      {} as never,
      {} as never,
      { parseNotify: async () => ({ outTradeNo: 'W1', transactionId: '', tradeState: 'NOTPAY', amountFen: 100, successTime: '' }) } as never,
      {} as never,
      { settleCheckout: async () => { settled += 1; return { handled: false }; } } as never,
    );
    await unpaid.handleWechatNotify(Buffer.from('{}'), {});
    assert.equal(settled, 0);
    assert.equal(coins, 0);
  });
});
