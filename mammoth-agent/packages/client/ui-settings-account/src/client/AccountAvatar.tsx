/** Shared account picture with an icon fallback for missing or unavailable images. */
import { IconUserOutlineMedium } from '@mammoth-ai/mmp-client-ui-primitives'
import type { AccountAvatarSnapshot } from './account-avatar.ts'
import css from './AccountAvatar.module.css'

/**
 * Render a decorative avatar next to the account identity.
 * @param props - shared browser load outcome and rendered-image failure reporter; absent data uses the default icon.
 * @returns picture or the default account icon.
 */
export function AccountAvatar({ avatar, avatarFailed, name }: {
  avatar: AccountAvatarSnapshot | undefined
  avatarFailed: (snapshot: AccountAvatarSnapshot) => void
  /** Shown as a single character when this account has no picture. */
  name?: string | null | undefined
}) {
  if (avatar?.status === 'ready') {
    return <img className={css.image} src={avatar.url} alt="" referrerPolicy="no-referrer"
      onError={() => { avatarFailed(avatar) }} />
  }
  const letter = name?.trim().slice(0, 1)
  return letter ? <span className={css.letter} aria-hidden="true">{letter}</span> : <IconUserOutlineMedium size={16} />
}
