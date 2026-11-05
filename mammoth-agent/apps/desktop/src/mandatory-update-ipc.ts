/** Dependency-free IPC names shared with the sandboxed mandatory-update preload. */
export const MANDATORY_IPC = {
  status: 'mmp-desktop:mandatory-status', state: 'mmp-desktop:mandatory-state', action: 'mmp-desktop:mandatory-action',
} as const
