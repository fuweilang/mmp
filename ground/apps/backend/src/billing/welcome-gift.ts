import { Prisma } from '@prisma/client';
import {
  CONFIG_ID,
  DEFAULT_AI_COINS_PER_YUAN,
  DEFAULT_WELCOME_GIFT_YUAN,
  yuanToAiCoins,
} from './billing.shared';

export { DEFAULT_WELCOME_GIFT_YUAN };

/** 新企业开户赠送流水类型 */
export const LEDGER_TYPE_SIGNUP_GIFT = 'signup_gift';

type TxClient = Prisma.TransactionClient;

/**
 * 在同一事务内按平台配置入账开户赠送。
 * welcomeGiftYuan=0 或折算 coins<=0 → 不入账。
 * 幂等键：signup_gift:{tenantId}
 */
export async function creditSignupGiftInTx(
  tx: TxClient,
  params: {
    tenantId: string;
    walletId: string;
    actorUserId?: string | null;
  },
): Promise<{ credited: boolean; coins: number; giftYuan: number }> {
  const config = await tx.platformBillingConfig.findUnique({ where: { id: CONFIG_ID } });
  const giftYuanRaw = config ? Number(config.welcomeGiftYuan) : DEFAULT_WELCOME_GIFT_YUAN;
  const giftYuan = Number.isFinite(giftYuanRaw) ? giftYuanRaw : 0;
  const rate = config?.aiCoinsPerYuan ?? DEFAULT_AI_COINS_PER_YUAN;
  const coins = yuanToAiCoins(giftYuan, rate);
  if (coins <= 0) {
    return { credited: false, coins: 0, giftYuan };
  }

  const idempotencyKey = `${LEDGER_TYPE_SIGNUP_GIFT}:${params.tenantId}`;
  const existing = await tx.tenantAiLedger.findUnique({ where: { idempotencyKey } });
  if (existing) {
    return { credited: false, coins: existing.coins, giftYuan };
  }

  const updated = await tx.tenantAiWallet.update({
    where: { id: params.walletId },
    data: {
      balanceCoins: { increment: coins },
      totalCredited: { increment: coins },
    },
  });

  await tx.tenantAiLedger.create({
    data: {
      tenantId: params.tenantId,
      walletId: params.walletId,
      type: LEDGER_TYPE_SIGNUP_GIFT,
      direction: 'in',
      coins,
      balanceAfter: updated.balanceCoins,
      idempotencyKey,
      remark: `新企业开户赠送 ¥${giftYuan.toFixed(2)}`,
      operatorUserId: params.actorUserId ?? undefined,
      actorUserId: params.actorUserId ?? undefined,
      meta: {
        welcomeGiftYuan: giftYuan,
        aiCoinsPerYuan: rate,
      },
    },
  });

  return { credited: true, coins, giftYuan };
}

/**
 * 一家企业只送一次。已有 signup_gift 流水时不再入账，因此之后修改开户赠送金额不会改已有余额。
 * 平台租户和停用企业不送。返回 true 表示这件事已经定下来，调用方不必再查。
 */
export async function creditSignupGiftForTenant(
  db: {
    tenant: {
      findUnique(args: {
        where: { id: string };
        select: { type: true; status: true };
      }): Promise<{ type: string; status: string } | null>;
    };
    $transaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T>;
  },
  params: { tenantId: string; actorUserId?: string | null },
): Promise<boolean> {
  const tenant = await db.tenant.findUnique({
    where: { id: params.tenantId },
    select: { type: true, status: true },
  });
  if (!tenant || tenant.type === 'PLATFORM') return true;
  if (tenant.status !== 'active') return false;

  const apply = () => db.$transaction(async (tx) => {
    let wallet = await tx.tenantAiWallet.findUnique({ where: { tenantId: params.tenantId } });
    if (!wallet) {
      wallet = await tx.tenantAiWallet.create({
        data: { tenantId: params.tenantId, balanceCoins: 0 },
      });
    }
    const gift = await creditSignupGiftInTx(tx, {
      tenantId: params.tenantId,
      walletId: wallet.id,
      actorUserId: params.actorUserId,
    });
    if (gift.credited || gift.coins > 0) return true;
    const existing = await tx.tenantAiLedger.findUnique({
      where: { idempotencyKey: `${LEDGER_TYPE_SIGNUP_GIFT}:${params.tenantId}` },
    });
    return Boolean(existing);
  });

  try {
    return await apply();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return apply();
    }
    throw err;
  }
}
