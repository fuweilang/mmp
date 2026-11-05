/** Public page-bootstrap options shared by the Host and Client halves. */

import z from '@mammoth-ai/schemastery'

/** Onboarding options after schema defaults are applied. */
export interface Config {
  /** Offer the browser API-key step when no native shell owns credential onboarding. */
  credentialOnboarding: boolean
  /** Cloud-only product mode: Models settings is a read-only notice; no provider API-key forms. */
  cloudOnly: boolean
}

/** Validate Host configuration and its public page-bootstrap payload. */
export const Config: z<Partial<Config>, Config> = z.object({
  credentialOnboarding: z.boolean().default(false),
  cloudOnly: z.boolean().default(true),
})

/** Page-global key carrying only the public onboarding options. */
export const ONBOARDING_CONFIG_GLOBAL = '__MMP_MODELS_ONBOARDING__'
