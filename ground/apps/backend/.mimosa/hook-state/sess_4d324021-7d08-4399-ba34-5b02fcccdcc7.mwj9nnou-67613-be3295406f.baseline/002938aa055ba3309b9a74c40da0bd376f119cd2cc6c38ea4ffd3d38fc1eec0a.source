import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChargeBillingDto } from './dto/billing.dto';
import { BillingConfigService } from './billing-config.service';
import { WalletService } from './wallet.service';
import { chargeCoins } from './billing.shared';
import { settleModelPrice, type ModelPricingSnapshot } from './model-pricing';

/** 网关一次对话派生的三类幂等键（同一 baseKey 贯穿冻结/结算/解冻）。 */
export function billingKeys(baseKey: string) {
  return {
    freezeKey: `gw-freeze-${baseKey}`,
    chargeKey: `gw-charge-${baseKey}`,
    unfreezeKey: `gw-unfreeze-${baseKey}`,
  };
}

export type FreezeDto = {
  idempotencyKey: string;
  coins: number;
  provider: string;
  model: string;
  inputEstimate: number;
  outputEstimate: number;
};

export type SettleFrozenDto = {
  freezeKey: string;
  unfreezeKey: string;
  charge: ChargeBillingDto;
};

function monthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function requireTenantIdOrThrow(tenantId: string | null): string {
  if (!tenantId) throw new BadRequestException('请先选择企业');
  return tenantId;
}

function shouldSkipBilling(user: User, tenantId: string | null) {
  return !!user.isPlatformAdmin;
}

@Injectable()
export class ChargeService {
  constructor(
    private prisma: PrismaService,
    private config: BillingConfigService,
    private wallet: WalletService,
  ) {}

