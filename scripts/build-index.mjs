#!/usr/bin/env node
/**
 * Rebuild dsh-index.json from packages/.
 *
 *   node scripts/build-index.mjs
 *
 * A package already present in the index keeps its recorded versions; a new one
 * starts at its package.json version pinned to the current commit. Titles follow
 * the directory name and icons are picked up when the package ships an icon.svg.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGES = path.join(ROOT, 'packages')
const INDEX_FILE = path.join(ROOT, 'dsh-index.json')
const REPOSITORY = 'https://github.com/v3887023/dsh-plugins'

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
const now = Math.floor(Date.now() / 1000)
const previous = fs.existsSync(INDEX_FILE) ? JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')) : { plugins: [] }
const existing = new Map(previous.plugins.map((plugin) => [plugin.name, plugin]))

const descriptions = {
  'dsh-session-split': { en: 'Split the main area into side-by-side live Session panes.', zh: '把主区域分成并排的多个实时会话窗格。' },
  'dsh-desktop-notify': { en: 'Desktop notifications when a Session finishes.', zh: '会话完成时发送桌面通知。' },
  'dsh-noir-skin': { en: 'Graphite and champagne theme.', zh: '墨金（石墨 + 香槟金）外观主题。' },
  'dsh-session-date-groups': { en: 'Group the sidebar Session list by day.', zh: '侧栏会话按日期分组。' },
  'dsh-session-sort-lock': { en: 'Keep the sidebar order stable.', zh: '固定侧栏会话顺序。' },
  'dsh-workspace-drop': { en: 'Drop files into the workspace.', zh: '把文件拖进工作区。' },
  'dsh-session-reference': { en: 'Reference a Session into the current conversation.', zh: '把某个会话引用到当前对话。' },
  'dsh-deepseek-balance': { en: 'Show the DeepSeek account balance.', zh: '显示 DeepSeek 账户余额。' },
  'dsh-litellm-usage': { en: 'Show LiteLLM proxy usage (configure your own URL and key).', zh: '显示 LiteLLM 代理用量（自配地址与密钥）。' },
}

const plugins = fs.readdirSync(PACKAGES)
  .filter((name) => fs.statSync(path.join(PACKAGES, name)).isDirectory())
  .sort()
  .map((dir) => {
    const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGES, dir, 'package.json'), 'utf8'))
    const old = existing.get(pkg.name)
    const description = descriptions[dir] ?? { en: dir, zh: dir }
    const plugin = {
      name: pkg.name,
      title: dir,
      description: old?.description ?? description,
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
