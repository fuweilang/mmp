import type { PluginManagerLocaleKey } from './locales.ts'
import { INSTALL_GIT_EXAMPLE, INSTALL_PATH_EXAMPLE } from './locales.ts'
import type { InstallInputError, InstallState, InstallSubject, RegistryChoice } from './manager-store.ts'
import { asksMirror, githubRecoveryRegistry, isInstallPending, offeredRegistries } from './manager-store.ts'
import type { Translate } from './presentation.ts'
import { managementText, registryText, restartText } from './presentation.ts'
import type { PluginInstallFailureKind, Registry } from '@mammoth-ai/mmp-api-remotes/client'
import type { TerminalBlockLabels } from '@mammoth-ai/mmp-client-ui-primitives'
import {
  Button, IconCheckCircleFillRegular, IconChevronDownOutlineRegular, IconChevronLeftOutlineMedium,
  IconCloseOutlineMedium, IconWarningOutlineRegular,
  Modal, pointerModality, StateDot, TerminalBlock, useAnchoredPosition, useDismissOnOutsidePointer,
} from '@mammoth-ai/mmp-client-ui-primitives'
import type { ReactNode } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import css from './PluginManagerPage.module.css'

const INSTALL_TERMINAL_LINES = 12

/** The install terminal's display copy, from the tab's dictionary. */
function terminalLabels(t: Translate): TerminalBlockLabels {
  return {
    commandLine: line => t('terminalCommandLine', { n: String(line) }),
    /* v8 ignore next -- the Host reports a killed pnpm as a null exit code, never a signal name; the label interface needs one */
    signal: signal => t('terminalSignal', { signal }),
    exitCode: code => t('terminalExitCode', { code: String(code) }),
    noExitCode: t('terminalNoExitCode'),
    running: t('terminalRunning'),
    failed: t('terminalFailed'),
    done: t('terminalDone'),
    copy: t('terminalCopy'),
    copied: t('terminalCopied'),
    noOutput: t('terminalNoOutput'),
    collapseAria: t('terminalCollapseAria'),
    collapse: t('terminalCollapse'),
    expandAria: hidden => t('terminalExpandAria', { n: String(hidden) }),
    expand: hidden => t('terminalExpand', { n: String(hidden) }),
  }
}

/** The sentence under the field for a spec the check refused. */
const INPUT_PROBLEM_KEYS = {
  'invalid-spec': 'installProblemInvalid',
  'already-installed': 'installProblemInstalled',
  'shipped': 'installProblemShipped',
  'not-found': 'installProblemNotFound',
  'not-a-package': 'installProblemNotPackage',
  'not-a-bundle': 'installProblemNotBundle',
  'network': 'installProblemNetwork',
  'unknown': 'installProblemUnknown',
} satisfies Record<InstallInputError['problem'], PluginManagerLocaleKey>

/** One row of the install guide: a spec form's title, its example, and where the person finds it. */
interface GuideExample {
  readonly key: string
  readonly titleKey: PluginManagerLocaleKey
  readonly exampleKey: PluginManagerLocaleKey
  readonly hintKey: PluginManagerLocaleKey
}

/** The spec form the install guide shows, with an example the person can drop into the field. */
const GUIDE_EXAMPLES = [
  { key: 'id', titleKey: 'installGuideIdTitle', exampleKey: 'installGuideIdExample', hintKey: 'installGuideIdHint' },
] as const satisfies readonly GuideExample[]

/** The one-line reading of a classified pnpm failure. */
const FAILURE_KIND_KEYS = {
  'pnpm-missing': 'installFailurePnpmMissing',
  'timeout': 'installFailureTimeout',
  'not-found': 'installFailureNotFound',
  'no-matching-version': 'installFailureNoMatchingVersion',
  'network': 'installFailureNetwork',
  'disk-full': 'installFailureDiskFull',
  'permission': 'installFailurePermission',
  'build-blocked': 'installFailureBuildBlocked',
  'integrity': 'installFailureIntegrity',
  'unknown': 'installFailureGeneric',
} satisfies Record<PluginInstallFailureKind, PluginManagerLocaleKey>

/** The navigation value of the page's own tab; contributed tabs use their registration ids. */
const INSTALLED_TAB = 'installed'

