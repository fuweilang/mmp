/** Shared modal for voice activation and unavailable recognition. */
import type { ReactNode } from 'react'
import { Button, Modal } from '@mammoth-ai/mmp-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@mammoth-ai/mmp-client-ui-slots'
import type {} from '@mammoth-ai/mmp-client-ui-plugin-manager/client'
import type { NS } from './locales.ts'

type VoiceSetupDialogProps = PropsLocale<typeof NS>
  & Pick<PropsRuntime<'plugins.bundle.activation'>, 'onDismiss'>
  & {
    open: boolean
    needsInstallation: boolean
    /** Open the plugin details; the details button is absent while it is undefined. */
    onOpenDetails: PropsRuntime<'plugins.bundle.activation'>['onOpenDetails'] | undefined
    /** Preparation controls used when the Plugins page cannot be opened. */
    children?: ReactNode
  }

/**
 * Guide a missing model to plugin details, or show preparation controls when those details cannot open.
 * @param props - visibility, installation need, navigation, and optional preparation controls.
 * @returns a dismissible prompt. Preparation starts only from the supplied controls.
 */
export function VoiceSetupDialog({ open, needsInstallation, onDismiss, onOpenDetails, children, t }: VoiceSetupDialogProps) {
  return <Modal open={open} title={t(needsInstallation ? 'setupPrompt.title' : 'setupPrompt.unavailableTitle')}
    closeLabel={t('cancel')} onClose={onDismiss}
    footer={<>
      <Button variant="ghost" onClick={onDismiss}>{t('setupPrompt.later')}</Button>
      {onOpenDetails !== undefined && <Button variant="primary" data-modal-autofocus onClick={onOpenDetails}>
        {t(needsInstallation ? 'setupPrompt.open' : 'setupPrompt.details')}
      </Button>}
    </>}>
    {children ?? <p>{t(needsInstallation ? 'setupPrompt.body' : 'setupPrompt.unavailableBody')}</p>}
  </Modal>
}
