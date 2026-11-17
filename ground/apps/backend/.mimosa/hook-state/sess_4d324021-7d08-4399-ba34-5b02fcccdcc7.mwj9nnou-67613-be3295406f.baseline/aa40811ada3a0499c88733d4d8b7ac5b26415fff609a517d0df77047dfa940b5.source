import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import { createSign, createVerify, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  CHANNEL_NOT_CONFIGURED_MESSAGE,
  CHANNEL_REQUEST_FAILED_MESSAGE,
  QR_EXPIRE_MINUTES,
} from "./pay.constants";
import { getAlipayConfig, type AlipayRuntimeConfig } from "./pay-config";

type AlipayPrecreateResult = {
  codeUrl: string;
  expireAt: Date;
};

type AlipayQueryResult = {
  tradeStatus: string;
  tradeNo: string;
  totalAmount: string;
};

type AlipayNotifyPayload = {
  outTradeNo: string;
  tradeNo: string;
  tradeStatus: string;
  totalAmount: string;
  gmtPayment: string;
};

const REQUEST_TIMEOUT_MS = 15000;

@Injectable()
export class AlipayClient {
  private readonly logger = new Logger(AlipayClient.name);

  isConfigured() {
    return Boolean(getAlipayConfig());
  }

  async createPrecreate(input: {
    outTradeNo: string;
    subject: string;
    amount: Prisma.Decimal;
    expireAt: Date;
  }): Promise<AlipayPrecreateResult> {
    const config = this.requireConfig();
    const data = await this.request<{
      code?: string;
      sub_code?: string;
      sub_msg?: string;
      qr_code?: string;
    }>(config, "alipay.trade.precreate", {
      out_trade_no: input.outTradeNo,
      total_amount: this.formatYuan(input.amount),
      subject: input.subject.slice(0, 256),
      timeout_express: `${QR_EXPIRE_MINUTES}m`,
      ...(String(process.env.ALIPAY_SELLER_ID || "").trim()
        ? { seller_id: String(process.env.ALIPAY_SELLER_ID).trim() }
        : {}),
    });
    this.assertSuccess(data, "precreate");
    const codeUrl = String(data.qr_code || "").trim();
    if (!codeUrl) throw new BadRequestException(CHANNEL_REQUEST_FAILED_MESSAGE);
    return { codeUrl, expireAt: input.expireAt };
  }

  async queryByOutTradeNo(outTradeNo: string): Promise<AlipayQueryResult | null> {
    const config = this.requireConfig();
    const data = await this.request<{
      code?: string;
      sub_code?: string;
      trade_status?: string;
      trade_no?: string;
      total_amount?: string;
    }>(config, "alipay.trade.query", { out_trade_no: outTradeNo });
    if (data.sub_code === "ACQ.TRADE_NOT_EXIST") return null;
    this.assertSuccess(data, "query");
    return {
      tradeStatus: String(data.trade_status || ""),
      tradeNo: String(data.trade_no || ""),
      totalAmount: String(data.total_amount || ""),
    };
  }

  async closeByOutTradeNo(outTradeNo: string) {
    const config = this.requireConfig();
    await this.request(config, "alipay.trade.close", { out_trade_no: outTradeNo });
  }

  parseNotify(body: Record<string, unknown>): AlipayNotifyPayload {
    const config = this.requireConfig();
    if (!this.verifyNotifySign(body, config)) {
      throw new BadRequestException("支付宝回调验签失败");
    }
    const notifyAppId = String(body.app_id || "").trim();
    if (notifyAppId !== config.appId) {
      throw new BadRequestException("支付宝回调应用不匹配");
    }
    const outTradeNo = String(body.out_trade_no || "").trim();
    const tradeNo = String(body.trade_no || "").trim();
    const tradeStatus = String(body.trade_status || "").trim();
    const totalAmount = String(body.total_amount || "").trim();
    if (!outTradeNo || !tradeNo || !totalAmount) {
      throw new BadRequestException("支付宝回调缺少订单信息");
    }
    return {
      outTradeNo,
      tradeNo,
      tradeStatus,
      totalAmount,
      gmtPayment: String(body.gmt_payment || ""),
    };
  }