/** The heading of each screen past the spec. */
const SCREEN_TITLE_KEYS = {
  starting: 'installStarting',
  running: 'installingTitle',
  cancelling: 'installCancelling',
  applying: 'installApplying',
  unconfirmed: 'installUnconfirmedTitle',
  unknown: 'installUnknownTitle',
  done: 'installedTitle',
  failed: 'installFailedTitle',
} satisfies Record<Exclude<InstallState['phase'], 'idle' | 'checking'>, PluginManagerLocaleKey>

/** What the spec's kind reads as when the package carries no description of its own. */
const SUBJECT_KIND_KEYS = {
  registry: undefined,
  path: 'installSubjectPath',
  git: 'installSubjectGit',
  tarball: 'installSubjectTarball',
} satisfies Record<InstallSubject['kind'], PluginManagerLocaleKey | undefined>

/** A check no registry answered names every registry asked; any other refusal reads by its problem. */
function inputProblemSentence(problem: InstallInputError, t: Translate, resolved: string | null): string {
  const asked = problem.registries ?? []
  return problem.problem === 'network' && asked.length > 1
    ? t('installProblemNetworkAll', { registries: registryList(asked, t, resolved) })
    : t(INPUT_PROBLEM_KEYS[problem.problem], { reason: problem.reason })
}

/** The registries asked, by name, in the dictionary's list form. */
function registryList(registries: readonly Registry[], t: Translate, resolved: string | null): string {
  return registries.map(registry => registryText(registry, t, resolved).name).join(t('registryListSeparator'))
}

/** An option's name with its host in tertiary text, unless the host is the name. */
function registryOption(registry: Registry, t: Translate, resolved: string | null): ReactNode {
  const { name, host } = registryText(registry, t, resolved)
  return name === host ? name : <>{name}{' '}<span className={css.registryHint}>{host}</span></>
}

/**
 * The failed screen's one line: a pnpm failure by its kind, a refusal by its
 * code, any other failure in the Host's words; the run's output stays behind the details.
 * A run the Host laid at the spec's own host says so; one it laid at a registry
 * names every registry asked when there were several.
 */
function failureText(failure: InstallState['failure'], t: Translate, install?: Pick<InstallState, 'attempts' | 'subject' | 'registries'>): string {
  if (failure === null) return t('installFailureGeneric')
  // A compatibility refusal is the package's own answer, whatever pnpm's exit classified the run as.
  if (failure.code === 'incompatible-version') {
    const incompatible = failure.incompatible === undefined ? {} : { incompatible: failure.incompatible }
    return managementText({ code: failure.code, installing: true, ...incompatible }, t)
  }
  // Blocked scripts the Host could not name leave the person to allow them in the profile's pnpm settings by hand.
  if (failure.kind === 'build-blocked' && !failure.pendingBuilds?.length) return t('installFailureBuildBlockedManual')
  const host = install?.subject?.host
  if (failure.failedAt === 'spec-host' && host !== undefined) return t('installFailureNetworkHost', { host })
  const asked = install?.attempts?.registries ?? []
  if (failure.failedAt === 'registry' && (failure.kind === 'network' || failure.kind === 'timeout') && asked.length > 1) {
    return t('installFailureNetworkAll', { registries: registryList(asked, t, install?.registries?.resolved ?? null) })
  }
  if (failure.kind !== undefined) return t(FAILURE_KIND_KEYS[failure.kind])
  if (failure.code !== undefined) return managementText({ code: failure.code, diagnostic: failure.reason }, t)
  if (failure.reason !== '') return failure.reason
  // An enabled install that failed applying the bundle names that step, never the install command it already finished.
  return failure.stage === 'enable' && failure.enabled === true ? t('installFailedEnabling') : t('installFailureGeneric')
}

interface SubjectLines {
  readonly spec: string
  readonly title: string
  readonly description?: string | undefined
  readonly version?: string | undefined
  /** A confirmed version is named by its tab, so the spec follows as reference text. */
  readonly showSpec: boolean
}

