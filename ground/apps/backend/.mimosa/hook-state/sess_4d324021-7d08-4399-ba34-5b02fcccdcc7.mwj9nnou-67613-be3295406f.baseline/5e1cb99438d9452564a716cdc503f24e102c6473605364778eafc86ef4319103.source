import { assertSmsConfig } from './auth/sms';

/**
 * 进程启动前置断言：必须在 NestFactory.create / listen 之前调用。
 * 生产环境短信通道未按 fail-closed 配置时直接抛错，进程以非 0 退出，
 * 绝不带着 mock 通道对外服务。
 */
export function runStartupChecks(): void {
  assertSmsConfig();
}