  formatYuan(amount: Prisma.Decimal) {
    return new Prisma.Decimal(amount).toFixed(2);
  }

  yuanEquals(paidAmount: string, orderAmount: Prisma.Decimal) {
    try {
      return new Prisma.Decimal(paidAmount).toFixed(2) === this.formatYuan(orderAmount);
    } catch {
      return false;
    }
  }

  defaultExpireAt(from = new Date()) {
    return new Date(from.getTime() + QR_EXPIRE_MINUTES * 60 * 1000);
  }

  private requireConfig() {
    const config = getAlipayConfig();
    if (!config) throw new BadRequestException(CHANNEL_NOT_CONFIGURED_MESSAGE);
    return config;
  }

  private async request<T extends { code?: string }>(config: AlipayRuntimeConfig, method: string, bizContent: Record<string, unknown>) {
    const params: Record<string, string> = {
      app_id: config.appId,
      method,
      format: "JSON",
      charset: "utf-8",
      sign_type: "RSA2",
      timestamp: this.formatTimestamp(new Date()),
      version: "1.0",
      notify_url: config.notifyUrl,
      biz_content: JSON.stringify(bizContent),
    };
    params.sign = this.sign(params, config.privateKey);
    try {
      const response = await axios.post<Record<string, unknown>>(config.gateway, new URLSearchParams(params), {
        timeout: REQUEST_TIMEOUT_MS,
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      });
      const responseKey = method.replace(/\./g, "_") + "_response";
      const payload = response.data?.[responseKey];
      return (payload && typeof payload === "object" ? payload : {}) as T;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(CHANNEL_REQUEST_FAILED_MESSAGE);
    }
  }

  private assertSuccess(data: { code?: string; sub_code?: string; sub_msg?: string }, action: string) {
    if (String(data.code || "") === "10000") return;
    const subCode = String(data.sub_code || "").trim();
    this.logger.warn(`Alipay ${action} failed code=${String(data.code || "")} sub=${subCode || "none"}`);
    throw new BadRequestException(this.mapAlipayError(subCode));
  }

  private mapAlipayError(subCode: string) {
    if (subCode === "ACQ.ACCESS_FORBIDDEN") {
      return "当前支付宝应用未开通当面付，请先在开放平台签约当面付后再试";
    }
    if (subCode === "ACQ.INVALID_PARAMETER") {
      return "支付宝下单参数无效，请稍后重试或联系平台";
    }
    if (subCode === "ACQ.TRADE_HAS_SUCCESS" || subCode === "ACQ.TRADE_HAS_CLOSE") {
      return "该支付单已结束，请返回重新创建订单";
    }
    return CHANNEL_REQUEST_FAILED_MESSAGE;
  }

  private sign(params: Record<string, string>, privateKey: string) {
    const content = this.signContent(params);
    return createSign("RSA-SHA256").update(content, "utf8").sign(privateKey, "base64");
  }

  private verifyNotifySign(body: Record<string, unknown>, config: AlipayRuntimeConfig) {
    const sign = String(body.sign || "");
    const signType = String(body.sign_type || "RSA2");
    if (!sign || signType !== "RSA2") return false;
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(body)) {
      if (key === "sign" || key === "sign_type") continue;
      if (value === undefined || value === null) continue;
      params[key] = String(value);
    }
    return this.verify(this.signContent(params), sign, config.alipayPublicKey);
  }

  private verify(content: string, sign: string, publicKey: string) {
    try {
      const verify = createVerify("RSA-SHA256");
      verify.update(content, "utf8");
      verify.end();
      return verify.verify(publicKey, sign, "base64");
    } catch (error) {
      this.logger.warn(`Alipay verify error reason=${this.safeErrorMessage(error)}`);
      return false;
    }
  }

  private signContent(params: Record<string, string>) {
    return Object.keys(params)
      .filter((key) => params[key] !== undefined && params[key] !== "")
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join("&");
  }

  private formatTimestamp(date: Date) {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  private safeErrorMessage(error: unknown) {
    if (error instanceof Error) return error.name;
    return "unknown";
  }
}

export function createAlipayOutTradeNo() {
  return `A${Date.now()}${randomUUID().replace(/-/g, "").slice(0, 8)}`.slice(0, 32);
}