/** The package an install is about: its name, one-liner, version, and, when `showSpec` is set, its spec. */
function SubjectBlock({ lines, t }: { readonly lines: SubjectLines; readonly t: Translate }): ReactNode {
  return (
    <div className={css.subject} data-install-subject={lines.spec}>
      <p className={css.subjectName}>{lines.title}</p>
      {lines.description === undefined ? null : <p className={css.subjectDesc}>{lines.description}</p>}
      {lines.version === undefined ? null : <p className={css.subjectMeta}>{t('installVersion', { version: lines.version })}</p>}
      {lines.showSpec ? <p className={css.subjectSpec}>{lines.spec}</p> : null}
    </div>
  )
}

/** The checked package as the Host read it before installing; a confirmed version keeps its tab's name and version. */
function SubjectCard({ subject, confirmed, t }: {
  readonly subject: InstallSubject
  readonly confirmed: InstallState['confirmed']
  readonly t: Translate
}): ReactNode {
  const kindKey = SUBJECT_KIND_KEYS[subject.kind]
  return (
    <SubjectBlock t={t} lines={{
      spec: subject.spec,
      title: confirmed?.title ?? subject.name ?? subject.spec,
      description: subject.description ?? (kindKey === undefined ? undefined : t(kindKey)),
      version: subject.version ?? confirmed?.version,
      showSpec: confirmed !== undefined,
    }} />
  )
}

/** Track one install field's composition, including Safari's 10ms post-composition Enter window. */
function useInstallComposition(active: boolean) {
  const composition = useRef({ active: false, until: 0 })
  useEffect(() => { composition.current = { active: false, until: 0 } }, [active])
  return {
    onCompositionStart: () => { composition.current.active = true },
    onCompositionEnd: () => { composition.current = { active: false, until: Date.now() + 10 } },
    onBlur: () => { composition.current = { active: false, until: 0 } },
    isComposing: (event: KeyboardEvent) => event.isComposing || Reflect.get(event, 'keyCode') === 229
      || composition.current.active || Date.now() < composition.current.until,
  }
}

/**
 * The install dialog: the spec and its check, then the installing, installed,
 * and failed screens over the same subject card. A failed run that left
 * install scripts undecided shows them for approval in place of plain retry.
 */
