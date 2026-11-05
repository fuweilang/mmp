/**
 * Virtual root of the worker host's in-memory filesystem. Kept
 * in one module so the process shim, the path/os shims, and the VFS image
 * collector cannot drift apart.
 */

/** Virtual filesystem root; `process.cwd()` and every absolute path start here. */
export const MMP_ROOT = '/mmp'

/** `$MMP_HOME`: durable-state directory inside the image. */
export const MMP_HOME = `${MMP_ROOT}/home`

/** Flat, symlink-free package tree resolved by the worker module loader. */
export const MMP_NODE_MODULES = `${MMP_ROOT}/node_modules`

/** Image configuration directory: the VFS manifest and the shipped agent presets. */
export const MMP_CONFIG = `${MMP_ROOT}/config`

/** Default (empty) workspace directory. */
export const MMP_WORKSPACE = `${MMP_ROOT}/workspace`

/** Temporary directory reported by `os.tmpdir()`. */
export const MMP_TMP = `${MMP_ROOT}/tmp`
