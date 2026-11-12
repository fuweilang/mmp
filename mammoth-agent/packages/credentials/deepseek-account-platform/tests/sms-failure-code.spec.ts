import { afterEach, expect, it } from 'vitest'
import { createServer, type ServerResponse } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@mammoth-ai/cordis'
import WebServer from '@mammoth-ai/mmp-host-webserver'
import AuthorizationService from '@mammoth-ai/mmp-authorization'
import type { AccountClientMetadata } from '@mammoth-ai/mmp-deepseek-account'
import { LocalCredentialProvider } from '@mammoth-ai/mmp-credentials-local'
import { PlatformAccount } from '../src/index.ts'

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

const client: AccountClientMetadata = { version: '1.2.3', locale: 'en', timezoneOffsetSeconds: 28_800 }

interface Reply { status: number; body: string }

async function mountGround(reply: () => Reply): Promise<PlatformAccount> {
  const requests: string[] = []
  const ground = createServer((request, response) => {
    requests.push(request.url ?? '')
    request.resume()
    request.on('end', () => {
      const { status, body } = reply()
      response.writeHead(status, { 'content-type': 'application/json' }).end(body)
    })
  })
  await new Promise<void>((resolve) => { ground.listen(0, '127.0.0.1', resolve) })
  cleanups.push(() => new Promise<void>((resolve, reject) => { ground.close((error) => { if (error) reject(error); else resolve() }) }))
  const address = ground.address()
  if (address === null || typeof address === 'string') throw new Error('expected TCP address')
  const origin = `http://127.0.0.1:${address.port}`
  const home = await mkdtemp(join(tmpdir(), 'mmp-account-sms-code-'))
  cleanups.push(() => rm(home, { recursive: true, force: true }))
  const ctx = new Context()
  const web = ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  await web
  const credentials = ctx.plugin(LocalCredentialProvider, { path: join(home, 'credentials.yaml'), watch: false })
  await credentials
  const authorization = ctx.plugin(AuthorizationService)
  await authorization
  const provider = ctx.plugin(PlatformAccount, {
    authMode: 'oidc', platformOrigin: origin, allowLoopbackHttp: true,
    inferenceOrigin: 'https://api.deepseek.com', logoutRetryDelayMs: 1,
  })
  await provider
  cleanups.push(async () => { await provider.dispose(); await authorization.dispose(); await credentials.dispose(); await web.dispose() })
  const account = ctx.deepseekAccount as PlatformAccount
  expect(account).toBeInstanceOf(PlatformAccount)
  return account
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
}

it('maps every recognized SMS send code and drops the server message', async () => {
  let reply: Reply = { status: 400, body: JSON.stringify({ code: 'SMS_RATE_LIMITED', message: '验证码发送过于频繁，请稍后再试' }) }
  const account = await mountGround(() => reply)

  const rateLimited = await account.sendSmsCode('13800138000', 'login')
  expect(rateLimited).toEqual({ ok: false, reason: 'rejected', code: 'SMS_RATE_LIMITED' })
  expect(rateLimited).not.toHaveProperty('message')

  reply = { status: 400, body: JSON.stringify({ code: 'SMS_UNAVAILABLE', message: '验证码发送失败，请稍后重试' }) }
  expect(await account.sendSmsCode('13800138000', 'login')).toEqual({ ok: false, reason: 'unavailable', code: 'SMS_UNAVAILABLE' })

  reply = { status: 400, body: JSON.stringify({ code: 'SMS_INVALID', message: '请输入6位短信验证码' }) }
  expect(await account.sendSmsCode('13800138000', 'login')).toEqual({ ok: false, reason: 'invalid', code: 'SMS_INVALID' })

  // An unrecognized code must never reach the renderer; callers show generic localized copy.
  reply = { status: 400, body: JSON.stringify({ code: 'SMS_SOMETHING_NEW', message: '服务端新文案' }) }
  expect(await account.sendSmsCode('13800138000', 'login')).toEqual({ ok: false, reason: 'rejected' })

  reply = { status: 500, body: 'not json' }
  expect(await account.sendSmsCode('13800138000', 'login')).toEqual({ ok: false, reason: 'rejected' })
})

it('reports CLIENT_TOO_OLD for a registration the old client cannot complete', async () => {
  const seen: string[] = []
  const ground = createServer((request, response) => {
    seen.push(request.url ?? '')
    request.resume()
    request.on('end', () => { json(response, 400, { code: 'CLIENT_TOO_OLD', message: '当前客户端版本过旧，注册需要短信验证，请升级到最新版本后重试' }) })
  })
  await new Promise<void>((resolve) => { ground.listen(0, '127.0.0.1', resolve) })
  cleanups.push(() => new Promise<void>((resolve, reject) => { ground.close((error) => { if (error) reject(error); else resolve() }) }))
  const address = ground.address()
  if (address === null || typeof address === 'string') throw new Error('expected TCP address')
  const home = await mkdtemp(join(tmpdir(), 'mmp-account-client-too-old-'))
  cleanups.push(() => rm(home, { recursive: true, force: true }))
  const ctx = new Context()
  const web = ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  await web
  const credentials = ctx.plugin(LocalCredentialProvider, { path: join(home, 'credentials.yaml'), watch: false })
  await credentials
  const authorization = ctx.plugin(AuthorizationService)
  await authorization
  const provider = ctx.plugin(PlatformAccount, {
    authMode: 'oidc', platformOrigin: `http://127.0.0.1:${address.port}`, allowLoopbackHttp: true,
    inferenceOrigin: 'https://api.deepseek.com', logoutRetryDelayMs: 1,
  })
  await provider
  cleanups.push(async () => { await provider.dispose(); await authorization.dispose(); await credentials.dispose(); await web.dispose() })
  const account = ctx.deepseekAccount as PlatformAccount

  const result = await account.registerWithPassword(client, {
    name: 'Zhang', phone: '13800138000', password: 'secret', enterpriseName: 'Acme', slug: 'acme', smsCode: '123456',
  })
  expect(result).toEqual({ ok: false, reason: 'forbidden', code: 'CLIENT_TOO_OLD' })
  expect(result).not.toHaveProperty('message')
  // The old-client rejection is terminal: the desktop must not retry it.
  expect(seen.filter(url => url === '/api/auth/client-register')).toHaveLength(1)
})

it('maps SMS login codes and keeps unknown codes out of the projection', async () => {
  let reply: Reply = { status: 400, body: JSON.stringify({ code: 'SMS_CODE_EXPIRED', message: '验证码不存在或已过期' }) }
  const account = await mountGround(() => reply)

  expect(await account.signInWithSms(client, '13800138000', '123456'))
    .toEqual({ ok: false, reason: 'credentials', code: 'SMS_CODE_EXPIRED' })

  reply = { status: 400, body: JSON.stringify({ code: 'SMS_INVALID', message: '手机号或验证码错误' }) }
  expect(await account.signInWithSms(client, '13800138000', '123456'))
    .toEqual({ ok: false, reason: 'credentials', code: 'SMS_INVALID' })

  reply = { status: 400, body: JSON.stringify({ code: 'SOMETHING_ELSE', message: '未知错误' }) }
  expect(await account.signInWithSms(client, '13800138000', '123456'))
    .toEqual({ ok: false, reason: 'credentials' })
})
