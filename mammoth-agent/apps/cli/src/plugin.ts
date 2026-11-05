/** Profile package management and explicit, exact-version compatibility approvals. */
import { runPluginCommand, runProfilePnpm, setProfileVersionExemption, type PackageOperationOptions } from '@mammoth-ai/mmp-plugin-manager/operations'
import { INSTALL_ANCHOR } from './profile-boot.ts'
import { initProfile, readProfileCompatibility, resolveProfileDir, type ProfileContext } from '@mammoth-ai/mmp-app-boot'
import { PROFILE_TEMPLATES, DEFAULT_PROFILE_BUNDLES } from '@mammoth-ai/mmp-official-bundles'
import { withFileLock } from '@mammoth-ai/mmp-atomic-write'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

function requireDesktopProfile(dir: string): void {
  if (!existsSync(join(dir, 'package.json'))) {
    throw new Error('Open 猛犸智能体 Desktop once to initialize its profile, then fully quit it before running mmp plugin --profile desktop.')
  }
}

/** Parse only MMP-owned commands; all other arguments remain pnpm's responsibility. */
async function versionCommand(profile: string, args: readonly string[]): Promise<number | undefined> {
  const [command, ...rest] = args
  if (command !== 'allow-version' && command !== 'revoke-version' && command !== 'version-exemptions') return undefined
  try {
    let packageVersion: string | undefined
    let runtimeVersion: string | undefined
    let acceptRisk = false
    const argumentsIterator = rest.values()
    for (const argument of argumentsIterator) {
      if (argument === '--accept-risk' && command === 'allow-version' && !acceptRisk) acceptRisk = true
      else if (argument === '--mmp-version' && runtimeVersion === undefined) runtimeVersion = argumentsIterator.next().value
      else if (argument.startsWith('--mmp-version=') && runtimeVersion === undefined) runtimeVersion = argument.slice('--mmp-version='.length)
      else if (!argument.startsWith('-') && packageVersion === undefined) packageVersion = argument
      else throw new Error(`unexpected argument ${JSON.stringify(argument)}`)
    }
    if (command === 'version-exemptions' && rest.length > 0) throw new Error('usage: mmp plugin version-exemptions')
    let request: { packageVersion: string; runtimeVersion: string } | undefined
    if (command !== 'version-exemptions') {
      if (packageVersion === undefined || runtimeVersion === undefined) {
        throw new Error(`usage: mmp plugin ${command} <package@version> --mmp-version <exact>${command === 'allow-version' ? ' --accept-risk' : ''}`)
      }
      request = { packageVersion, runtimeVersion }
    }
    if (command === 'allow-version') {
      process.stderr.write('mmp: warning: allowing incompatible plugin versions can break the application or corrupt data. Approval applies only to the exact package and MMP versions.\n')
    }
    const dir = resolveProfileDir(profile)
    if (profile !== 'desktop') await mkdir(dir, { recursive: true })
    await withFileLock(join(dir, 'package.json'), async () => {
      if (profile === 'desktop') requireDesktopProfile(dir)
      else if (!existsSync(join(dir, 'package.json'))) initProfile(dir, PROFILE_TEMPLATES[profile]?.bundles ?? DEFAULT_PROFILE_BUNDLES)
      if (request === undefined) {
        const { exemptions, warnings } = readProfileCompatibility(dir)
        for (const warning of warnings) process.stderr.write(`mmp: warning: ${warning}\n`)
        process.stdout.write(JSON.stringify(exemptions, undefined, 2) + '\n')
      } else {
        await setProfileVersionExemption(dir, request.packageVersion, request.runtimeVersion, command === 'allow-version', acceptRisk)
        process.stdout.write(`mmp: ${command === 'allow-version' ? 'allowed' : 'revoked'} ${request.packageVersion} for MMP ${request.runtimeVersion}\n`)
      }
    }, { waitMs: 120000 })
    return 0
  } catch (error) {
    process.stderr.write(`mmp: ${String(error)}\n`)
    return 1
  }
}

/** Run package management for a profile.
 * @param profile Profile name; Desktop's reserved profile must already be initialized by the application.
 * @param args MMP exemption command or pnpm arguments relative to the invoking directory.
 * @param packageManager Installation-owned executable and environment for pnpm operations.
 * @returns Zero on success; nonzero on invalid approval or package-manager failure.
 */
export async function runPlugin(profile: string, args: readonly string[], packageManager?: ProfileContext['packageManager']): Promise<number> {
  if (profile === 'desktop') {
    try { requireDesktopProfile(resolveProfileDir(profile)) } catch (error) {
      process.stderr.write(`mmp: ${String(error)}\n`)
      return 1
    }
  }
  const versionResult = await versionCommand(profile, args)
  if (versionResult !== undefined) return versionResult
  const dir = resolveProfileDir(profile)
  if (existsSync(join(dir, 'package.json'))) {
    for (const warning of readProfileCompatibility(dir).warnings) process.stderr.write(`mmp: warning: ${warning}\n`)
  }
  const context = { profile, dir, installAnchor: INSTALL_ANCHOR, cwd: process.cwd() }
  const options: PackageOperationOptions = {
    ...packageManager,
    execution: 'cli',
    outputBytes: 16384,
    lockWaitMs: 120000,
    lookupTimeoutMs: 120000,
    onOutput: (text, stream) => { process[stream].write(text) },
  }
  const result = profile === 'desktop'
    ? await withFileLock(join(dir, 'package.json'), async () => {
      requireDesktopProfile(dir)
      return runProfilePnpm(context, args, options)
    }, { waitMs: 120000 })
    : await runPluginCommand(context, args, options)
  if (result.exitCode === 127) process.stderr.write('mmp: pnpm was not found; install pnpm and make it available on PATH.\n')
  for (const { name, version, runtimeVersion } of result.incompatible ?? []) {
    process.stderr.write(`mmp: to accept the risk, run: mmp plugin --profile ${profile} allow-version ${name}@${version} --mmp-version ${runtimeVersion} --accept-risk\n`)
  }
  if (result.exitCode !== 0) process.stderr.write(`mmp: plugin command failed; diagnostics: ${result.logPath}\n`)
  if (result.exitCode !== 0 && args.some(argument => /^git\+|^github:|\.git(?:#|$)/.test(argument))) {
    process.stderr.write(`mmp: git-hosted plugins build on install via their prepare script, which pnpm blocks until allowed — add the exact key pnpm printed above under allowBuilds in ${join(resolveProfileDir(profile), 'pnpm-workspace.yaml')}, then re-run\n`)
  }
  return result.exitCode
}
