import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import axios, { AxiosError } from "axios";
import { createDecipheriv, createSign, createVerify, randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  CHANNEL_NOT_CONFIGURED_MESSAGE,
  CHANNEL_REQUEST_FAILED_MESSAGE,
  QR_EXPIRE_MINUTES,
} from "./pay.constants";
import { getWechatPayConfig, type WechatPayRuntimeConfig } from "./pay-config";

type WechatNativeResult = {
  codeUrl: string;
  expireAt: Date;
};

type WechatQueryResult = {
  tradeState: string;
  transactionId: string;
  amountFen: number | null;
  successTime: string;
};

type WechatNotifyPayload = {
  outTradeNo: string;
  transactionId: string;
  tradeState: string;
  amountFen: number;
  successTime: string;
};

type CachedPlatformCert = {
  serialNo: string;
  pem: string;
  expireAt: number;
};

const WECHAT_API_BASE = "https://api.mch.weixin.qq.com";
const REQUEST_TIMEOUT_MS = 15000;

@Injectable()
export class WechatPayClient {
  private readonly logger = new Logger(WechatPayClient.name);
  private platformCerts: CachedPlatformCert[] = [];
  private platformCertsLoadedAt = 0;

  isConfigured() {
    return Boolean(getWechatPayConfig());
  }

  async createNativeOrder(input: {
    outTradeNo: string;
    description: string;
    amountFen: number;
    expireAt: Date;
  }): Promise<WechatNativeResult> {
    const config = this.requireConfig();
    const body = {
      appid: config.appId,
      mchid: config.mchId,
      description: input.description.slice(0, 127),
      out_trade_no: input.outTradeNo,
      time_expire: this.toRfc3339(input.expireAt),
      notify_url: config.notifyUrl,
      amount: {
        total: input.amountFen,
        currency: "CNY",
      },
    };
    const data = await this.requestJson<{ code_url?: string }>("POST", "/v3/pay/transactions/native", body, config);
    const codeUrl = String(data?.code_url || "").trim();
    if (!codeUrl) throw new BadRequestException(CHANNEL_REQUEST_FAILED_MESSAGE);
    return { codeUrl, expireAt: input.expireAt };
  }

