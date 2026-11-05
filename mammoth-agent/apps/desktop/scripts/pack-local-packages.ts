/** Stage local-branded MMP packages for unsigned Desktop builds without a publication record. */

import { globSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import {
  readClientBuildRecord,
  repositoryClientBuildEnvironment,
  resolveClientBuildEnvironment,
} from '../../../scripts/client-build-environment.ts'
import { releaseFamily } from '../../../scripts/release/families.ts'
import { packFamilyMembers, parsePackConcurrency } from '../../../scripts/release/pack.ts'

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { out: { type: 'string' }, concurrency: { type: 'string' } },
    allowPositionals: false,
  })
  if (values.out === undefined) throw new Error('desktop local pack: --out must name the package staging directory')
  const concurrency = parsePackConcurrency(values.concurrency)
  const root = process.cwd()
  const environment = resolveClientBuildEnvironment(repositoryClientBuildEnvironment(root), 'local')
  readClientBuildRecord(root, environment)
  const destination = resolve(root, values.out)
  // Published bundles may depend on a private package the local product keeps in the workspace,
  // for example the branded Ground adapter. Publication still omits it, but the unsigned Desktop
  // package set cannot resolve the bundle's dependency graph without its tarball.
  const includePrivate = globSync('packages/*/*/package.json', { cwd: root })
    .filter(path => (JSON.parse(readFileSync(join(root, path), 'utf8')) as { private?: unknown }).private === true)
    .map(path => dirname(path).replaceAll('\\', '/'))
  const packed = await packFamilyMembers(root, releaseFamily('mmp'), destination, concurrency, { includePrivate })
  console.log(`desktop local pack: ${String(packed.length)} tarball(s) in ${destination}`)
}

await main()