function InstallDialog({
  install, t, onClose, onEditSpec, onRun, onCancel, onReconcile, onToggleDetails, onEnableNow, onApproveBuilds,
  onToggleRegistry, onChooseRegistry, onChangeRegistry, onUseGithubMirror,
}: {
  readonly install: InstallState
  readonly t: Translate
  readonly onClose: () => void
  readonly onEditSpec: (text: string) => void
  readonly onRun: () => void
  readonly onCancel: () => void
  readonly onReconcile: () => void
  readonly onToggleDetails: () => void
  readonly onEnableNow: () => void
  readonly onApproveBuilds: () => void
  readonly onToggleRegistry: () => void
  readonly onChooseRegistry: (choice: RegistryChoice) => void
  /** From the failed screen: back to the spec with the registry options unfolded. */
  readonly onChangeRegistry: () => void
  readonly onUseGithubMirror: () => void
}): ReactNode {
  const errorId = useId()
  const templateHintId = useId()
  const guideId = useId()
  const approvalId = useId()
  const registryId = useId()
  const registryErrorId = useId()
  const [guideOpen, setGuideOpen] = useState(false)
  const [customRegistryDraft, setCustomRegistryDraft] = useState('')
  const { phase } = install
  // The registry options float over the dialog from their toggle, so unfolding them never adds to its height;
  // the store folds them when a run starts, so they show at the spec only.
  const registryToggleRef = useRef<HTMLButtonElement | null>(null)
  const registryPanelRef = useRef<HTMLFieldSetElement | null>(null)
  const registryCustomRef = useRef<HTMLInputElement | null>(null)
  const registryShown = install.registryOpen && phase === 'idle'
  const specComposition = useInstallComposition(install.open && phase === 'idle')
  const registryComposition = useInstallComposition(install.open && registryShown)
  const registryPosition = useAnchoredPosition({
    open: registryShown, anchorRef: registryToggleRef, panelRef: registryPanelRef, align: 'end', gap: 6, margin: 12,
  })
  const registryReady = registryShown && registryPosition !== null
  useEffect(() => {
    if (registryReady && install.registryError) registryCustomRef.current?.focus()
  }, [registryReady, install.registryError])
  // The hook only ever asks to close.
  useDismissOnOutsidePointer(registryToggleRef, registryShown, onToggleRegistry, registryPanelRef)
  useEffect(() => {
    if (!registryShown) return
    // Escape folds the options and goes no further: the dialog under them listens for the same key.
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onToggleRegistry()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => { document.removeEventListener('keydown', onKeyDown, true) }
  }, [registryShown, onToggleRegistry])
  if (githubRecoveryRegistry(install) !== undefined) {
    const anotherWay = asksMirror(install)
    return (
      <Modal
        open={install.open}
        onClose={onClose}
        title={t(install.failure?.kind === 'timeout' ? 'installGithubTimeoutTitle' : 'installGithubFailedTitle')}
        closeLabel={t('close')}
        description={t('installGithubFailedDescription')}
        footer={(
          <>
            <Button variant="outline" onClick={onClose}>{t('cancel')}</Button>
            <Button
              variant="primary"
              autoFocus
              onClick={() => {
                // The mirror is already asked, so the form opens with the package-name guide.
                if (anotherWay) setGuideOpen(true)
                onUseGithubMirror()
              }}
            >
              {t(anotherWay ? 'installTryAnotherWay' : 'installUseGithubMirror')}
            </Button>
          </>
        )}
      />
    )
  }
  if ((phase === 'idle' || phase === 'checking') && install.confirmed !== undefined) {
    // A confirmed spec has no form to return to: the dialog names the plugin and version above the spec, with its
    // check, a refusal with a retry, or, after a cancelled run, Install.
    const checking = phase === 'checking'
    const problem = install.inputError
    return (
      <Modal
        open={install.open}
        onClose={onClose}
        title={t(problem === null ? 'installConfirmedTitle' : 'installConfirmedRefused')}
        closeLabel={t('close')}
        className={css.installDialog as string}
        footer={checking ? undefined : (
          <>
            <Button variant="outline" onClick={onClose}>{t('close')}</Button>
            <Button variant="primary" autoFocus onClick={onRun}>{t(problem === null ? 'installRun' : 'retry')}</Button>
          </>
        )}
      >
        <div className={css.installBody} data-install-phase={phase}>
          <SubjectBlock t={t} lines={{ spec: install.spec, ...install.confirmed, showSpec: true }} />
          {checking
            ? <p className={`${css.status} ${css.statusWithDot}`} role="status"><StateDot state="ongoing" />{t('installChecking')}</p>
            : problem === null
              ? null
              : (
                <p className={css.inputError} role="alert">{inputProblemSentence(problem, t, install.registries?.resolved ?? null)}</p>
              )}
        </div>
      </Modal>
    )
  }
  if (phase === 'idle' || phase === 'checking') {
    const checking = phase === 'checking'
    const empty = install.spec.trim() === ''
    const choice = install.registry
    const resolved = install.registries?.resolved ?? null
    const chosenTitle = choice.kind === 'custom' ? t('registryCustom') : registryText(choice.registry, t, resolved).name
    const inputSentence = install.inputError === null ? null : inputProblemSentence(install.inputError, t, resolved)
    const templateHint = install.spec === INSTALL_GIT_EXAMPLE
      ? t('installGitTemplateHint')
      : install.spec === INSTALL_PATH_EXAMPLE ? t('installPathTemplateHint') : null
    return (
      <Modal
        open={install.open}
        onClose={onClose}
        title={t('installTitle')}
        closeLabel={t('close')}
        {...install.mirrorRecovery ? {} : { description: t('installDescription') }}
        className={css.installDialog as string}
        contentClassName={css.installContent as string}
        footer={(
          <div className={css.installFooter}>
            <p className={css.installSafety} role="note">
              <IconWarningOutlineRegular size={14} aria-hidden="true" />
              <span className={css.installSafetyText}>
                <span>{t('installGuideSafety')}</span>
                <span>{t('installUpgradeNotice')}</span>
              </span>
            </p>
            <Button variant="primary" className={css.wide} disabled={checking || empty} aria-busy={checking} onClick={onRun}>
              {checking ? <StateDot state="ongoing" /> : null}
              {t(checking ? 'installChecking' : 'installRun')}
            </Button>
          </div>
        )}
      >
        <div className={css.installBody}>
          <div className={css.installField}>
            <input
              type="text"
              autoFocus={install.mirrorRecovery === true}
              data-modal-autofocus
              value={install.spec}
              placeholder={t('installSpecPlaceholder')}
              disabled={checking}
              aria-label={t(install.mirrorRecovery ? 'installPackageLabel' : 'installSpecLabel')}
              aria-invalid={install.inputError !== null}
              aria-describedby={inputSentence !== null ? errorId : templateHint !== null ? templateHintId : undefined}
              onChange={(event) => { onEditSpec(event.currentTarget.value) }}
              onCompositionStart={specComposition.onCompositionStart}
              onCompositionEnd={specComposition.onCompositionEnd}
              onBlur={specComposition.onBlur}
              onKeyDown={(event) => {
                if (specComposition.isComposing(event.nativeEvent)) return
                if (event.key === 'Enter' && !empty && !checking) onRun()
              }}
            />
          </div>
          {inputSentence === null
            ? null
            : <p id={errorId} className={css.inputError} role="alert">{inputSentence}</p>}
          {inputSentence === null && templateHint !== null
            ? <p id={templateHintId} className={css.templateHint} role="status">{templateHint}</p>
            : null}
          <div className={css.optionsRow}>
            <button
              type="button"
              className={css.guideToggle}
              aria-expanded={guideOpen}
              aria-controls={guideId}
              onClick={() => { setGuideOpen(open => !open) }}
            >
              <IconChevronDownOutlineRegular className={css.guideChevron} aria-hidden="true" />
              <span>{t(guideOpen ? 'installGuideHide' : 'installGuideToggle')}</span>
            </button>
            <button
              ref={registryToggleRef}
              type="button"
              className={css.registryToggle}
              aria-expanded={install.registryOpen}
              aria-controls={registryId}
              aria-haspopup="dialog"
              disabled={checking}
              onClick={onToggleRegistry}
            >
              <span>{t('registryToggle')}</span>
              {' '}
              <span className={css.registryChosen}>{chosenTitle}</span>
              <IconChevronDownOutlineRegular className={css.guideChevron} aria-hidden="true" />
            </button>
          </div>
          {guideOpen
            ? (
              <div id={guideId} className={css.guide} data-install-guide>
                <ol className={css.guideList}>
                  {GUIDE_EXAMPLES.map(({ key, titleKey, exampleKey, hintKey }) => (
                    <li key={key} className={css.guideItem}>
                      <div className={css.guideMain}>
                        <span className={css.guideTitle}>{t(titleKey)}</span>
                        <span className={css.guideHint}>{t(hintKey)}</span>
                        <span className={css.guideExample}>
                          <span className={css.guideExampleLabel}>{t('installGuideExampleLabel')}</span>
                          <code>{t(exampleKey)}</code>
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={t('installGuideFillAria', { example: t(exampleKey) })}
                        disabled={checking}
                        onClick={() => { onEditSpec(t(exampleKey)) }}
                      >
                        {t('installGuideFill')}
                      </Button>
                    </li>
                  ))}
                </ol>
              </div>
            )
            : null}
          {registryShown
            ? createPortal(
              <fieldset
                ref={registryPanelRef}
                id={registryId}
                className={css.registry}
                style={registryPosition ?? { visibility: 'hidden', left: 0, top: 0 }}
                data-install-registry
                aria-label={t('registryLegend')}
                onKeyDown={(event) => {
                  if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey || event.nativeEvent.isComposing) return
                  event.preventDefault()
                  event.stopPropagation()
                  const radio = event.currentTarget.querySelector<HTMLInputElement>('input[type="radio"]:checked')
                  const field = registryCustomRef.current
                  if (event.shiftKey && event.target === field) radio?.focus()
                  else if (!event.shiftKey && event.target !== field) field?.focus()
                  else {
                    onToggleRegistry()
                    registryToggleRef.current?.focus()
                  }
                }}
              >
                {offeredRegistries(install.registries).map((registry) => {
                  const checked = choice.kind === 'offered' && choice.registry === registry
                  return (
                    <label key={registry ?? ''} className={css.registryOption} data-checked={checked}>
                      <input type="radio" name={registryId} checked={checked} onChange={() => {
                        if (choice.kind === 'custom') setCustomRegistryDraft(choice.url)
                        onChooseRegistry({ kind: 'offered', registry })
                      }} />
                      <span className={css.registryTitle}>{registryOption(registry, t, resolved)}</span>
                    </label>
                  )
                })}
                <div className={css.registryOption} data-checked={choice.kind === 'custom'}
                  onClick={(event) => {
                    // Keep label activation from moving focus back to the radio.
                    if (!(event.target instanceof HTMLInputElement)) event.preventDefault()
                    registryCustomRef.current?.focus()
                  }}>
                  <label className={css.registryCustomPick}>
                    <input
                      type="radio"
                      name={registryId}
                      checked={choice.kind === 'custom'}
                      onChange={() => {
                        onChooseRegistry({ kind: 'custom', url: customRegistryDraft })
                        registryCustomRef.current?.focus()
                      }}
                    />
                    <span className={css.registryTitle}><span>{t('registryCustom')}</span></span>
                  </label>
                  <input
                    ref={registryCustomRef}
                    type="text"
                    className={css.registryCustomField}
                    aria-label={t('registryCustom')}
                    placeholder={t('registryCustomPlaceholder')}
                    value={choice.kind === 'custom' ? choice.url : customRegistryDraft}
                    aria-invalid={install.registryError}
                    aria-describedby={install.registryError ? registryErrorId : undefined}
                    onFocus={() => {
                      if (pointerModality() && choice.kind !== 'custom') onChooseRegistry({ kind: 'custom', url: customRegistryDraft })
                    }}
                    onChange={(event) => { onChooseRegistry({ kind: 'custom', url: event.currentTarget.value }) }}
                    onCompositionStart={registryComposition.onCompositionStart}
                    onCompositionEnd={registryComposition.onCompositionEnd}
                    onBlur={registryComposition.onBlur}
                    onKeyDown={(event) => {
                      if (registryComposition.isComposing(event.nativeEvent)) return
                      if (event.key === 'Enter' && !empty) onRun()
                    }}
                  />
                  {install.registryError
                    ? <p id={registryErrorId} className={css.inputError} role="alert">{t('registryCustomInvalid')}</p>
                    : null}
                  <span className={css.registryHint}>{t('registryCustomHint')}</span>
                </div>
              </fieldset>,
              document.body,
            )
            : null}
        </div>
      </Modal>
    )
  }
  const heading = t(phase === 'done' && install.subject?.bundled ? 'installBundledTitle' : SCREEN_TITLE_KEYS[phase])
  const pending = isInstallPending(phase)
  // A settled screen whose install never reported a run can say the details received no terminal output.
  const settledDetails = phase === 'failed' || phase === 'done' || phase === 'unknown'
  const cancellable = phase === 'starting' || phase === 'running' || phase === 'unconfirmed'
  const stoppable = cancellable || phase === 'failed' || phase === 'unknown'
  const failure = install.failure
  const uncertainty = failure?.uncertainty
  const uncertaintyText = failure?.uncertainty === undefined ? null : t(({
    result: 'installResultUnconfirmed',
    cancellation: phase === 'applying' ? 'installApplyingCancellationError' : 'installCancelUnconfirmed',
    acceptance: 'installAwaitingAcceptance',
  } as const)[failure.uncertainty], { reason: failure.reason })
  const pendingBuilds = phase === 'failed' ? install.failure?.pendingBuilds ?? [] : []
  const approvable = pendingBuilds.length > 0
  const firstRun = install.runs[0]
  // The registries the Host asked, once there is more than one: the attempt under way while it runs, a badge on each run.
  const asked = install.attempts !== null && install.attempts.registries.length > 1 ? install.attempts : null
  const current = asked === null ? undefined : asked.registries.at(-1)
  const previous = asked === null ? undefined : asked.registries.at(-2)
  const resolved = install.registries?.resolved ?? null
  const attemptLine = pending && asked !== null && current !== undefined && previous !== undefined
    ? t('installAttempt', {
      previous: registryText(previous, t, resolved).name, registry: registryText(current, t, resolved).name,
      index: String(asked.registries.length), total: String(asked.total),
    })
    : null
  // Another registry is worth offering only for a failure the Host laid at the one it asked.
  const changeable = phase === 'failed' && !approvable && install.failure?.failedAt === 'registry' && install.confirmed === undefined
  const subject = install.subject
  return (
    <Modal open={install.open} onClose={onClose} title={heading} headless className={css.installDialog as string}>
      <div className={css.wizard} data-install-phase={phase}>
        <div className={css.wizardHead}>
          {phase === 'done' || (install.confirmed !== undefined && !pending)
            ? <span />
            : (
              <button type="button" className={css.wizardBack} aria-label={t(install.confirmed !== undefined ? 'cancel' : pending ? 'installCancelAndEdit' : 'installEditAria')}
                disabled={!stoppable} onClick={onCancel}>
                <IconChevronLeftOutlineMedium aria-hidden="true" />
                <span>{t(install.confirmed !== undefined ? 'cancel' : pending ? 'installCancelAndEdit' : 'installEdit')}</span>
              </button>
            )}
          <button
            type="button"
            className={css.wizardClose}
            aria-label={t(cancellable ? 'installCloseCancels' : 'close')}
            onClick={onClose}
          >
            <IconCloseOutlineMedium size={14} />
          </button>
        </div>
        <div className={css.wizardScroll}>
          <div className={css.wizardHero}>
            <span className={css.wizardIcon} data-state={pending ? 'ongoing' : phase === 'done' ? 'done' : 'error'} aria-hidden="true">
              {pending
                ? <StateDot state="ongoing" size={28} />
                : phase === 'done'
                  ? <IconCheckCircleFillRegular size={28} />
                  : <IconWarningOutlineRegular size={28} />}
            </span>
            <h2 className={css.wizardTitle} role={phase === 'failed' ? 'alert' : 'status'}>{heading}</h2>
            {phase === 'done' && subject?.bundled ? <p className={css.wizardSub}>{t('installBundledDescription')}</p> : null}
            {phase === 'failed' ? <p className={css.wizardSub}>{failureText(install.failure, t, install)}</p> : null}
            {phase === 'failed' && failure?.stage === 'enable' && failure.enabled === true
              && (failure.code !== undefined || failure.reason !== '')
              ? <p className={css.wizardSub}>{t('installFailedEnabling')}</p>
              : null}
            {attemptLine === null ? null : <p className={css.wizardSub}>{attemptLine}</p>}
            {uncertaintyText === null ? null : <p className={css.wizardSub} role="alert">{uncertaintyText}</p>}
            {phase === 'unknown' ? <p className={css.wizardSub}>{t('installUnknownDescription')}</p> : null}
          </div>
          {subject === null
            ? null
            : <SubjectCard subject={phase === 'done' && install.installedVersion !== null ? { ...subject, version: install.installedVersion } : subject} confirmed={install.confirmed} t={t} />}
          {approvable
            ? (
              <section className={css.approval} role="group" aria-labelledby={approvalId} data-install-approval>
                <h3 id={approvalId} className={css.approvalTitle}>{t('installApprovalTitle')}</h3>
                <p className={css.approvalText}>{t('installApprovalDescription')}</p>
                <ul className={css.approvalList}>
                  {pendingBuilds.map(name => <li key={name}><code>{name}</code></li>)}
                </ul>
                <p className={css.approvalText}>{t('installApprovalConsequence')}</p>
                <p className={css.approvalCaution}>{t('installApprovalCaution')}</p>
                <Button variant="primary" className={css.wide} onClick={onApproveBuilds}>{t('installApproveAndRetry')}</Button>
              </section>
            )
            : null}
          {phase === 'done' && install.installed === null
            ? <p className={css.result} role="status">{t('installDoneNothing')}</p>
            : null}
          {phase === 'done' && install.restartRequired
            ? <p className={css.resultWarn} role="status">{restartText('installDoneRestart', install.restartReason, t)}</p>
            : null}
          {phase === 'done' && subject?.kind === 'registry' && subject.name !== undefined && subject.version !== undefined
            && install.installedVersion !== null && install.installedVersion !== subject.version
            // A fallback registry can serve another release than the one inspected, so only a single-registry run is explained.
            && (install.attempts?.registries.length ?? 1) === 1
            ? (
              <p className={css.resultWarn} role="status">
                {t('installDoneOtherVersion', {
                  installed: install.installedVersion, version: subject.version, exact: `${subject.name}@${subject.version}`,
                })}
              </p>
            )
            : null}
          {phase === 'done' && install.approvedBuilds.length > 0
            ? <p className={css.result} role="status">{t('installDoneApproved', { names: install.approvedBuilds.join(', ') })}</p>
            : null}
          <div className={css.wizardFoot}>
            {subject?.bundled ? null : (
              <button type="button" className={css.detailsToggle} aria-expanded={install.detailsOpen} onClick={onToggleDetails}>
                <span>{t(install.detailsOpen ? 'installDetailsHide' : 'installDetailsShow')}</span>
                <IconChevronDownOutlineRegular className={css.detailsChevron} aria-hidden="true" />
              </button>
            )}
            {uncertainty === 'result' ? <Button variant="outline" size="sm" className={css.footAction} onClick={onReconcile}>{t('installReconcile')}</Button> : null}
            {pending
              ? (
                <Button variant="outline" size="sm" className={css.footAction} disabled={!cancellable} onClick={onCancel}>
                  {t(phase === 'cancelling' ? 'installCancelling' : 'installCancel')}
                </Button>
              )
              : null}
            {phase === 'failed' && !approvable
              ? (
                <span className={css.wizardActions}>
                  {changeable
                    ? <Button variant="outline" size="sm" className={css.footAction} onClick={onChangeRegistry}>{t('installChangeRegistry')}</Button>
                    : null}
                  <Button variant="primary" size="sm" className={css.footAction} onClick={onRun}>{t('installRetry')}</Button>
                </span>
              )
              : null}
          </div>
          {install.detailsOpen
            ? (
              <div className={css.detailsBody}>
                {firstRun !== undefined
                  ? <p className={css.installLocation}>{t('installLocation', { dir: firstRun.cwd })}</p>
                  : settledDetails
                    ? <p className={css.installLocation}>{t('installDetailsNoOutput')}</p>
                    : null}
                {install.runs.map((run, index) => {
                  const registry = asked?.registries[index]
                  return (
                    <div key={run.jobId} className={css.run}>
                      {registry === undefined
                        ? null
                        : <p className={css.attemptBadge}>{t('installAttemptBadge', { index: String(index + 1), registry: registryText(registry, t, resolved).name })}</p>}
                      <TerminalBlock
                        command={run.command}
                        output={run.output}
                        running={run.exitCode === undefined}
                        exitCode={run.exitCode}
                        maxLines={INSTALL_TERMINAL_LINES}
                        labels={{ ...terminalLabels(t), ...phase === 'cancelling' ? { failed: t('installCancelledShort') } : {} }}
                        className={css.terminal}
                      />
                    </div>
                  )
                })}
                {install.logPath === null
                  ? null
                  : <p className={css.installLocation}>{t('installLogPath', { path: install.logPath })}</p>}
              </div>
            )
            : null}
          {phase !== 'done'
            ? null
            : install.installed !== null && install.subject?.selection === undefined
              ? <Button variant="primary" className={css.wide} disabled={install.enabling} aria-busy={install.enabling} onClick={onEnableNow}>{t('installEnableNow')}</Button>
              : <Button variant="primary" className={css.wide} onClick={onClose}>{t('installClose')}</Button>}
        </div>
      </div>
    </Modal>
  )
}

/** The confirmation an uninstall waits on. */

export {
  FAILURE_KIND_KEYS,
  GUIDE_EXAMPLES,
  GuideExample,
  INPUT_PROBLEM_KEYS,
  INSTALLED_TAB,
  INSTALL_TERMINAL_LINES,
  InstallDialog,
  SCREEN_TITLE_KEYS,
  SUBJECT_KIND_KEYS,
  SubjectBlock,
  SubjectCard,
  SubjectLines,
  failureText,
  inputProblemSentence,
  registryList,
  registryOption,
  terminalLabels,
  useInstallComposition,
}
