#!/usr/bin/env node
/**
 * Rebuild dsh-index.json from packages/.
 *
 *   node scripts/build-index.mjs
 *
 * A package already present in the index keeps its recorded versions; a new one
 * starts at its package.json version pinned to the current commit. Titles follow
 * the directory name and icons are picked up when the package ships an icon.svg.
 *
 * A retired package keeps its directory, tags, and git history but is left out of
 * the index, so Discover cannot offer two bundles that own the same feature.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGES = path.join(ROOT, 'packages')
const INDEX_FILE = path.join(ROOT, 'dsh-index.json')
const REPOSITORY = 'https://github.com/v3887023/dsh-plugins'

/**
 * Packages replaced by another bundle in this repository.
 *
 * Their feature moved into `dsh-session-drag`; listing them again would let a
 * user install both halves and end up with a duplicated menu row and two drag
 * handlers over the same events. The directories stay so their released commits
 * and tags remain resolvable.
 */
const RETIRED = new Set([
  'dsh-session-reference',
  'dsh-session-sort-lock',
])

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
const now = Math.floor(Date.now() / 1000)
const previous = fs.existsSync(INDEX_FILE) ? JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')) : { plugins: [] }
const existing = new Map(previous.plugins.map((plugin) => [plugin.name, plugin]))

const descriptions = {
  'dsh-session-split': { en: 'Split the main area into side-by-side live Session panes.', zh: '把主区域分成并排的多个实时会话窗格。' },
  'dsh-desktop-notify': { en: 'Desktop notifications when a Session finishes.', zh: '会话完成时发送桌面通知。' },
  'dsh-noir-skin': { en: 'Graphite and champagne theme.', zh: '墨金（石墨 + 香槟金）外观主题。' },
  'dsh-session-date-groups': { en: 'Group the sidebar Session list by day.', zh: '侧栏会话按日期分组。' },
  'dsh-session-drag': { en: 'Drag a Session to reference it; keep the “Last updated” order.', zh: '拖动会话即可引用它；锁定「最近更新」排序。' },
  'dsh-workspace-drop': { en: 'Drop files into the workspace.', zh: '把文件拖进工作区。' },
  'dsh-deepseek-balance': { en: 'Show the DeepSeek account balance.', zh: '显示 DeepSeek 账户余额。' },
  'dsh-litellm-usage': { en: 'Show LiteLLM proxy usage (configure your own URL and key).', zh: '显示 LiteLLM 代理用量（自配地址与密钥）。' },
}

const plugins = fs.readdirSync(PACKAGES)
  .filter((name) => fs.statSync(path.join(PACKAGES, name)).isDirectory())
  .filter((name) => !RETIRED.has(name))
  .sort()
  .map((dir) => {
    const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGES, dir, 'package.json'), 'utf8'))
    const old = existing.get(pkg.name)
    const description = descriptions[dir] ?? { en: dir, zh: dir }
    const plugin = {
      name: pkg.name,
      title: dir,
      // The table above is the single source for descriptions, so editing a
      // package's one-liner does not require hand-editing the index.
      description,
      homepage: REPOSITORY + '/tree/main/packages/' + dir,
      versions: old?.versions ?? [{
        version: pkg.version,
        publishTimestamp: now,
        source: { type: 'git', url: REPOSITORY, commit, path: 'packages/' + dir },
      }],
    }
    if (fs.existsSync(path.join(PACKAGES, dir, 'icon.svg'))) plugin.icon = 'packages/' + dir + '/icon.svg'
    return plugin
  })

const index = {
  format: 1,
  title: previous.title ?? { en: "v3887023's DSH plugins", zh: 'v3887023 的 DSH 插件' },
  description: previous.description ?? { en: 'DeepSeek Harness plugins published by v3887023.', zh: 'v3887023 发布的 DeepSeek Harness 插件集合。' },
  plugins,
}
fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2) + '\n')
console.log(plugins.map((plugin) => `${plugin.name}@${plugin.versions[0].version}`).join('\n'))
