/** Credit introduction retains the action ordering selected on first entry. */
import type { RefObject } from 'react'
import { Button } from '@mammoth-ai/mmp-client-ui-primitives'
import type { DesktopOnboardingProps } from './onboarding-contract.ts'
import { OnboardingIllustration } from './OnboardingIllustration.tsx'
import art from './assets/onboarding-recharge.svg'
import artDark from './assets/onboarding-recharge-dark.svg'
import artZh from './assets/onboarding-recharge-zh.svg'
import artZhDark from './assets/onboarding-recharge-zh-dark.svg'
import css from './DesktopOnboarding.module.css'

/** @param props - credit facts, localized content and navigation actions. @returns the credit step. */
export function OnboardingCreditStep({ t, locale, heading, busy, funded, onContinue, onLater }:
  Pick<DesktopOnboardingProps, 't' | 'locale'> & {
    heading: RefObject<HTMLHeadingElement>
    busy: boolean
    funded: boolean
    onContinue: () => void
    onLater: () => void
  }) {
  return <div className={`${css.content} ${css.credit}`}>
    <OnboardingIllustration className={css.creditIllustration} src={locale === 'zh' ? artZh : art} darkSrc={locale === 'zh' ? artZhDark : artDark} />
    <div className={css.copy}>
      <h1 id="desktop-onboarding-title" ref={heading} tabIndex={-1}>{t('onboardingCredit')}</h1>
      <p className={css.heroDescription}>{t('onboardingCreditDescription')}</p>
      <div className={css.creditActions}>
        <Button className={css.action} variant="primary" disabled={busy} onClick={funded ? onContinue : onLater}>{t(funded ? 'onboardingContinue' : 'onboardingLater')}</Button>
      </div>
    </div>
  </div>
}
