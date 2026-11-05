import { existsSync, readFileSync } from "node:fs";
import { BadRequestException } from "@nestjs/common";
import {
  CHANNEL_NOT_CONFIGURED_MESSAGE,
  DEFAULT_PAY_NOTIFY_BASE_URL,
  PAY_CHANNEL_ALIPAY,
  PAY_CHANNEL_WECHAT,
  type PayChannel,
} from "./pay.constants";

export type WechatPayRuntimeConfig = {
  appId: string;
  mchId: string;
  apiV3Key: string;
  serialNo: string;
  privateKey: string;
  notifyUrl: string;
  platformPublicKey: string;
  platformPublicKeyId: string;
};

export type AlipayRuntimeConfig = {
  appId: string;
  privateKey: string;
  alipayPublicKey: string;
  notifyUrl: string;
  gateway: string;
};

function readEnv(name: string) {
  return String(process.env[name] ?? "").trim();
}

function resolveNotifyBaseUrl() {
  return readEnv("PAY_NOTIFY_BASE_URL").replace(/\/$/, "") || DEFAULT_PAY_NOTIFY_BASE_URL;
}

function resolveNotifyUrl(explicitName: string, path: string) {
  const explicit = readEnv(explicitName);
  if (explicit) return explicit;
  return `${resolveNotifyBaseUrl()}${path}`;
}

function looksLikeFilePath(value: string) {
  if (!value || value.includes("BEGIN")) return false;
  return value.startsWith("/") || value.startsWith("./") || value.startsWith("../") || value.endsWith(".pem") || value.endsWith(".key");
}

function loadPem(value: string, pemType: "PRIVATE KEY" | "PUBLIC KEY" | "RSA PRIVATE KEY") {
  const trimmed = value.trim().replace(/\\n/g, "\n");
  if (!trimmed) return "";
  if (looksLikeFilePath(trimmed)) {
    if (!existsSync(trimmed)) {
      throw new BadRequestException(CHANNEL_NOT_CONFIGURED_MESSAGE);
    }
    return readFileSync(trimmed, "utf8").trim();
  }
  if (trimmed.includes("BEGIN")) return trimmed;
  const body = trimmed.replace(/\s+/g, "").match(/.{1,64}/g)?.join("\n") ?? "";
  if (!body) return "";
  return `-----BEGIN ${pemType}-----\n${body}\n-----END ${pemType}-----`;
}

export function getWechatPayConfig(): WechatPayRuntimeConfig | null {
  const appId = readEnv("WECHAT_PAY_APP_ID");
  const mchId = readEnv("WECHAT_PAY_MCH_ID");
  const apiV3Key = readEnv("WECHAT_PAY_API_V3_KEY");
  const serialNo = readEnv("WECHAT_PAY_SERIAL_NO");
  const privateKey = loadPem(readEnv("WECHAT_PAY_PRIVATE_KEY"), "PRIVATE KEY");
  const platformPublicKey = loadPem(readEnv("WECHAT_PAY_PLATFORM_PUBLIC_KEY"), "PUBLIC KEY");
  const platformPublicKeyId = readEnv("WECHAT_PAY_PLATFORM_PUBLIC_KEY_ID");
  if (!appId || !mchId || !apiV3Key || !serialNo || !privateKey) return null;
  if (apiV3Key.length !== 32) return null;
  if (Boolean(platformPublicKey) !== Boolean(platformPublicKeyId)) return null;
  return {
    appId,
    mchId,
    apiV3Key,
    serialNo,
    privateKey,
    notifyUrl: resolveNotifyUrl("WECHAT_PAY_NOTIFY_URL", "/api/pay/wechatNotify"),
    platformPublicKey,
    platformPublicKeyId,
  };
}

export function getAlipayConfig(): AlipayRuntimeConfig | null {
  const appId = readEnv("ALIPAY_APP_ID");
  const privateKey = loadPem(readEnv("ALIPAY_PRIVATE_KEY"), "PRIVATE KEY");
  const alipayPublicKey = loadPem(readEnv("ALIPAY_PUBLIC_KEY"), "PUBLIC KEY");
  if (!appId || !privateKey || !alipayPublicKey) return null;
  return {
    appId,
    privateKey,
    alipayPublicKey,
    notifyUrl: resolveNotifyUrl("ALIPAY_NOTIFY_URL", "/api/pay/alipayNotify"),
    gateway: readEnv("ALIPAY_GATEWAY") || "https://openapi.alipay.com/gateway.do",
  };
}

export function requireChannelConfig(channel: PayChannel) {
  if (channel === PAY_CHANNEL_WECHAT) {
    const config = getWechatPayConfig();
    if (!config) throw new BadRequestException(CHANNEL_NOT_CONFIGURED_MESSAGE);
    return config;
  }
  if (channel === PAY_CHANNEL_ALIPAY) {
    const config = getAlipayConfig();
    if (!config) throw new BadRequestException(CHANNEL_NOT_CONFIGURED_MESSAGE);
    return config;
  }
  throw new BadRequestException("不支持的支付渠道");
}

export function isPayCallbackPath(url = "") {
  const path = (url.split("?")[0] || "").trim();
  return path.startsWith("/api/pay/") || path.startsWith("/pay/");
}
