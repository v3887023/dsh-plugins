/**
 * Client half of the transcript bold-color bundle.
 *
 * The conversation body is rendered as Markdown by the shell and styled by a
 * CSS module: `._markdown_xxx strong { font-weight: 600 }` — bold has no color
 * of its own, it simply inherits the paragraph color. This bundle injects one
 * extra rule on top, mapping `<strong>` inside any Markdown body to a color
 * token, so `**bold**` becomes visually colored without touching the shell.
 *
 * Two colors are kept (light and dark theme) in `localStorage` and written to
 * `--dsh-transcript-strong-light` / `--dsh-transcript-strong-dark` on the root
 * element, so the rule below picks the one matching the active theme. The
 * Settings → General row edits those two values live, without a reload.
 *
 * The rule is keyed on the `_markdown_` class prefix rather than the full
 * hashed class (`_markdown_rve47_5`), because the hash changes whenever the
 * shell is rebuilt.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-bold-color',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState } = React

    const STYLE_ID = '@local/dsh-bold-color/transcript-strong.css'
    const ROW_ID = 'bold-color'
    const KEY_LIGHT = 'dsh.bold-color.light'
    const KEY_DARK = 'dsh.bold-color.dark'
    const DEFAULT_LIGHT = '#2f5cf6'
    const DEFAULT_DARK = '#8fa6ff'
    const HEX = /^#[0-9a-f]{6}$/i

    const CSS = [
      ':root{--dsh-transcript-strong:var(--dsh-transcript-strong-light,#2f5cf6)}',
      'body[data-ds-dark-theme]{--dsh-transcript-strong:var(--dsh-transcript-strong-dark,#8fa6ff)}',
      '[class*="_markdown_"] :is(strong,b){color:var(--dsh-transcript-strong)}',
    ].join('')

    /** Read a saved color, ignoring anything that is not a six-digit hex value. */
    function readColor(key, fallback) {
      try {
        const saved = window.localStorage.getItem(key)
        return typeof saved === 'string' && HEX.test(saved) ? saved : fallback
      } catch {
        return fallback
      }
    }

    /** Persist a color, tolerating storage being unavailable. */
    function writeColor(key, value) {
      try {
        window.localStorage.setItem(key, value)
      } catch {
        /* private mode or a full quota: the live value still applies */
      }
    }

    /** Forget one saved color. */
    function clearColor(key) {
      try {
        window.localStorage.removeItem(key)
      } catch {
        /* nothing to clear */
      }
    }

    /** Point the stylesheet at the saved colors. */
    function applyColors(light, dark) {
      const root = document.documentElement
      root.style.setProperty('--dsh-transcript-strong-light', light)
      root.style.setProperty('--dsh-transcript-strong-dark', dark)
    }

    /** Append the stylesheet once; returns its element. */
    function ensureStyle() {
      const selector = `style[data-plugin-css=${JSON.stringify(STYLE_ID)}]`
      const existing = document.querySelector(selector)
      if (existing !== null) return existing
      const tag = document.createElement('style')
      tag.dataset.plugin = '@local/dsh-bold-color'
      tag.dataset.pluginCss = STYLE_ID
      tag.textContent = CSS
      document.head.appendChild(tag)
      return tag
    }

    /** One colour input with its label. */
    function ColorField({ label, value, onChange }) {
      return h('label', {
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '13px',
          lineHeight: '20px',
          color: 'var(--dsw-alias-label-secondary)',
        },
      }, [
        h('input', {
          key: 'input',
          type: 'color',
          value,
          onChange,
          'aria-label': label,
          style: {
            width: '36px',
            height: '24px',
            padding: '0',
            border: '.5px solid var(--dsw-alias-border-l3)',
            borderRadius: '6px',
            background: 'none',
            cursor: 'pointer',
          },
        }),
        h('span', { key: 'label' }, label),
        h('code', {
          key: 'value',
          style: {
            fontSize: '12px',
            color: 'var(--dsw-alias-label-tertiary)',
            fontFamily: 'var(--ds-font-family-code)',
          },
        }, value),
      ])
    }

    /** Settings → General row: pick the bold color for each theme. */
    function BoldColorRow() {
      const [light, setLight] = useState(() => readColor(KEY_LIGHT, DEFAULT_LIGHT))
      const [dark, setDark] = useState(() => readColor(KEY_DARK, DEFAULT_DARK))

      const edit = (key, setter) => (event) => {
        const value = String(event.target.value || '')
        if (!HEX.test(value)) return
        setter(value)
        writeColor(key, value)
        applyColors(
          readColor(KEY_LIGHT, DEFAULT_LIGHT),
          readColor(KEY_DARK, DEFAULT_DARK),
        )
      }

      const reset = () => {
        clearColor(KEY_LIGHT)
        clearColor(KEY_DARK)
        setLight(DEFAULT_LIGHT)
        setDark(DEFAULT_DARK)
        applyColors(DEFAULT_LIGHT, DEFAULT_DARK)
      }

      return h('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '16px 0',
          borderBottom: '.5px solid var(--dsw-alias-border-l2)',
        },
      }, [
        h('div', {
          key: 'title',
          style: {
            color: 'var(--dsw-alias-label-primary)',
            fontSize: '14px',
            fontWeight: '400',
            lineHeight: '22px',
            margin: 0,
          },
        }, '正文粗体颜色'),
        h('div', {
          key: 'fields',
          style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px' },
        }, [
          h(ColorField, {
            key: 'light',
            label: '浅色主题',
            value: light,
            onChange: edit(KEY_LIGHT, setLight),
          }),
          h(ColorField, {
            key: 'dark',
            label: '深色主题',
            value: dark,
            onChange: edit(KEY_DARK, setDark),
          }),
          h('button', {
            key: 'reset',
            type: 'button',
            onClick: reset,
            style: {
              font: 'inherit',
              fontSize: '12px',
              lineHeight: '20px',
              padding: '2px 10px',
              color: 'var(--dsw-alias-label-secondary)',
              background: 'none',
              border: '.5px solid var(--dsw-alias-border-l3)',
              borderRadius: '6px',
              cursor: 'pointer',
            },
          }, '恢复默认'),
        ]),
      ])
    }

    /**
     * Mount the stylesheet, restore the saved colors, and add the settings row.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      ctx.effect(() => {
        const tag = ensureStyle()
        applyColors(
          readColor(KEY_LIGHT, DEFAULT_LIGHT),
          readColor(KEY_DARK, DEFAULT_DARK),
        )
        return () => {
          tag.remove()
          const root = document.documentElement
          root.style.removeProperty('--dsh-transcript-strong-light')
          root.style.removeProperty('--dsh-transcript-strong-dark')
        }
      }, 'bold-color: stylesheet and saved colors')

      ctx.slots.inject('settings.general.item', () => ctx.slots.register({
        name: 'settings.general.item',
        id: ROW_ID,
        order: 12,
      }, BoldColorRow))
    }

    return {
      name: 'bold-color',
      inject: ['slots'],
      apply,
    }
  },
})
