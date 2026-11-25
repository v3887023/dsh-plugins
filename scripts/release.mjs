#!/usr/bin/env node
/**
 * Release one plugin of this collection.
 *
 *   node scripts/release.mjs <package-dir> <version> [--dry-run]
 *
 * Checks the package is publishable, bumps its version, commits and tags it,
 * then points the index at the new commit so DSH's Discover tab offers the
 * update. Run from anywhere inside this repository.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCOPE = '@v3887023'
const INDEX_FILE = path.join(ROOT, 'dsh-index.json')
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/

const [, , dirName, newVersion, ...flags] = process.argv
const dryRun = flags.includes('--dry-run')
const syncAt = flags.indexOf('--sync-from')
const syncFrom = syncAt >= 0 ? flags[syncAt + 1] : undefined
if (syncAt >= 0 && syncFrom === undefined) fail('--sync-from needs a source package directory')

function fail(message) {
  console.error('error: ' + message)
  process.exit(1)
}

function git(args, options = {}) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: options.quiet ? 'pipe' : 'inherit', ...options }).trim()
}

if (!dirName || !newVersion) fail('usage: node scripts/release.mjs <package-dir> <version> [--sync-from <dir>] [--dry-run]')
if (!SEMVER.test(newVersion)) fail(`"${newVersion}" is not an exact SemVer version`)

const packageDir = path.join(ROOT, 'packages', dirName)

// The published copy mirrors a package maintained in the workspace repository:
// copy it over and re-scope its name before the checks below.
if (syncFrom !== undefined) {
  if (!fs.existsSync(path.join(syncFrom, 'package.json'))) fail(`no package at ${syncFrom}`)
  if (dryRun) {
    console.log(`would sync ${syncFrom} -> ${packageDir}`)
  }
  else {
    fs.rmSync(packageDir, { recursive: true, force: true })
    fs.cpSync(syncFrom, packageDir, {
      recursive: true,
      filter: (source) => !/[\\/](?:node_modules|\.git)(?:[\\/]|$)/.test(source),
    })
    const syncedPath = path.join(packageDir, 'package.json')
    const synced = JSON.parse(fs.readFileSync(syncedPath, 'utf8'))
    const previousName = synced.name
    synced.name = `${SCOPE}/${dirName}`
    fs.writeFileSync(syncedPath, JSON.stringify(synced, null, 2) + '\n')
    const syncedPatch = path.join(packageDir, 'cordis.patch.yml')
    if (fs.existsSync(syncedPatch)) {
      fs.writeFileSync(syncedPatch, fs.readFileSync(syncedPatch, 'utf8').split(previousName).join(synced.name))
    }
    console.log(`synced ${syncFrom} -> ${packageDir} (${previousName} -> ${synced.name})`)
  }
}

if (!fs.existsSync(packageDir)) fail(`no package directory ${packageDir}`)

const pkgPath = path.join(packageDir, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
const expectedName = `${SCOPE}/${dirName}`
if (pkg.name !== expectedName) fail(`package name is ${pkg.name}, expected ${expectedName}`)

const patchPath = path.join(packageDir, 'cordis.patch.yml')
if (fs.existsSync(patchPath)) {
  const patchName = /name:\s*['"]?([^'"\n]+)['"]?/.exec(fs.readFileSync(patchPath, 'utf8'))?.[1]?.trim()
  if (patchName !== pkg.name) fail(`cordis.patch.yml names ${patchName}, package.json names ${pkg.name}`)
}

for (const [name, range] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
  if (/^(link:|file:|workspace:|\.\.|\/|[A-Za-z]:\\)/.test(String(range))) fail(`dependency ${name}=${range} points at a local path`)
}

const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'))
const plugin = index.plugins.find((entry) => entry.name === pkg.name)
if (plugin === undefined) fail(`index has no entry for ${pkg.name}`)
if (plugin.versions.some((version) => version.version === newVersion)) fail(`${newVersion} is already in the index`)

const tag = `${dirName}@${newVersion}`
console.log(`releasing ${pkg.name} ${pkg.version} -> ${newVersion} (tag ${tag})`)
if (dryRun) {
  console.log('dry run: checks passed, nothing was written')
  process.exit(0)
}

pkg.version = newVersion
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

const status = git(['status', '--porcelain'], { quiet: true })
if (status !== '') {
  console.log('committing unrelated changes first:')
  console.log(status)
  git(['add', '-A'])
  git(['commit', '-m', 'Release ' + dirName + ' ' + newVersion])
}
else {
  git(['commit', '--allow-empty', '-m', 'Release ' + dirName + ' ' + newVersion])
}

const commit = git(['rev-parse', 'HEAD'], { quiet: true })
git(['tag', tag])
git(['push', 'origin', 'HEAD'])
git(['push', 'origin', tag])

plugin.versions = [
  {
    version: newVersion,
    publishTimestamp: Math.floor(Date.now() / 1000),
    source: { type: 'git', url: 'https://github.com/v3887023/dsh-plugins', commit, path: 'packages/' + dirName },
  },
  ...plugin.versions,
]
plugin.title = dirName
fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2) + '\n')
git(['add', INDEX_FILE])
git(['commit', '-m', 'Index ' + dirName + ' ' + newVersion])
git(['push', 'origin', 'HEAD'])

try {
  execFileSync('gh', ['release', 'create', tag, '--repo', 'v3887023/dsh-plugins', '--title', `${dirName} ${newVersion}`, '--notes', `Release ${dirName} ${newVersion}.`], { cwd: ROOT, stdio: 'inherit' })
}
catch {
  console.warn('warning: gh release failed (the tag and index are already pushed)')
}

console.log(`done: ${pkg.name} ${newVersion} published as ${commit.slice(0, 7)}`)
