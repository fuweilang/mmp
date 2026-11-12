/** Sidebar account launcher and locally authoritative sign-out action. */
import { useEffect, useRef, useState } from 'react'
import {
  Toast, Menu, MenuItemButton, IconChevronDownOutlineMedium, IconDownloadOutlineMedium, IconEllipsisOutlineMedium,
  IconGaugeOutlineMedium, IconPaperPlaneOutlineMedium, IconSettingsOutlineMedium, IconUserOutlineMedium,
} from '@mammoth-ai/mmp-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@mammoth-ai/mmp-client-ui-slots'
import type { AccountSectionInjected } from './AccountSection.tsx'
import { SignOutDialog } from './SignOutDialog.tsx'
import { SignInDialog } from './SignInDialog.tsx'
import { LogoutIcon } from './LogoutIcon.tsx'
import { AccountAvatar } from './AccountAvatar.tsx'
import { AccountNoticeStack } from './AccountNotice.tsx'
import { formatCoins, useBillingState } from './ground-billing.ts'
import css from './AccountMenu.module.css'

function CameraMark() {
  return <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
    <path d="M3.2 2.2h.5l.5-.8h1.6l.5.8h.5A1.2 1.2 0 0 1 8 3.4v3.4A1.2 1.2 0 0 1 6.8 8H3.2A1.2 1.2 0 0 1 2 6.8V3.4a1.2 1.2 0 0 1 1.2-1.2Z" stroke="currentColor" strokeWidth="1" />
    <circle cx="5" cy="5.2" r="1.3" stroke="currentColor" strokeWidth="1" />
  </svg>
}

/** Display the account phone number in full, normalized of spaces and dashes. */
export function displayAccountPhone(value: string | null | undefined): string | null {
  if (!value) return null
  const compact = value.replace(/[\s-]/g, '')
  if (/^(?:\+86)?1\d{10}$/.test(compact)) return compact
  if (/^\+?\d{8,15}$/.test(compact)) return compact
  return /[*•]/.test(value) ? value : null
}

/** Account launcher composed by the settings shell. */
export type AccountMenuProps = PropsRuntime<'settings.launcher'> & PropsLocale<'settings.account'> & InjectFace<AccountSectionInjected>

/** The signed-in label stays empty while the profile loads.
 * @param props - sidebar geometry, settings navigation and account operations.
 * @returns account menu launcher.
 */
