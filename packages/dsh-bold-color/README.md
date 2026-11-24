# @local/dsh-bold-color

给 DSH 对话正文里的粗体上色，颜色在设置里自选。

## 它做了什么

对话正文由外壳按 Markdown 渲染，样式是 CSS Modules：`._markdown_xxx strong { font-weight: 600 }`。
粗体本身**没有颜色**，只是继承段落颜色。本插件在页面上追加一条规则：

```css
:root                          { --dsh-transcript-strong: var(--dsh-transcript-strong-light, #2f5cf6) }
body[data-ds-dark-theme]       { --dsh-transcript-strong: var(--dsh-transcript-strong-dark, #8fa6ff) }
[class*="_markdown_"] :is(strong, b) { color: var(--dsh-transcript-strong) }
```

浅色/深色主题各用一套颜色，由两条 `--dsh-transcript-strong-light` / `-dark` 变量驱动。

## 改颜色：设置 → 通用 → 「正文粗体颜色」

两个取色器（浅色主题 / 深色主题）+ 「恢复默认」。改完**立即生效**，不用刷新、不用重启：

- 颜色存在浏览器 `localStorage` 的 `dsh.bold-color.light` / `dsh.bold-color.dark`；
- 只接受 `#rrggbb` 形式的六位十六进制，其他值一律忽略并回退默认；
- `localStorage` 写不进去（隐私模式、配额满）时，当前会话仍然生效，只是下次打开不保留。

## 其他改法

- **临时试色**：开发者工具里直接覆盖 `--dsh-transcript-strong`，或改 `document.documentElement.style` 上的两个变量。
- **改默认值**：编辑 `client.js` 顶部的 `DEFAULT_LIGHT` / `DEFAULT_DARK`，然后在「设置 → 插件」里把 `bold-color` 关掉再打开（或刷新页面）。

## 为什么用 `class*="_markdown_"`

外壳构建后类名是 `_markdown_<hash>_<n>`，hash 每次构建都会变（当前是 `_markdown_rve47_5`）。
用类名前缀匹配可以扛住外壳升级；CSS Modules 的 hash 一旦变化，写死全名的规则会静默失效。

## 结构

| 文件 | 作用 |
|---|---|
| `index.js` | 宿主半侧，空实现——只为让 Loader 有一个条目来挂载客户端半侧 |
| `client.js` | 客户端半侧：内联 `<style>`、读写颜色、注册设置行 |
| `cordis.patch.yml` | 组合包 patch，插入 `bold-color` 条目 |

## 卸载

设置 → 插件 → 停用或移除；或 `dsh plugin --profile desktop remove @local/dsh-bold-color`。
