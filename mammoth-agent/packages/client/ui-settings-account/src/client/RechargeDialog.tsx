/** 猛犸 enterprise AI coin recharge dialog (shared by Desktop and Web). */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, Modal, Toast } from '@mammoth-ai/mmp-client-ui-primitives'
import type { HostObservable, InjectFace, PropsRuntime } from '@mammoth-ai/mmp-client-ui-slots'
import {
  FIXED_AMOUNTS, formatCoins, validateAmount,
  type BillingSnapshot, type GroundBillingApi, type GroundPayChannel, type GroundPayChannels, type GroundRechargeOrder,
} from './ground-billing.ts'
import { encodeQr } from './qr.ts'
import css from './RechargeDialog.module.css'

/** Overlay injection for the recharge dialog. */
export interface RechargeDialogInjected {
  api: GroundBillingApi
  close: () => void
  /** Re-read wallet (and account details) after a confirmed order. */
  paid: () => Promise<void>
  hooks: { billing: HostObservable<BillingSnapshot> }
}

type RechargeDialogProps = PropsRuntime<'shell.overlay'> & InjectFace<RechargeDialogInjected>

const POLL_MS = 3000

/** Render a QR matrix as an SVG. */
export function QrSvg({ text, size = 188 }: { text: string; size?: number }) {
  const path = useMemo(() => {
    try {
      const m = encodeQr(text)
      let d = ''
      m.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${String(x + 2)} ${String(y + 2)}h1v1h-1z` }))
      return { d, n: m.length + 4 }
    } catch { return undefined }
  }, [text])
  if (path === undefined) return <div className={css.qrError}>二维码生成失败</div>
  return <svg className={css.qr} width={size} height={size} viewBox={`0 0 ${String(path.n)} ${String(path.n)}`}
    shapeRendering="crispEdges" role="img" aria-label="支付二维码">
    <rect width={path.n} height={path.n} fill="#fff" />
    <path d={path.d} fill="#111827" />
  </svg>
}

/** @param props - billing hooks and proxy API. @returns the dialog while open. */
export function RechargeDialog({ useBilling, api, close, paid }: RechargeDialogProps) {
  const open = useBilling(s => s.open)
  const balance = useBilling(s => s.balanceCoins)
  const perYuan = useBilling(s => s.aiCoinsPerYuan)
  const [channels, setChannels] = useState<GroundPayChannels | null>(null)
  const [amount, setAmount] = useState<string>('100')
  const [custom, setCustom] = useState('')
  const [step, setStep] = useState<'form' | 'pay'>('form')
  const [channel, setChannel] = useState<GroundPayChannel | null>(null)
  const [order, setOrder] = useState<GroundRechargeOrder | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const orderRef = useRef<GroundRechargeOrder | null>(null)
  const doneRef = useRef(false)
  orderRef.current = order

  const amountText = custom.trim() !== '' ? custom.trim() : amount
  const amountError = validateAmount(amountText)
  const coins = amountError === undefined ? Math.round(Number(amountText) * perYuan) : null

  // Reset on each open; read channels.
  useEffect(() => {
    if (!open) return
    doneRef.current = false
    setAmount('100'); setCustom(''); setStep('form'); setChannel(null); setOrder(null); setError(''); setBusy(false)
    let alive = true
    api.channels().then((c) => { if (alive) setChannels(c) }).catch((e: unknown) => {
      if (alive) setError(e instanceof Error ? e.message : '读取支付渠道失败')
    })
    return () => { alive = false }
  }, [open, api])

  const cancelPending = useCallback(() => {
    const current = orderRef.current
    if (!doneRef.current && current !== null && current.status === 'pending') void api.cancel(current.id).catch(() => undefined)
  }, [api])

  const finish = useCallback((confirmed: GroundRechargeOrder) => {
    if (doneRef.current) return
    doneRef.current = true
    setToast(`充值成功，${formatCoins(confirmed.aiCoins)} AI币已到账`)
    void paid()
    close()
  }, [close, paid])

  // Poll status every 3 s while a QR is showing.
  useEffect(() => {
    if (!open || step !== 'pay' || order === null || order.status !== 'pending' || channel === 'mock') return
    let stopped = false
    const tick = async () => {
      try {
        const latest = await api.status(order.id)
        if (stopped) return
        if (latest.status === 'confirmed') { finish(latest); return }
        if (latest.status === 'failed' || latest.status === 'expired' || latest.status === 'cancelled') {
          setOrder(latest)
          setError(latest.status === 'expired' ? '订单已过期，请返回重新发起' : '支付未完成，请返回重试')
        }
      } catch { /* transient: keep polling */ }
    }
    const timer = setInterval(() => { void tick() }, POLL_MS)
    void tick()
    return () => { stopped = true; clearInterval(timer) }
  }, [open, step, order, channel, api, finish])

  const pay = async (selected: GroundPayChannel) => {
    if (busy || amountError !== undefined) return
    setBusy(true); setError(''); setChannel(selected)
    try {
      cancelPending()
      const created = await api.create(Number(amountText), `mmp-${String(Date.now())}-${Math.random().toString(36).slice(2, 10)}`)
      setOrder(created)
      if (selected !== 'mock') setStep('pay')
      const result = await api.payQr(created.id, selected)
      setOrder(result)
      if (result.status === 'confirmed') { finish(result); return }
      if (selected === 'mock') setError('模拟支付未立即到账，请稍后查看余额')
      else if (!result.codeUrl) setError(selected === 'wechat' ? '微信支付二维码生成失败' : '支付宝二维码生成失败')
    } catch (e) {
      setError(e instanceof Error ? e.message : '发起支付失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  const onClose = () => { cancelPending(); close() }
  const toastNode = toast !== null && <Toast text={toast} tone="success" onDone={() => { setToast(null) }} />
  if (!open) return <>{toastNode}</>

  const payEnabled = (c: GroundPayChannel) => c === 'mock' ? channels?.mockEnabled === true
    : c === 'wechat' ? channels?.wechatConfigured === true : channels?.alipayConfigured === true

  return <>
    {toastNode}
    <Modal open title={step === 'form' ? 'AI币充值' : channel === 'wechat' ? '微信扫码支付' : '支付宝扫码支付'}
      closeLabel="关闭" onClose={onClose} className={css.modal ?? ''}
      {...(step === 'form' ? { description: `当前企业余额 ${formatCoins(balance)} AI币 · 1 元 = ${formatCoins(perYuan)} AI币（≈ token）` } : {})}
      footer={step === 'form'
        ? <>
          <Button variant="outline" onClick={onClose}>取消</Button>
          {payEnabled('mock') && <Button variant="outline" disabled={busy || amountError !== undefined}
            onClick={() => { void pay('mock') }}>模拟支付（测试）</Button>}
          <Button variant="primary" disabled={busy || amountError !== undefined || !payEnabled('wechat')}
            title={payEnabled('wechat') ? undefined : '微信支付未配置'} onClick={() => { void pay('wechat') }}>微信支付</Button>
          <Button variant="primary" disabled={busy || amountError !== undefined || !payEnabled('alipay')}
            title={payEnabled('alipay') ? undefined : '支付宝未配置'} onClick={() => { void pay('alipay') }}>支付宝</Button>
        </>
        : <>
          <Button variant="outline" onClick={() => { cancelPending(); setStep('form'); setOrder(null); setError('') }}>返回</Button>
          <Button variant="outline" onClick={onClose}>关闭</Button>
        </>}>
      {step === 'form'
        ? <div className={css.body}>
          <div className={css.grid}>
            {FIXED_AMOUNTS.map(value => <button key={value} type="button" className={css.amount}
              data-selected={custom.trim() === '' && amount === String(value)}
              onClick={() => { setAmount(String(value)); setCustom('') }}>
              <span className={css.yuan}>¥{value.toLocaleString('zh-CN')}</span>
              <span className={css.coins}>{formatCoins(value * perYuan)} AI币</span>
            </button>)}
          </div>
          <label className={css.customRow}>
            <span>自定义金额（元）</span>
            <Input className={css.customInput ?? ''} inputMode="decimal" placeholder="1 – 100000" value={custom}
              onChange={(e) => { setCustom(e.target.value.replace(/[^\d.]/g, '')) }} />
          </label>
          <div className={css.summary} data-error={custom.trim() !== '' && amountError !== undefined}>
            {custom.trim() !== '' && amountError !== undefined ? amountError
              : `应付 ¥${Number(amountText).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}，到账 ${formatCoins(coins)} AI币`}
          </div>
          {channels !== null && !channels.wechatConfigured && !channels.alipayConfigured && !channels.mockEnabled
            && <div className={css.error}>暂无可用支付渠道，请联系管理员</div>}
          {error && <div className={css.error}>{error}</div>}
        </div>
        : <div className={css.payBody}>
          {order?.codeUrl ? <QrSvg text={order.codeUrl} /> : <div className={css.qrPlaceholder}>{busy ? '正在生成二维码…' : ''}</div>}
          <div className={css.payAmount}>¥{order ? Number(order.amountYuan).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : amountText}</div>
          <div className={css.hint}>{error || `请使用${channel === 'wechat' ? '微信' : '支付宝'}扫码，支付完成后自动到账`}</div>
        </div>}
    </Modal>
  </>
}