export function AccountMenu({
  subscribeSessionExpired, subscribeModelSignInRequired, wide, settingsShortcut, openSettings, openOnboarding, settingsOpen, versionUpdate,
  useAccount, useTheme, signOut, hasRunningAccountTasks, refreshAccount, bonusNoticeShown, bonusNoticeDismissed,
  showLogin, start, cancel, submitPassword, avatarFailed, uploadAvatar, t, billingState, openRecharge, refreshBilling, openEnterpriseConsole,
}: AccountMenuProps) {
  const {
    enabled: billingEnabled, balanceCoins: billingCoins, canRecharge: billingCanRecharge,
    hasConsoleAccess, isPlatformAdmin, identity,
  } = useBillingState(billingState)
  const anchor = useRef<HTMLDivElement>(null)
  // The launcher outlives the panel, so a false-to-true edge is one Settings entry:
  // re-renders, section switches and tab switches inside one open must not read again.
  const settingsWasOpen = useRef(false)
  useEffect(() => {
    if (settingsOpen && !settingsWasOpen.current) void refreshAccount()
    settingsWasOpen.current = settingsOpen
  }, [refreshAccount, settingsOpen])
  const account = useAccount(state => state)
  const colorScheme = useTheme(snapshot => snapshot.active.colorScheme)
  const signedIn = account.view?.status === 'credential-stored'
  const [signInNotice, setSignInNotice] = useState(0)
  useEffect(() => subscribeModelSignInRequired?.(() => { setSignInNotice(value => value + 1) }), [subscribeModelSignInRequired])
  const [expiryNotice, setExpiryNotice] = useState(false)
  useEffect(() => subscribeSessionExpired?.(() => { setExpiryNotice(true) }), [subscribeSessionExpired])
  const profile = account.details?.profile
  const label = profile === undefined ? null : profile.status === 'ready'
    ? (displayAccountPhone(profile.value.name) ?? profile.value.name) ?? displayAccountPhone(profile.value.contact) ?? t('signedIn') : t('signedIn')
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const pictureInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarMessage, setAvatarMessage] = useState('')
  const [signOutImpact, setSignOutImpact] = useState<boolean | 'unknown'>()
  const requestSignOut = async () => {
    setBusy(true)
    try { setSignOutImpact(await hasRunningAccountTasks()); setOpen(false) }
    catch (_error) { setSignOutImpact('unknown'); setOpen(false) }
    finally { setBusy(false) }
  }
  // The plugin's start publishes `loginFailed` before it rejects, so the dialog owns the report.
  const beginSignIn = (): void => { setOpen(false); void start().catch(() => undefined) }
  const showBilling = signedIn && billingEnabled
  useEffect(() => { if (signedIn) refreshBilling?.() }, [signedIn, refreshBilling])
  const platformAdmin = isPlatformAdmin || identity?.platformAdmin === true
  // Real enterprise names stay visible; hide the redundant platform-workspace fallback.
  const companyLabel = !platformAdmin && identity?.company ? identity.company : null
  const phone = displayAccountPhone(identity?.phone ?? (profile?.status === 'ready' ? profile.value.contact : null))
  // Keep phone next to the display name only when it adds a distinct contact line.
  const phoneBesideName = phone && phone !== label ? phone : null
  const allowanceStatus = !billingEnabled || billingCoins === null ? t('allowanceUnknown')
    : billingCoins > 0 ? t('allowanceNormal') : t('allowanceEmpty')
  const canChangePicture = uploadAvatar !== undefined && (billingEnabled || identity !== undefined)
  const changePicture = async (file: File) => {
    if (!uploadAvatar) return
    setAvatarBusy(true)
    setAvatarMessage('')
    try {
      await uploadAvatar(file)
      await refreshAccount()
    } catch (error) {
      setAvatarMessage(error instanceof Error && error.message ? error.message : t('avatarError'))
    } finally { setAvatarBusy(false) }
  }
  const pictureName = profile?.status === 'ready' ? profile.value.name ?? null : null
  return <div ref={anchor} className={css.root} data-inset={signedIn && wide}>
    {signInNotice > 0 && <Toast key={signInNotice} text={t('modelSignInRequired')} onDone={() => { setSignInNotice(0) }} />}
    {expiryNotice && <Toast text={t('sessionExpired')} onDone={() => { setExpiryNotice(false) }} />}
    {signedIn && !account.desktopOnboardingVisible && !account.onboarding && account.notices && <AccountNoticeStack
      notices={account.notices}
      anchor={anchor} title={t('bonusNoticeTitle')} closeLabel={t('close')}
      onShown={bonusNoticeShown} onDismiss={bonusNoticeDismissed} />}
    <Menu open={open} side="top" portal autoFocus className={css.anchor} listClassName={signedIn ? css.accountPanel : css.signedOutMenu}
      anchor={<button ref={trigger} type="button" className={css.trigger} data-collapsed={!wide} data-signed-out={!signedIn} data-has-company={Boolean(companyLabel) || undefined} aria-label={t('menu')}
        aria-haspopup="menu" aria-expanded={open} onClick={() => { if (!open && signedIn) refreshBilling?.(); setOpen(value => !value) }}>
        {signedIn
          ? <span className={css.avatar} data-avatar-status={account.avatar?.status}>
            <AccountAvatar avatar={account.avatar} avatarFailed={avatarFailed} name={pictureName} />
          </span>
          : <IconEllipsisOutlineMedium size={14} />}
        {wide && (signedIn ? <>
          <span className={css.identity}>
            <span className={css.label}>{label}</span>
            {companyLabel && <span className={css.subtitle} title={companyLabel}>{companyLabel}</span>}
          </span>
          <span className={css.chevron}><IconChevronDownOutlineMedium size={14} /></span>
        </> : <span className={css.label}>{t('more')}</span>)}
      </button>}
      items={signedIn ? [] : [
        { id: 'settings', label: t('settings'), icon: <IconSettingsOutlineMedium size={16} />,
          ...(settingsShortcut === undefined ? {} : { shortcut: settingsShortcut }) },
        ...(versionUpdate ? [{ id: 'updates', label: t('versionUpdate'), icon: <IconDownloadOutlineMedium size={16} /> }] : []),
        { id: 'signin', label: t('signIn'), icon: <IconUserOutlineMedium size={16} /> },
      ]}
      onClose={() => { setOpen(false) }}
      onSelect={(id) => {
        if (id === 'settings') { setOpen(false); trigger.current?.focus(); openSettings() }
        else if (id === 'updates') { setOpen(false); trigger.current?.focus(); versionUpdate?.open() }
        else if (id === 'recharge') { setOpen(false); openRecharge?.() }
        else if (id === 'console') { setOpen(false); openEnterpriseConsole?.() }
        else if (id === 'signin') beginSignIn()
        else void requestSignOut()
      }}>
      {signedIn && <>
        <div className={css.panelHeader} role="presentation">
          {canChangePicture
            ? <button type="button" className={css.panelAvatarButton} aria-label={t('changeAvatar')} disabled={avatarBusy}
              onClick={() => { pictureInput.current?.click() }}>
              <span className={css.panelAvatar}><AccountAvatar avatar={account.avatar} avatarFailed={avatarFailed} name={pictureName} /></span>
              <span className={css.camera} aria-hidden="true"><CameraMark /></span>
            </button>
            : <span className={css.panelAvatar}><AccountAvatar avatar={account.avatar} avatarFailed={avatarFailed} name={pictureName} /></span>}
          <div className={css.panelIdentity}>
            <div className={css.panelNameRow}>
              <strong className={css.label}>{label}</strong>
              {phoneBesideName && <span className={css.phone}>{phoneBesideName}</span>}
            </div>
            {companyLabel && <span className={css.company} title={companyLabel}>{companyLabel}</span>}
          </div>
        </div>
        {canChangePicture && <input ref={pictureInput} className={css.pictureFile} type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.svg"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void changePicture(file)
          }} />}
        {avatarMessage && <span className={css.avatarError} role="alert">{avatarMessage}</span>}
        {!platformAdmin && <div className={css.allowance}
          data-tight={billingEnabled && billingCoins !== null && billingCoins <= 0 && !(showBilling && billingCanRecharge) ? true : undefined}
          role="presentation">
          {showBilling && billingCanRecharge ? <>
            <span className={css.allowanceLabel}>{t('sharedAllowance')}</span>
            <strong className={css.allowanceAmount}>{formatCoins(billingCoins)} <small>{t('aiCoinUnit')}</small></strong>
          </> : <>
            <strong className={css.allowanceState} data-empty={billingEnabled && billingCoins !== null && billingCoins <= 0}>{allowanceStatus}</strong>
            {billingEnabled && billingCoins !== null && billingCoins <= 0 && <span className={css.allowanceHint}>{t('contactAdmin')}</span>}
          </>}
        </div>}
        <MenuItemButton icon={<IconSettingsOutlineMedium size={16} />}
          {...(settingsShortcut === undefined ? {} : { shortcut: settingsShortcut })}
          onSelect={() => { setOpen(false); trigger.current?.focus(); openSettings() }}>{t('settings')}</MenuItemButton>
        {versionUpdate && <MenuItemButton icon={<IconDownloadOutlineMedium size={16} />}
          onSelect={() => { setOpen(false); trigger.current?.focus(); versionUpdate.open() }}>
          <span className={css.updateLabel}>{t('versionUpdate')}
            {versionUpdate.targetVersion && <small>{t('updateTarget', { version: versionUpdate.targetVersion })}</small>}
          </span>
        </MenuItemButton>}
        {showBilling && billingCanRecharge && <MenuItemButton icon={<IconPaperPlaneOutlineMedium size={16} />}
          onSelect={() => { setOpen(false); openRecharge?.() }}>{t('topUp')}</MenuItemButton>}
        {showBilling && openEnterpriseConsole !== undefined && (hasConsoleAccess || platformAdmin) && <MenuItemButton
          icon={<IconGaugeOutlineMedium size={16} />} onSelect={() => { setOpen(false); openEnterpriseConsole() }}>
          {platformAdmin ? t('adminConsole') : t('enterpriseConsole')}</MenuItemButton>}
        <MenuItemButton separatorBefore icon={<LogoutIcon />} disabled={busy}
          onSelect={() => { void requestSignOut() }}>{t('signOut')}</MenuItemButton>
        {versionUpdate?.currentVersion && <div className={css.installedVersion} role="presentation">
          {t('installedVersion', { version: versionUpdate.currentVersion })}</div>}
      </>}
    </Menu>
    {account.loginVisible && !account.onboarding && <SignInDialog account={account} colorScheme={colorScheme}
      start={start} cancel={cancel} t={t} {...(submitPassword === undefined ? {} : { submitPassword })}
      close={() => { showLogin(false) }} useApiKey={() => { showLogin(false); openOnboarding('deepseek-official') }} />}
    {signedIn && signOutImpact !== undefined && <SignOutDialog running={signOutImpact} signOut={signOut}
      close={() => { setSignOutImpact(undefined) }} t={t} />}
  </div>
}