  async precheck(user: User, tenantId: string | null, estimatedTokens?: number) {
    if (shouldSkipBilling(user, tenantId)) {
      return { ok: true, skipped: true, reason: 'exempt', unlimited: true, balanceCoins: null, requiredCoins: 0 };
    }
    const id = requireTenantIdOrThrow(tenantId);
    const config = await this.config.ensureConfig();
    const multiplier = Number(config.sellPriceMultiplier);
    // 粗闸门：真正的额度校验在 freeze（按估算上限冻结）。这里只挡空钱包。
    const required = 1;
    const wallet = await this.wallet.ensureWallet(id);
    if (wallet.balanceCoins < required) {
      throw new HttpException(
        {
          message: '企业 AI 币余额不足，请联系管理员充值',
          code: 'INSUFFICIENT_AI_COINS',
          balanceCoins: wallet.balanceCoins,
          requiredCoins: required,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return {
      ok: true,
      skipped: false,
      balanceCoins: wallet.balanceCoins,
      requiredCoins: required,
      sellPriceMultiplier: multiplier,
      tokensPerAiCoin: config.tokensPerAiCoin,
    };
  }

  /** 企业/用户月度 Token 额度；0 = 不限。超额 429，先于钱包冻结。 */
  private async assertTokenQuota(tenantId: string, userId: string) {
    const start = monthStart();
    const [quota, userQuota] = await Promise.all([
      this.prisma.quota.findUnique({ where: { tenantId } }),
      this.prisma.userTokenQuota.findUnique({
        where: { tenantId_userId: { tenantId, userId } },
      }),
    ]);
    if (quota && quota.monthlyTokens > 0) {
      const used = await this.prisma.tokenUsageTurn.aggregate({
        where: { tenantId, occurredAt: { gte: start } },
        _sum: { totalTokens: true },
      });
      const usedTokens = used._sum.totalTokens ?? 0;
      if (usedTokens >= quota.monthlyTokens) {
        throw new HttpException(
          {
            message: '企业本月 Token 额度已用完，请联系管理员调整额度或下月再试',
            code: 'TOKEN_QUOTA_EXCEEDED',
            scope: 'tenant',
            monthlyTokens: quota.monthlyTokens,
            usedTokens,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    if (userQuota && userQuota.monthlyTokens > 0) {
      const used = await this.prisma.tokenUsageTurn.aggregate({
        where: { tenantId, userId, occurredAt: { gte: start } },
        _sum: { totalTokens: true },
      });
      const usedTokens = used._sum.totalTokens ?? 0;
      if (usedTokens >= userQuota.monthlyTokens) {
        throw new HttpException(
          {
            message: '你本月 Token 额度已用完，请联系企业管理员调整额度',
            code: 'TOKEN_QUOTA_EXCEEDED',
            scope: 'user',
            monthlyTokens: userQuota.monthlyTokens,
            usedTokens,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  /**
   * 请求前冻结：按估算上限（输入估算 + max_tokens，全部按非缓存价）扣钱包，
   * 写 chat_freeze 流水。余额不足 402，请求不发给上游。幂等：同 key 重入返回已冻结额。
   */
  async freeze(user: User, tenantId: string | null, dto: FreezeDto) {
    if (shouldSkipBilling(user, tenantId)) {
      return { ok: true, skipped: true, reason: 'exempt', frozenCoins: 0, balanceCoins: null };
    }
    const id = requireTenantIdOrThrow(tenantId);
    await this.assertTokenQuota(id, user.id);
    const coins = Math.max(1, Math.floor(dto.coins));

    const existing = await this.prisma.tenantAiLedger.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) {
      if (existing.tenantId !== id) throw new BadRequestException('冻结幂等键不属于当前企业');
      const wallet = await this.wallet.ensureWallet(id);
      return { ok: true, skipped: false, reused: true, frozenCoins: existing.coins, balanceCoins: wallet.balanceCoins };
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        let wallet = await tx.tenantAiWallet.findUnique({ where: { tenantId: id } });
        if (!wallet) {
          wallet = await tx.tenantAiWallet.create({ data: { tenantId: id, balanceCoins: 0 } });
        }
        const updated = await tx.tenantAiWallet.updateMany({
          where: { id: wallet.id, balanceCoins: { gte: coins } },
          data: { balanceCoins: { decrement: coins } },
        });
        if (updated.count === 0) {
          throw new HttpException(
            {
              message: '企业 AI 币余额不足（按本次请求上限预冻结），请联系管理员充值',
              code: 'INSUFFICIENT_AI_COINS',
              balanceCoins: wallet.balanceCoins,
              requiredCoins: coins,
            },
            HttpStatus.PAYMENT_REQUIRED,
          );
        }
        const fresh = await tx.tenantAiWallet.findUniqueOrThrow({ where: { id: wallet.id } });
        const ledger = await tx.tenantAiLedger.create({
          data: {
            tenantId: id,
            walletId: wallet.id,
            type: 'chat_freeze',
            direction: 'out',
            coins,
            balanceAfter: fresh.balanceCoins,
            idempotencyKey: dto.idempotencyKey,
            remark: `对话预冻结（${dto.provider}/${dto.model}）`,
            actorUserId: user.id,
            meta: {
              provider: dto.provider,
              model: dto.model,
              inputEstimate: dto.inputEstimate,
              outputEstimate: dto.outputEstimate,
              freeze: true,
            },
          },
        });
        return { ledger, balanceCoins: fresh.balanceCoins };
      });
      return { ok: true, skipped: false, reused: false, frozenCoins: coins, balanceCoins: result.balanceCoins, ledgerId: result.ledger.id };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const again = await this.prisma.tenantAiLedger.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
        });
        if (again) {
          if (again.tenantId !== id) throw new BadRequestException('冻结幂等键不属于当前企业');
          const wallet = await this.wallet.ensureWallet(id);
          return { ok: true, skipped: false, reused: true, frozenCoins: again.coins, balanceCoins: wallet.balanceCoins };
        }
      }
      throw err;
    }
  }

  /**
   * 完成后结算（多退少补，同一事务）：
   * 1) 解冻退回冻结额（chat_unfreeze，幂等）；
   * 2) 按实际用量扣费（chat_consume，幂等）。
   * 实际扣费允许把余额打成负数（价格快照是权威，超估计部分补扣）；
   * 下一次请求会被 freeze 的 402 拦住。
   */
  async settleFrozen(user: User, tenantId: string | null, dto: SettleFrozenDto, snapshot: ModelPricingSnapshot) {
    if (shouldSkipBilling(user, tenantId)) {
      return { ok: true, skipped: true, reason: 'exempt', chargedCoins: 0, balanceCoins: null };
    }
    const id = requireTenantIdOrThrow(tenantId);
    const chargeDto = dto.charge;

    const existingCharge = await this.prisma.tenantAiLedger.findUnique({
      where: { idempotencyKey: chargeDto.idempotencyKey },
    });
    if (existingCharge) {
      if (existingCharge.tenantId !== id) throw new BadRequestException('扣费幂等键不属于当前企业');
      // 补解冻：上次事务若在解冻后中断，这里兜底（同事务内两者原子，这里主要是防御）。
      await this.releaseFrozen(user, id, { freezeKey: dto.freezeKey, unfreezeKey: dto.unfreezeKey, reason: 'settle-retry' });
      const wallet = await this.wallet.ensureWallet(id);
      return { ok: true, skipped: false, reused: true, chargedCoins: existingCharge.coins, balanceCoins: wallet.balanceCoins, ledgerId: existingCharge.id };
    }

    if (!chargeDto.provider || !chargeDto.model || chargeDto.inputTokens == null || chargeDto.outputTokens == null) {
      throw new BadRequestException('扣费必须提供模型、输入和输出 Token 用量');
    }
    if (chargeDto.tokens !== chargeDto.inputTokens + chargeDto.outputTokens) throw new BadRequestException('总 Token 与输入输出不一致');
    if (snapshot.modelRef !== `${chargeDto.provider}/${chargeDto.model}`) throw new BadRequestException('计价模型不一致');
    const settled = settleModelPrice(snapshot, chargeDto.inputTokens, chargeDto.outputTokens, chargeDto.cachedInputTokens ?? 0, chargeDto.cacheWrite5mTokens ?? 0, chargeDto.cacheWrite1hTokens ?? 0);
    const charged = settled.chargedCoins;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        let wallet = await tx.tenantAiWallet.findUnique({ where: { tenantId: id } });
        if (!wallet) {
          wallet = await tx.tenantAiWallet.create({ data: { tenantId: id, balanceCoins: 0 } });
        }

        // 1) 解冻（同事务，和扣费原子）
        let refundedCoins = 0;
        const freezeLedger = await tx.tenantAiLedger.findUnique({ where: { idempotencyKey: dto.freezeKey } });
        if (freezeLedger) {
          const unfreezeExisting = await tx.tenantAiLedger.findUnique({ where: { idempotencyKey: dto.unfreezeKey } });
          if (!unfreezeExisting) {
            const back = await tx.tenantAiWallet.update({
              where: { id: wallet.id },
              data: { balanceCoins: { increment: freezeLedger.coins } },
            });
            await tx.tenantAiLedger.create({
              data: {
                tenantId: id,
                walletId: wallet.id,
                type: 'chat_unfreeze',
                direction: 'in',
                coins: freezeLedger.coins,
                balanceAfter: back.balanceCoins,
                idempotencyKey: dto.unfreezeKey,
                remark: `对话解冻（${chargeDto.provider}/${chargeDto.model}）`,
                actorUserId: user.id,
                meta: { provider: chargeDto.provider, model: chargeDto.model, unfreeze: true, reason: 'settle' },
              },
            });
            refundedCoins = freezeLedger.coins;
            wallet = { ...wallet, balanceCoins: back.balanceCoins };
          }
        }

        if (charged <= 0) {
          return { ledger: null, balanceCoins: wallet.balanceCoins, refundedCoins };
        }

        // 2) 按实际扣费（允许透支：价格快照权威；下次请求被 freeze 拦截）
        const updated = await tx.tenantAiWallet.update({
          where: { id: wallet.id },
          data: {
            balanceCoins: { decrement: charged },
            totalDebited: { increment: charged },
          },
        });
        const ledger = await tx.tenantAiLedger.create({
          data: {
            tenantId: id,
            walletId: wallet.id,
            type: 'chat_consume',
            direction: 'out',
            coins: charged,
            balanceAfter: updated.balanceCoins,
            tokens: chargeDto.tokens,
            sellPriceMultiplier: new Prisma.Decimal(snapshot.multiplier),
            idempotencyKey: chargeDto.idempotencyKey,
            remark: `对话消耗（${snapshot.modelRef}）`,
            actorUserId: user.id,
            meta: {
              provider: chargeDto.provider ?? null,
              model: chargeDto.model ?? null,
              ...settled,
              settlementOverdraft: true,
              frozenCoins: freezeLedger?.coins ?? null,
              refundedCoins,
            },
          },
        });
        return { ledger, balanceCoins: updated.balanceCoins, refundedCoins };
      });

      return {
        ok: true,
        skipped: false,
        reused: false,
        chargedCoins: charged,
        refundedCoins: result.refundedCoins,
        balanceCoins: result.balanceCoins,
        ...(result.ledger ? { ledgerId: result.ledger.id } : {}),
      };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // 并发重试：charge 或 unfreeze 已落库，按已结算返回
        const again = await this.prisma.tenantAiLedger.findUnique({
          where: { idempotencyKey: chargeDto.idempotencyKey },
        });
        if (again) {
          if (again.tenantId !== id) throw new BadRequestException('扣费幂等键不属于当前企业');
          const wallet = await this.wallet.ensureWallet(id);
          return { ok: true, skipped: false, reused: true, chargedCoins: again.coins, balanceCoins: wallet.balanceCoins, ledgerId: again.id };
        }
      }
      throw err;
    }
  }

  /**
   * 失败补偿：上游未产生计费用量（传输错误 / 上游报错 / 无 usage），全额解冻。
   * 幂等：同 unfreezeKey 重入不重复退款。
   */
  async releaseFrozen(
    user: User,
    tenantId: string | null,
    dto: { freezeKey: string; unfreezeKey: string; reason: string },
  ) {
    if (shouldSkipBilling(user, tenantId)) {
      return { ok: true, skipped: true, reason: 'exempt', refundedCoins: 0 };
    }
    const id = requireTenantIdOrThrow(tenantId);
    const existing = await this.prisma.tenantAiLedger.findUnique({
      where: { idempotencyKey: dto.unfreezeKey },
    });
    if (existing) {
      return { ok: true, skipped: false, reused: true, refundedCoins: existing.coins };
    }
    const freezeLedger = await this.prisma.tenantAiLedger.findUnique({
      where: { idempotencyKey: dto.freezeKey },
    });
    if (!freezeLedger) return { ok: true, skipped: false, reused: false, refundedCoins: 0 };

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const wallet = await tx.tenantAiWallet.findUniqueOrThrow({ where: { id: freezeLedger.walletId } });
        const back = await tx.tenantAiWallet.update({
          where: { id: wallet.id },
          data: { balanceCoins: { increment: freezeLedger.coins } },
        });
        const ledger = await tx.tenantAiLedger.create({
          data: {
            tenantId: id,
            walletId: wallet.id,
            type: 'chat_unfreeze',
            direction: 'in',
            coins: freezeLedger.coins,
            balanceAfter: back.balanceCoins,
            idempotencyKey: dto.unfreezeKey,
            remark: `对话解冻（${dto.reason}）`,
            actorUserId: user.id,
            meta: { unfreeze: true, reason: dto.reason },
          },
        });
        return { ledger, balanceCoins: back.balanceCoins };
      });
      return { ok: true, skipped: false, reused: false, refundedCoins: result.ledger.coins, balanceCoins: result.balanceCoins };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const again = await this.prisma.tenantAiLedger.findUnique({
          where: { idempotencyKey: dto.unfreezeKey },
        });
        if (again) return { ok: true, skipped: false, reused: true, refundedCoins: again.coins };
      }
      throw err;
    }
  }

  async charge(user: User, tenantId: string | null, dto: ChargeBillingDto, snapshot?: ModelPricingSnapshot) {
    if (shouldSkipBilling(user, tenantId)) {
      return { ok: true, skipped: true, reason: 'exempt', chargedCoins: 0, balanceCoins: null };
    }
    const id = requireTenantIdOrThrow(tenantId);
    const existing = await this.prisma.tenantAiLedger.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) {
      if (existing.tenantId !== id) throw new BadRequestException('扣费幂等键不属于当前企业');
      const wallet = await this.wallet.ensureWallet(id);
      return {
        ok: true,
        skipped: false,
        reused: true,
        chargedCoins: existing.coins,
        balanceCoins: wallet.balanceCoins,
        ledgerId: existing.id,
      };
    }

    if (!dto.provider || !dto.model || dto.inputTokens == null || dto.outputTokens == null) {
      throw new BadRequestException('扣费必须提供模型、输入和输出 Token 用量');
    }
    if (dto.tokens !== dto.inputTokens + dto.outputTokens) throw new BadRequestException('总 Token 与输入输出不一致');
    const pricing = snapshot ?? await this.config.quoteModel(dto.provider, dto.model);
    if (pricing.modelRef !== `${dto.provider}/${dto.model}`) throw new BadRequestException('计价模型不一致');
    const settled = settleModelPrice(pricing, dto.inputTokens, dto.outputTokens, dto.cachedInputTokens ?? 0, dto.cacheWrite5mTokens ?? 0, dto.cacheWrite1hTokens ?? 0);
    const charged = settled.chargedCoins;
    const multiplier = pricing.multiplier;
    if (charged <= 0) {
      return { ok: true, skipped: false, reused: false, chargedCoins: 0, balanceCoins: (await this.wallet.ensureWallet(id)).balanceCoins };
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        let wallet = await tx.tenantAiWallet.findUnique({ where: { tenantId: id } });
        if (!wallet) {
          wallet = await tx.tenantAiWallet.create({ data: { tenantId: id, balanceCoins: 0 } });
        }
        const updated = await tx.tenantAiWallet.updateMany({
          where: { id: wallet.id, ...(snapshot ? {} : { balanceCoins: { gte: charged } }) },
          data: {
            balanceCoins: { decrement: charged },
            totalDebited: { increment: charged },
          },
        });
        if (updated.count === 0) {
          throw new HttpException(
            {
              message: '企业 AI 币余额不足，请联系管理员充值',
              code: 'INSUFFICIENT_AI_COINS',
              balanceCoins: wallet.balanceCoins,
              requiredCoins: charged,
            },
            HttpStatus.PAYMENT_REQUIRED,
          );
        }
        const fresh = await tx.tenantAiWallet.findUniqueOrThrow({ where: { id: wallet.id } });
        const ledger = await tx.tenantAiLedger.create({
          data: {
            tenantId: id,
            walletId: wallet.id,
            type: 'chat_consume',
            direction: 'out',
            coins: charged,
            balanceAfter: fresh.balanceCoins,
            tokens: dto.tokens,
            sellPriceMultiplier: new Prisma.Decimal(multiplier),
            idempotencyKey: dto.idempotencyKey,
            remark: `对话消耗（${pricing.modelRef}）`,
            actorUserId: user.id,
            meta: {
              provider: dto.provider ?? null,
              model: dto.model ?? null,
              ...settled,
              settlementOverdraft: Boolean(snapshot),
            },
          },
        });
        return { ledger, balanceCoins: fresh.balanceCoins };
      });

      return {
        ok: true,
        skipped: false,
        reused: false,
        chargedCoins: charged,
        balanceCoins: result.balanceCoins,
        ledgerId: result.ledger.id,
      };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const again = await this.prisma.tenantAiLedger.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
        });
        if (again) {
          if (again.tenantId !== id) throw new BadRequestException('扣费幂等键不属于当前企业');
          const wallet = await this.wallet.ensureWallet(id);
          return {
            ok: true,
            skipped: false,
            reused: true,
            chargedCoins: again.coins,
            balanceCoins: wallet.balanceCoins,
            ledgerId: again.id,
          };
        }
      }
      throw err;
    }
  }
  estimateCoinsFromTokens(tokens: number, multiplier?: number, tokensPerAiCoin?: number) {
    return chargeCoins(tokens, multiplier, tokensPerAiCoin);
  }
}
