import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { json, urlencoded, type Request, type Response } from 'express';
import { networkInterfaces } from 'os';
import { ApplicationLog, redactLog } from './logging/application-log.service';
import { ApplicationExceptionFilter } from './logging/application-exception.filter';
import { RequestLoggingMiddleware } from './request-logging.middleware';
import { AppModule } from './app.module';

function lanIPv4(): string[] {
  const ips: string[] = [];
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) ips.push(a.address);
    }
  }
  return ips;
}

/** 缺省 CORS 白名单：网关入口、中台/agent Vite，以及 dev:desktop 的 dashboard :5210。 */
const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5201',
  'http://127.0.0.1:5201',
  'http://localhost:5202',
  'http://127.0.0.1:5202',
  'http://localhost:5203',
  'http://127.0.0.1:5203',
  'http://localhost:5210',
  'http://127.0.0.1:5210',
];

function corsOrigins(): string[] {
  const list = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return list.length > 0 ? list : DEFAULT_CORS_ORIGINS;
}

async function bootstrap() {
  // bodyParser:false 后自挂 json/urlencoded，才能把 limit 提到与 nginx 同级。
  // Nest/Express 默认 ~100kb，长会话 chat+tool 会在进 LLM 网关前被拒 → HTTP 413。
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
    bodyParser: false,
  });
  const applicationLog=app.get(ApplicationLog);
  app.useLogger(applicationLog);
  app.use((req: Request,res: Response,next: () => void)=>app.get(RequestLoggingMiddleware).use(req,res,next));
  app.useGlobalFilters(new ApplicationExceptionFilter(applicationLog));
  const fatal=(error:Error)=>applicationLog.event('error','process.uncaught',{error});
  process.on('uncaughtExceptionMonitor',fatal);
  app.enableShutdownHooks();
  // 与 infra/baota/nginx-mammoth.conf 的 client_max_body_size 50m 对齐。
  const bodyLimit = '50mb';
  const assignRawBody = (req: Request & { rawBody?: Buffer }, _res: Response, buf: Buffer) => {
    // 微信回调验签需要原始 body；原先 Nest rawBody:true 的等价行为。
    req.rawBody = buf;
  };
  app.use(json({ limit: bodyLimit, verify: assignRawBody }));
  app.use(urlencoded({ extended: true, limit: bodyLimit, verify: assignRawBody }));
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.enableCors({ origin: corsOrigins(), credentials: true });

  const port = Number(process.env.PORT ?? 3100);
  await app.listen(port, '0.0.0.0');

  const log = new Logger('Bootstrap');
  log.log(`Local:   http://localhost:${port}`);
  for (const ip of lanIPv4()) log.log(`Network: http://${ip}:${port}`);
}
void bootstrap().catch(error=>{console.error(JSON.stringify(redactLog({event:'bootstrap.failed',error})));process.exitCode=1;});
// qa-reload-touch