  async queryByOutTradeNo(outTradeNo: string): Promise<WechatQueryResult | null> {
    const config = this.requireConfig();
    const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}?mchid=${encodeURIComponent(config.mchId)}`;
    const data = await this.requestJson<{
      trade_state?: string;
      transaction_id?: string;
      amount?: { total?: number };
      success_time?: string;
    }>("GET", path, undefined, config, { allowNotFound: true });
    if (!data) return null;
    return {
      tradeState: String(data.trade_state || ""),
      transactionId: String(data.transaction_id || ""),
      amountFen: typeof data.amount?.total === "number" ? data.amount.total : null,
      successTime: String(data.success_time || ""),
    };
  }

  async closeByOutTradeNo(outTradeNo: string) {
    const config = this.requireConfig();
    const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}/close`;
    await this.requestJson("POST", path, { mchid: config.mchId }, config);
  }

  async parseNotify(rawBody: Buffer | string, headers: Record<string, string | string[] | undefined>): Promise<WechatNotifyPayload> {
    const config = this.requireConfig();
    const bodyText = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody || "");
    const verified = await this.verifyNotifySignature(bodyText, headers, config);
    if (!verified) throw new BadRequestException("微信支付回调验签失败");

    const envelope = this.parseJson(bodyText) as {
      resource?: { ciphertext?: string; nonce?: string; associated_data?: string };
      event_type?: string;
    };
    const resource = envelope.resource;
    if (!resource?.ciphertext || !resource.nonce) {
      throw new BadRequestException("微信支付回调内容不完整");
    }
    const decrypted = this.decryptResource(config.apiV3Key, resource.ciphertext, resource.nonce, resource.associated_data || "");
    const payload = this.parseJson(decrypted) as {
      appid?: string;
      mchid?: string;
      out_trade_no?: string;
      transaction_id?: string;
      trade_state?: string;
      amount?: { total?: number; currency?: string };
      success_time?: string;
    };
    const outTradeNo = String(payload.out_trade_no || "").trim();
    const transactionId = String(payload.transaction_id || "").trim();
    const tradeState = String(payload.trade_state || "").trim();
    const amountFen = payload.amount?.total;
    if (payload.appid !== config.appId || payload.mchid !== config.mchId) {
      throw new BadRequestException("微信支付回调商户信息不匹配");
    }
    if (payload.amount?.currency !== "CNY" || !Number.isSafeInteger(amountFen) || Number(amountFen) <= 0) {
      throw new BadRequestException("微信支付回调金额不合法");
    }
    if (!outTradeNo || !transactionId || typeof amountFen !== "number") {
      throw new BadRequestException("微信支付回调缺少订单信息");
    }
    return {
      outTradeNo,
      transactionId,
      tradeState,
      amountFen,
      successTime: String(payload.success_time || ""),
    };
  }

  yuanToFen(amount: Prisma.Decimal) {
    const fen = new Prisma.Decimal(amount).mul(100);
    if (!fen.isInteger()) throw new BadRequestException("微信支付金额必须精确到分");
    const value = Number(fen.toString());
    if (!Number.isSafeInteger(value) || value <= 0) throw new BadRequestException("微信支付金额不合法");
    return value;
  }

  fenEqualsYuan(amountFen: number, amount: Prisma.Decimal) {
    return amountFen === this.yuanToFen(amount);
  }

  defaultExpireAt(from = new Date()) {
    return new Date(from.getTime() + QR_EXPIRE_MINUTES * 60 * 1000);
  }

  private requireConfig() {
    const config = getWechatPayConfig();
    if (!config) throw new BadRequestException(CHANNEL_NOT_CONFIGURED_MESSAGE);
    return config;
  }

  private async requestJson<T>(
    method: "GET" | "POST",
    pathWithQuery: string,
    body: unknown,
    config: WechatPayRuntimeConfig,
    options?: { allowNotFound?: boolean },
  ): Promise<T | null> {
    const urlPath = pathWithQuery;
    const payload = body === undefined ? "" : JSON.stringify(body);
    const authorization = this.buildAuthorization(method, urlPath, payload, config);
    try {
      const response = await axios.request<T>({
        method,
        url: `${WECHAT_API_BASE}${urlPath}`,
        data: body === undefined ? undefined : body,
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: authorization,
          ...(config.platformPublicKeyId ? { "Wechatpay-Serial": config.platformPublicKeyId } : {}),
        },
        validateStatus: (status) => status >= 200 && status < 300,
      });
      return (response.data ?? {}) as T;
    } catch (error) {
      if (options?.allowNotFound && axios.isAxiosError(error) && error.response?.status === 404) return null;
      throw new BadRequestException(this.toChannelError(error));
    }
  }

  private buildAuthorization(method: string, urlPath: string, body: string, config: WechatPayRuntimeConfig) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomBytes(16).toString("hex");
    const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`;
    const signature = createSign("RSA-SHA256").update(message).sign(config.privateKey, "base64");
    return `WECHATPAY2-SHA256-RSA2048 mchid="${config.mchId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${config.serialNo}",signature="${signature}"`;
  }

  private async verifyNotifySignature(bodyText: string, headers: Record<string, string | string[] | undefined>, config: WechatPayRuntimeConfig) {
    const timestamp = this.headerValue(headers, "wechatpay-timestamp");
    const nonce = this.headerValue(headers, "wechatpay-nonce");
    const signature = this.headerValue(headers, "wechatpay-signature");
    const serial = this.headerValue(headers, "wechatpay-serial");
    if (!timestamp || !nonce || !signature || !serial) return false;
    const message = `${timestamp}\n${nonce}\n${bodyText}\n`;
    const publicKey = await this.resolvePlatformPublicKey(serial, config);
    if (!publicKey) return false;
    try {
      const verify = createVerify("RSA-SHA256");
      verify.update(message);
      verify.end();
      return verify.verify(publicKey, signature, "base64");
    } catch (error) {
      this.logger.warn(`WeChat notify verify error serial=${serial} reason=${this.safeErrorMessage(error)}`);
      return false;
    }
  }

  private async resolvePlatformPublicKey(serial: string, config: WechatPayRuntimeConfig) {
    if (serial.startsWith("PUB_KEY_ID_")) {
      return serial === config.platformPublicKeyId ? config.platformPublicKey : "";
    }
    const cached = this.platformCerts.find((item) => item.serialNo === serial && item.expireAt > Date.now());
    if (cached) return cached.pem;
    await this.refreshPlatformCerts(config);
    return this.platformCerts.find((item) => item.serialNo === serial && item.expireAt > Date.now())?.pem || "";
  }

  private async refreshPlatformCerts(config: WechatPayRuntimeConfig) {
    if (Date.now() - this.platformCertsLoadedAt < 60_000 && this.platformCerts.length > 0) return;
    const data = await this.requestJson<{
      data?: Array<{
        serial_no?: string;
        expire_time?: string;
        encrypt_certificate?: { ciphertext?: string; nonce?: string; associated_data?: string };
      }>;
    }>("GET", "/v3/certificates", undefined, config);
    if (!data) return;
    const nextCerts: CachedPlatformCert[] = [];
    for (const item of data.data ?? []) {
      const serialNo = String(item.serial_no || "").trim();
      const encrypt = item.encrypt_certificate;
      if (!serialNo || !encrypt?.ciphertext || !encrypt.nonce) continue;
      const pem = this.decryptResource(config.apiV3Key, encrypt.ciphertext, encrypt.nonce, encrypt.associated_data || "certificate");
      nextCerts.push({
        serialNo,
        pem,
        expireAt: item.expire_time ? new Date(item.expire_time).getTime() : Date.now() + 24 * 60 * 60 * 1000,
      });
    }
    if (nextCerts.length > 0) {
      this.platformCerts = nextCerts;
      this.platformCertsLoadedAt = Date.now();
    }
  }

  private decryptResource(apiV3Key: string, ciphertext: string, nonce: string, associatedData: string) {
    const buf = Buffer.from(ciphertext, "base64");
    const data = buf.subarray(0, buf.length - 16);
    const authTag = buf.subarray(buf.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(apiV3Key, "utf8"), Buffer.from(nonce, "utf8"));
    decipher.setAuthTag(authTag);
    decipher.setAAD(Buffer.from(associatedData, "utf8"));
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  }

  private headerValue(headers: Record<string, string | string[] | undefined>, name: string) {
    const matched = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
    const value = matched?.[1];
    if (Array.isArray(value)) return String(value[0] || "").trim();
    return String(value || "").trim();
  }

  private parseJson(text: string) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new BadRequestException("微信支付回调不是合法 JSON");
    }
  }

  private toRfc3339(date: Date) {
    const pad = (value: number) => String(value).padStart(2, "0");
    const offsetMin = -date.getTimezoneOffset();
    const sign = offsetMin >= 0 ? "+" : "-";
    const abs = Math.abs(offsetMin);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  }

  private toChannelError(error: unknown) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      const code = axiosError.response?.data?.code;
      if (code === "APPID_MCHID_NOT_MATCH" || code === "SIGN_ERROR" || code === "PARAM_ERROR") {
        return CHANNEL_NOT_CONFIGURED_MESSAGE;
      }
      return CHANNEL_REQUEST_FAILED_MESSAGE;
    }
    return CHANNEL_REQUEST_FAILED_MESSAGE;
  }

  private safeErrorMessage(error: unknown) {
    if (error instanceof Error) return error.name;
    return "unknown";
  }
}

export function createWechatOutTradeNo() {
  return `W${Date.now()}${randomUUID().replace(/-/g, "").slice(0, 8)}`.slice(0, 32);
}
