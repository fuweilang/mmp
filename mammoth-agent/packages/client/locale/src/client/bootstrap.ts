/** Locale initialization supplied by a native shell before its Client tree mounts. */

/** System languages and the existing Host preference for one page load. */
export interface LocaleBootstrap {
  /**
   * Operating-system language tags in preference order. Kept in the native
   * protocol for compatibility, but the Chinese product default does not
   * consume them.
   */
  readonly languages: readonly string[]
  /** Stored locale.preference; null keeps the Chinese product default. */
  readonly preference: string | null
}

/** Optional page-global bridge named __MMP_LOCALE__; ordinary browsers omit it. */
export interface LocaleBridge {
  /** Read current initialization data through the shell's isolated preload. @returns unvalidated IPC data. */
  read(): Promise<unknown>
  /** Publish the resolved Client locale without writing another preference. @param locale - active registered locale id. */
  onChange(locale: string): void
}

/**
 * Validate initialization data returned over the preload IPC bridge.
 * @param value - untrusted IPC response.
 * @returns preference initialization with no persistence side effects.
 */
export function parseLocaleBootstrap(value: unknown): LocaleBootstrap {
  if (typeof value !== 'object' || value === null || !('languages' in value) || !Array.isArray(value.languages)
    || !value.languages.every((language: unknown) => typeof language === 'string')
    || !('preference' in value) || (value.preference !== null && typeof value.preference !== 'string')) {
    throw new TypeError('locale: invalid native initialization data')
  }
  return { languages: value.languages, preference: value.preference }
}
