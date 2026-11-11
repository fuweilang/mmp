/** Product-wide, versioned preview notice. */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { SnapshotStore } from '@mammoth-ai/mmp-client-store'
import type { InjectFace, PropsRuntime } from '@mammoth-ai/mmp-client-ui-slots'
import { Button } from '@mammoth-ai/mmp-client-ui-primitives'
import type { WelcomeNoticeState, WelcomeNoticeStore } from './welcome-store.ts'
import type { en } from './locales.ts'
import { OnboardingModal } from './OnboardingModal.tsx'
import css from './WelcomeNotice.module.css'

/** Registration-side dependencies of {@link WelcomeNotice}. */
export interface WelcomeNoticeInjected {
  hooks: {
    /** Durable acknowledgement state. */
    welcome: SnapshotStore<WelcomeNoticeState>
  }
  /** Welcome acknowledgement controller. */
  controller: WelcomeNoticeStore
  /** Onboarding copy. */
  t: (key: keyof typeof en) => string
}

/** Coordinator owner props plus this step's injected face. */
export type WelcomeNoticeProps =
  PropsRuntime<'settings.onboarding'> & InjectFace<WelcomeNoticeInjected>

/** Account-owned welcome flag. Absent bridge keeps the local version acknowledgement. */
interface AccountWelcomeBridge {
  getSnapshot(): { seen: boolean | null }
  subscribe(listener: () => void): () => void
  acknowledge(): Promise<boolean>
}

const WELCOME_BRIDGE = '__MMP_ACCOUNT_WELCOME__'
const WELCOME_BRIDGE_EVENT = 'mmp-account-welcome'

function readAccountWelcomeBridge(): AccountWelcomeBridge | undefined {
  return (globalThis as typeof globalThis & { [WELCOME_BRIDGE]?: AccountWelcomeBridge })[WELCOME_BRIDGE]
}

/**
 * Render the current notice until its exact copy version is acknowledged.
 * When the account bridge is installed, that flag decides instead: null waits, false shows, true skips.
 * @param props - settings-shell owner state and welcome dependencies.
 * @returns the welcome modal or null while the step decides not to show.
 */
export function WelcomeNotice(props: WelcomeNoticeProps): ReactNode {
  const { complete, controller, useWelcome, t } = props
  const state = useWelcome(snapshot => snapshot)
  const finished = useRef(false)
  const [accountSeen, setAccountSeen] = useState<boolean | null | undefined>(() => {
    const bridge = readAccountWelcomeBridge()
    return bridge === undefined ? undefined : bridge.getSnapshot().seen
  })
  const [accountError, setAccountError] = useState(false)
  const [accountSaving, setAccountSaving] = useState(false)
  const finish = useCallback((): void => {
    if (finished.current) return
    finished.current = true
    complete()
  }, [complete])

  useEffect(() => {
    if (state.status === 'idle') void controller.load()
  }, [controller, state.status])

  useEffect(() => {
    let stop: (() => void) | undefined
    const sync = (): void => {
      stop?.()
      const bridge = readAccountWelcomeBridge()
      if (bridge === undefined) {
        setAccountSeen(undefined)
        return
      }
      setAccountSeen(bridge.getSnapshot().seen)
      stop = bridge.subscribe(() => { setAccountSeen(bridge.getSnapshot().seen) })
    }
    sync()
    globalThis.addEventListener(WELCOME_BRIDGE_EVENT, sync)
    return () => {
      stop?.()
      globalThis.removeEventListener(WELCOME_BRIDGE_EVENT, sync)
    }
  }, [])

  useEffect(() => {
    if (accountSeen === true) finish()
    else if (accountSeen === undefined && state.acknowledged) finish()
  }, [accountSeen, finish, state.acknowledged])

  const bridgeActive = accountSeen !== undefined
  if (bridgeActive ? accountSeen !== false : state.status === 'idle' || state.status === 'loading' || state.acknowledged) return null

  const acknowledge = async (): Promise<void> => {
    const bridge = readAccountWelcomeBridge()
    if (bridge !== undefined) {
      setAccountSaving(true)
      setAccountError(false)
      const ok = await bridge.acknowledge()
      setAccountSaving(false)
      if (!ok) {
        setAccountError(true)
        return
      }
      void controller.acknowledge()
      finish()
      return
    }
    if (await controller.acknowledge()) finish()
  }
  const paragraphs = t('welcomeBody').split('\n\n')
  const failed = accountError || state.error !== null

  return (
    <OnboardingModal title={t('welcomeTitle')} focusTitle>
      <div className={css.copy}>
        {paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
      </div>
      {failed ? <p className={css.error} role="alert">{t('welcomeError')}</p> : null}
      <div className={css.actions}>
        <Button
          variant="primary"
          className={css.primary}
          disabled={accountSaving || state.status === 'saving'}
          onClick={() => { void acknowledge() }}
        >
          {t('welcomeContinue')}
        </Button>
      </div>
    </OnboardingModal>
  )
}
