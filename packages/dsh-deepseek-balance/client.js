/**
 * Client half of the DeepSeek balance bundle.
 *
 * Renders a compact balance card at the sidebar foot (`sidebar.footer.action`),
 * directly above the LiteLLM usage card (`order` 10 < 20). The headline is the
 * remaining share of a fixed baseline; pointing at the card, or focusing it,
 * shows the full breakdown in a floating popup anchored above it.
 *
 * All upstream access happens on the Host; this module reads one same-origin
 * JSON route and never handles the official API key.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-deepseek-balance',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NAMESPACE = 'deepseekBalance'
    const ROUTE = '/deepseek-balance'
    const REFRESH_MS = 60000
    const RETRY_DELAY_MS = 2500
    const RETRY_LIMIT = 5
    const HIDE_DELAY_MS = 120
    const HOVER_REFRESH_MS = 5000

    /** Copy for this surface; also handed to the host locale registry. */
    const MESSAGES = {
      zh: {
        'chip.label': 'DeepSeek 余额',
        'card.remainingLabel': 'DeepSeek 余额',
        'card.sub': '{total} / {baseline}',
        'card.error': '余额不可用',
        'card.never': '尚未读取',
        'card.refresh': '刷新',
        'card.updated': '更新于',
        'card.baseline': '基准余额',
        'card.current': '当前余额',
        'card.used': '已消耗',
        'card.toppedUp': '充值余额',
        'card.granted': '赠金余额',
        'card.currency': '币种',
        'card.currencyMismatch': '余额币种 {currency} 与基准 {baselineCurrency} 不一致，不显示百分比。',
      },
      en: {
        'chip.label': 'DeepSeek balance',
        'card.remainingLabel': 'DeepSeek balance',
        'card.sub': '{total} / {baseline}',
        'card.error': 'Balance unavailable',
        'card.never': 'Not read yet',
        'card.refresh': 'Refresh',
        'card.updated': 'Updated',
        'card.baseline': 'Baseline',
        'card.current': 'Balance',
        'card.used': 'Used',
        'card.toppedUp': 'Topped up',
        'card.granted': 'Granted',
        'card.currency': 'Currency',
        'card.currencyMismatch': 'Balance currency {currency} differs from the {baselineCurrency} baseline, so no percentage is shown.',
      },
    }

    const CSS = `
.dsb-entry{box-sizing:border-box;position:relative;display:block;width:100%;min-width:0}
.dsb-card{box-sizing:border-box;display:flex;flex-direction:column;gap:2px;justify-content:center;flex:1 1 auto;width:100%;min-width:0;padding:6px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:400 12px/16px inherit;cursor:default;text-align:left}
.dsb-card{transition:background-color .12s ease,border-color .12s ease}
.dsb-card.is-open{border-color:var(--dsw-alias-border-l2)}
@media (hover:hover){.dsb-card:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}}
.dsb-card:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dsb-line{display:flex;align-items:baseline;gap:4px;min-width:0;overflow:hidden}
.dsb-label{color:var(--dsw-alias-label-secondary);flex:none}
.dsb-percent{margin-left:auto;color:var(--dsw-alias-label-primary);font-weight:600;font-size:13px;line-height:18px;font-variant-numeric:tabular-nums;white-space:nowrap;flex:none}
.dsb-sub{text-align:right;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsb-bar{position:relative;height:4px;border-radius:999px;background:var(--dsw-alias-bg-base);box-shadow:0 0 0 1px var(--dsw-alias-border-l2);overflow:hidden}
.dsb-card .dsb-bar{margin-top:6px}
.dsb-popup .dsb-bar{margin-bottom:8px}
.dsb-bar-fill{position:absolute;inset:0 auto 0 0;border-radius:999px;background:var(--dsw-alias-label-secondary);opacity:.9;min-width:2px}
.dsb-bar-fill.is-warn{background:var(--dsw-alias-state-warn-primary)}
.dsb-bar-fill.is-error{background:var(--dsw-alias-state-error-primary)}
.dsb-popup{position:absolute;left:0;right:0;bottom:calc(100% + 8px);z-index:30;box-sizing:border-box;padding:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 12px 32px rgba(0,0,0,.28);font:400 12px/18px inherit}
.dsb-head{display:flex;align-items:center;gap:6px;margin-bottom:8px}
.dsb-head-percent{margin-left:auto;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;font-variant-numeric:tabular-nums;white-space:nowrap}
@keyframes dsb-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
.dsb-icon-button.is-spinning svg{animation:dsb-spin .9s linear infinite}
.dsb-title{font-weight:600;flex:none}
.dsb-icon-button{flex:none;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
@media (hover:hover){.dsb-icon-button:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}}
.dsb-rows{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:0}
.dsb-rows dt{margin:0;color:var(--dsw-alias-label-secondary)}
.dsb-rows dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}
.dsb-foot{display:flex;justify-content:space-between;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}
.dsb-error{margin:0 0 8px;color:var(--dsw-alias-state-error-primary)}
.dsb-note{margin:0;color:var(--dsw-alias-label-secondary)}
`

    const SYMBOLS = { CNY: '¥', USD: 'US$' }

    function symbol(currency) {
      return SYMBOLS[String(currency ?? '').toUpperCase()] ?? ''
    }

    /** Money with grouped thousands and two decimals; never drops the currency. */
    function money(value, currency) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
      const digits = Math.abs(value) > 0 && Math.abs(value) < 0.01 ? 4 : 2
      const text = value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
      return `${symbol(currency)}${text}`
    }

    function percent(ratio) {
      if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return '—'
      if (ratio > 0 && ratio < 0.00005) return '<0.01%'
      return `${(ratio * 100).toFixed(2)}%`
    }

    function clock(epochMs) {
      if (typeof epochMs !== 'number' || !Number.isFinite(epochMs) || epochMs <= 0) return ''
      const date = new Date(epochMs)
      const pad = n => String(n).padStart(2, '0')
      return `${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    function barClass(ratio) {
      if (ratio === null) return ''
      if (ratio <= 0.1) return ' is-error'
      if (ratio <= 0.3) return ' is-warn'
      return ''
    }

    /** One shared observable holding the balance snapshot and popup state. */
    function createBalance() {
      const listeners = new Set()
      let state = { phase: 'loading', payload: null, attempts: [], hover: false }
      let timer = null
      let retryTimer = null
      let hideTimer = null
      let retries = 0
      let lastLoadAt = 0

      function publish(next) {
        state = { ...state, ...next }
        for (const listener of [...listeners]) listener()
      }

      function candidates() {
        const seen = new Set()
        const list = []
        const add = (value) => {
          if (typeof value !== 'string' || value.length === 0 || seen.has(value)) return
          seen.add(value)
          list.push(value)
        }
        add(ROUTE)
        const transport = window.__DSH_TRANSPORT__
        const base = transport && (transport.streamBaseUrl || transport.httpBaseUrl)
        if (typeof base === 'string' && base.length > 0) {
          try { add(new URL(ROUTE, base).toString()) } catch { /* ignore a bad transport base */ }
        }
        return list
      }

      async function readOne(url, fresh) {
        const target = fresh === true ? `${url}${url.includes('?') ? '&' : '?'}fresh=1` : url
        const response = await fetch(target, { headers: { accept: 'application/json' }, cache: 'no-store' })
        const text = await response.text()
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        try {
          return JSON.parse(text)
        } catch {
          throw new Error('响应不是 JSON')
        }
      }

      async function load(fresh = false) {
        if (state.phase === 'refreshing') return
        lastLoadAt = Date.now()
        publish({ phase: state.payload === null ? 'loading' : 'refreshing' })
        const attempts = []
        for (const target of candidates()) {
          try {
            const payload = await readOne(target, fresh)
            retries = 0
            publish({ phase: 'ready', payload, attempts })
            return
          } catch (error) {
            attempts.push(error instanceof Error ? error.message : String(error))
          }
        }
        publish({ phase: 'error', attempts, payload: { ok: false, code: 'CLIENT', message: attempts.join(' | ') } })
        // The first paint can outrun the Host carrier, so retry a few times
        // before settling into the steady refresh interval.
        if (retries < RETRY_LIMIT) {
          retries += 1
          if (retryTimer !== null) clearTimeout(retryTimer)
          retryTimer = setTimeout(() => {
            retryTimer = null
            load()
          }, RETRY_DELAY_MS)
        }
      }

      return {
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        snapshot() {
          return state
        },
        start() {
          if (timer !== null) return
          load()
          timer = setInterval(load, REFRESH_MS)
        },
        stop() {
          if (retryTimer !== null) {
            clearTimeout(retryTimer)
            retryTimer = null
          }
          if (hideTimer !== null) {
            clearTimeout(hideTimer)
            hideTimer = null
          }
          if (timer === null) return
          clearInterval(timer)
          timer = null
        },
        pointerEnter() {
          if (hideTimer !== null) {
            clearTimeout(hideTimer)
            hideTimer = null
          }
          if (!state.hover) publish({ hover: true })
          if (Date.now() - lastLoadAt > HOVER_REFRESH_MS) load(true)
        },
        pointerLeave() {
          if (hideTimer !== null) clearTimeout(hideTimer)
          hideTimer = setTimeout(() => {
            hideTimer = null
            if (state.hover) publish({ hover: false })
          }, HIDE_DELAY_MS)
        },
        refresh() {
          load(true)
        },
      }
    }

    function useSnapshot(store) {
      const [snapshot, setSnapshot] = React.useState(store.snapshot())
      React.useEffect(() => {
        setSnapshot(store.snapshot())
        return store.subscribe(() => setSnapshot(store.snapshot()))
      }, [store])
      return snapshot
    }

    /** Host dictionary when the locale service knows this namespace, own copy otherwise. */
    function useTranslate(ctx) {
      const locale = ctx.get('locale')
      const [, setRevision] = React.useState(0)
      React.useEffect(() => {
        if (locale === undefined || locale === null || typeof locale.subscribe !== 'function') return undefined
        return locale.subscribe(() => setRevision(value => value + 1))
      }, [locale])

      const active = locale !== undefined && locale !== null && typeof locale.getSnapshot === 'function'
        ? String(locale.getSnapshot().active ?? '')
        : ''
      const dictionary = active.toLowerCase().startsWith('zh') ? MESSAGES.zh : MESSAGES.en
      let bound = null
      if (locale !== undefined && locale !== null && typeof locale.bind === 'function') {
        try {
          bound = locale.bind(NAMESPACE)
        } catch {
          bound = null
        }
      }

      return (key, params) => {
        const fallback = dictionary[key] ?? MESSAGES.en[key] ?? key
        let template = fallback
        if (bound !== null) {
          const value = bound(key)
          if (typeof value === 'string' && value.length > 0 && value !== key) template = value
        }
        if (params === undefined || params === null) return template
        return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
      }
    }

    /** Shared read of the payload into the numbers the card and popup render. */
    function view(payload) {
      const ok = payload !== null && payload !== undefined && payload.ok === true
      const total = ok && typeof payload.total === 'number' ? payload.total : null
      const baseline = ok && typeof payload.baseline === 'number' ? payload.baseline : null
      const currency = ok && typeof payload.currency === 'string' ? payload.currency : null
      const ratio = total !== null && baseline !== null && baseline > 0 ? total / baseline : null
      const used = total !== null && baseline !== null ? baseline - total : null
      return { ok, total, baseline, currency, ratio, used }
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const store = createBalance()

        ctx.effect(() => {
          const element = document.createElement('style')
          element.dataset.dshDeepseekBalance = ''
          element.textContent = CSS
          document.head.appendChild(element)
          return () => element.remove()
        }, 'deepseek-balance: styles')

        ctx.effect(() => {
          const locale = ctx.get('locale')
          if (locale === undefined || locale === null || typeof locale.register !== 'function') return undefined
          return locale.register(NAMESPACE, MESSAGES)
        }, 'deepseek-balance: dictionaries')

        function Popup({ t, payload, ratio, busy }) {
          const { ok, total, baseline, currency, used } = view(payload)
          const granted = ok && typeof payload.granted === 'number' ? payload.granted : null
          const toppedUp = ok && typeof payload.toppedUp === 'number' ? payload.toppedUp : null
          const mismatch = ok && payload.baselineCurrencyMismatch === true
          const [requested, setRequested] = React.useState(0)
          const [floorElapsed, setFloorElapsed] = React.useState(true)

          React.useEffect(() => {
            if (requested === 0 || floorElapsed) return undefined
            const timer = setTimeout(() => setFloorElapsed(true), 400)
            return () => clearTimeout(timer)
          }, [requested, floorElapsed])

          const spinning = requested !== 0 && (busy === true || floorElapsed === false)

          React.useEffect(() => {
            if (requested !== 0 && !spinning) {
              setRequested(0)
              setFloorElapsed(true)
            }
          }, [requested, spinning])

          const rows = []
          if (ok) {
            if (baseline !== null) rows.push([t('card.baseline'), money(baseline, currency)])
            rows.push([t('card.current'), money(total, currency)])
            if (used !== null) rows.push([t('card.used'), money(used, currency)])
            if (toppedUp !== null) rows.push([t('card.toppedUp'), money(toppedUp, currency)])
            if (granted !== null && granted > 0) rows.push([t('card.granted'), money(granted, currency)])
          }

          return h('div', {
            className: 'dsb-popup',
            role: 'dialog',
            'aria-label': t('chip.label'),
            onMouseEnter: () => store.pointerEnter(),
            onMouseLeave: () => store.pointerLeave(),
          }, [
            h('div', { key: 'head', className: 'dsb-head' }, [
              h('span', { key: 'title', className: 'dsb-title' }, t('chip.label')),
              h('span', { key: 'percent', className: 'dsb-head-percent' }, percent(ratio)),
              h('button', {
                key: 'refresh',
                type: 'button',
                className: `dsb-icon-button${spinning ? ' is-spinning' : ''}`,
                title: t('card.refresh'),
                'aria-label': t('card.refresh'),
                'aria-busy': spinning,
                onClick: (event) => {
                  event.stopPropagation()
                  setRequested(Date.now())
                  setFloorElapsed(false)
                  store.refresh()
                },
              }, h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': 'true' }, [
                h('path', { key: 'a', d: 'M2 8a6 6 0 0 1 6-6 6.5 6.5 0 0 1 4.49 1.83L14 5.33', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
                h('path', { key: 'ah', d: 'M14 2v3.33h-3.33', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
                h('path', { key: 'b', d: 'M14 8a6 6 0 0 1-6 6 6.5 6.5 0 0 1-4.49-1.83L2 10.67', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
                h('path', { key: 'bh', d: 'M5.33 10.67H2V14', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
              ])),
            ]),
            !ok && payload !== null ? h('p', { key: 'error', className: 'dsb-error' }, payload.message) : null,
            ok && ratio !== null
              ? h('div', { key: 'bar', className: 'dsb-bar' }, h('div', {
                className: `dsb-bar-fill${barClass(ratio)}`,
                style: { width: `${Math.max(1, ratio * 100)}%` },
              }))
              : null,
            ok
              ? h('dl', { key: 'rows', className: 'dsb-rows', style: { marginTop: '8px' } }, rows.flatMap(([term, value]) => [
                h('dt', { key: `t-${term}` }, term),
                h('dd', { key: `d-${term}` }, value),
              ]))
              : null,
            mismatch ? h('p', { key: 'mismatch', className: 'dsb-note', style: { marginTop: '6px' } }, t('card.currencyMismatch', { currency, baselineCurrency: payload.baselineCurrency })) : null,
            !ok && payload === null ? h('p', { key: 'note', className: 'dsb-note' }, t('card.never')) : null,
            h('div', { key: 'foot', className: 'dsb-foot' }, [
              h('span', { key: 'currency' }, ok && currency !== null ? `${currency}${payload.isAvailable === true ? '' : ' · ⚠︎'}` : ''),
              h('span', { key: 'updated' }, payload !== null && payload.fetchedAt ? `${t('card.updated')} ${clock(payload.fetchedAt)}` : t('card.never')),
            ]),
          ])
        }

        function Entry() {
          const snapshot = useSnapshot(store)
          const t = useTranslate(ctx)
          const rootRef = React.useRef(null)

          React.useEffect(() => {
            store.start()
            return () => store.stop()
          }, [])

          /**
           * The sidebar foot renders its actions in one flex row; the LiteLLM
           * card normally turns that row into a single-column grid already.
           * This effect only converts it when it is still a flex row, so both
           * cards stack without fighting over the container.
           */
          React.useEffect(() => {
            const entry = rootRef.current
            if (entry === null || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return undefined
            let node = entry.parentElement
            while (node !== null && node !== document.body) {
              const display = window.getComputedStyle(node).display
              if (display === 'flex' || display === 'inline-flex' || display === 'grid') break
              node = node.parentElement
            }
            if (node === null || node === document.body) return undefined
            const style = window.getComputedStyle(node)
            if (style.display === 'grid') return undefined
            if (style.flexDirection !== 'row' && style.flexDirection !== 'row-reverse') return undefined
            const saved = { display: node.style.display, rowGap: node.style.rowGap, alignContent: node.style.alignContent, alignItems: node.style.alignItems, columns: node.style.gridTemplateColumns }
            node.style.display = 'grid'
            node.style.gridTemplateColumns = 'minmax(0, 1fr)'
            node.style.rowGap = '4px'
            node.style.alignContent = 'start'
            node.style.alignItems = 'start'
            return () => {
              node.style.display = saved.display
              node.style.rowGap = saved.rowGap
              node.style.alignContent = saved.alignContent
              node.style.alignItems = saved.alignItems
              node.style.gridTemplateColumns = saved.columns
            }
          }, [])

          const payload = snapshot.payload
          const { ok, total, baseline, currency, ratio } = view(payload)
          const open = snapshot.hover
          const warning = payload !== null && !ok
          // Without a baseline (or on a currency mismatch) the headline has no
          // share to show, so the card falls back to the plain balance.
          const subText = ok
            ? baseline !== null
              ? t('card.sub', { total: money(total, currency), baseline: money(baseline, currency) })
              : money(total, currency)
            : null

          return h('div', { className: 'dsb-entry', ref: rootRef }, [
            open
              ? h(Popup, { key: 'popup', t, payload, ratio, busy: snapshot.phase === 'refreshing' || snapshot.phase === 'loading' })
              : null,
            h('div', {
              key: 'card',
              className: `dsb-card${open ? ' is-open' : ''}`,
              role: 'group',
              tabIndex: 0,
              title: subText ?? undefined,
              'aria-label': t('chip.label'),
              onMouseEnter: () => store.pointerEnter(),
              onMouseLeave: () => store.pointerLeave(),
              onFocus: () => store.pointerEnter(),
              onBlur: () => store.pointerLeave(),
              onKeyDown: (event) => {
                if (event.key === 'Escape' && typeof event.currentTarget.blur === 'function') event.currentTarget.blur()
              },
            }, [
              h('div', { key: 'line', className: 'dsb-line' }, [
                h('span', { key: 'label', className: 'dsb-label' }, t('card.remainingLabel')),
                h('span', { key: 'percent', className: 'dsb-percent' }, percent(ratio)),
              ]),
              h('div', { key: 'sub', className: 'dsb-sub' }, warning
                ? t('card.error')
                : ok
                  ? subText
                  : t('card.never')),
              ratio === null
                ? null
                : h('div', { key: 'bar', className: 'dsb-bar' }, h('div', {
                  className: `dsb-bar-fill${barClass(ratio)}`,
                  style: { width: `${Math.max(1, ratio * 100)}%` },
                })),
            ]),
          ])
        }

        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'deepseek-balance',
          // Ascending: 10 renders before the LiteLLM card at 20, i.e. above it.
          order: 10,
          label: () => {
            const current = ctx.get('locale')
            const active = current !== undefined && current !== null && typeof current.getSnapshot === 'function'
              ? String(current.getSnapshot().active ?? '')
              : ''
            return (active.toLowerCase().startsWith('zh') ? MESSAGES.zh : MESSAGES.en)['chip.label']
          },
        }, Entry))
      },
    }
  },
})
