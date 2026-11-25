/**
 * Client half of the LiteLLM usage bundle.
 *
 * Renders a compact usage card at the sidebar foot (`sidebar.footer.action`):
 * one row with this week's spend, the remaining budget and a usage ring.
 * Pointing at it, or folding it open with a click, shows the full breakdown in
 * a floating popup anchored above the card, so nothing in the sidebar moves.
 *
 * All proxy access happens on the Host; this module reads one same-origin JSON
 * route and never handles the proxy key.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-litellm-usage',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NAMESPACE = 'litellmUsage'
    const ROUTE = '/litellm-usage'
    const REFRESH_MS = 60000
    const RETRY_DELAY_MS = 2500
    const RETRY_LIMIT = 5
    const HIDE_DELAY_MS = 120
    const HOVER_REFRESH_MS = 5000
    /** Business time zone used to render the weekly reset boundary (UTC+8). */
    const RESET_UTC_OFFSET_MS = 8 * 3600 * 1000

    /** Copy for this surface; also handed to the host locale registry. */
    const MESSAGES = {
      zh: {
        'chip.label': 'LiteLLM 用量',
        'card.spent': '已用',
        'card.resetLabel': '重置',
        'card.resetWeekly': '每周',
        'card.resetHint': '（{time} 重置）',
        'card.error': '用量不可用',
        'card.limit': '本周额度',
        'card.remainingLabel': '剩余用量',
        'card.reserved': '进行中',
        'card.total': '累计消费',
        'card.refresh': '刷新',
        'card.updated': '更新于',
        'card.never': '尚未读取',
      },
      en: {
        'chip.label': 'LiteLLM usage',
        'card.spent': 'Used',
        'card.resetLabel': 'Resets',
        'card.resetWeekly': 'weekly',
        'card.resetHint': '(resets {time})',
        'card.error': 'Usage unavailable',
        'card.limit': 'Weekly limit',
        'card.remainingLabel': 'Remaining',
        'card.reserved': 'In flight',
        'card.total': 'Total spend',
        'card.refresh': 'Refresh',
        'card.updated': 'Updated',
        'card.never': 'Not read yet',
      },
    }

    const CSS = `
/* Let the sidebar's footer row wrap, without naming any host class: the rule
   is keyed on our own element, so a host layout change at worst puts the card
   back beside the other actions instead of breaking the shell. Both depths are
   covered because the slot renderer may keep a per-entry wrapper. */

.ltu-entry{box-sizing:border-box;position:relative;display:block;width:100%;min-width:0}
.ltu-card{box-sizing:border-box;display:flex;flex-direction:column;gap:2px;justify-content:center;flex:1 1 auto;width:100%;min-width:0;padding:6px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:400 12px/16px inherit;cursor:default;text-align:left}
.ltu-card{transition:background-color .12s ease,border-color .12s ease}
.ltu-card.is-open{border-color:var(--dsw-alias-border-l2)}
@media (hover:hover){.ltu-card:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}}
.ltu-card:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.ltu-line{display:flex;align-items:baseline;gap:4px;min-width:0;overflow:hidden}
.ltu-label{color:var(--dsw-alias-label-secondary);flex:none}
.ltu-value{font-weight:600;font-size:15px;line-height:20px;font-variant-numeric:tabular-nums;white-space:nowrap}
.ltu-reset{flex:0 1 auto;min-width:0;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ltu-percent{margin-left:auto;color:var(--dsw-alias-label-primary);font-weight:600;font-size:13px;line-height:18px;font-variant-numeric:tabular-nums;white-space:nowrap;flex:none}
.ltu-sub{text-align:right;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ltu-bar{position:relative;height:4px;border-radius:999px;background:var(--dsw-alias-bg-base);box-shadow:0 0 0 1px var(--dsw-alias-border-l2);overflow:hidden}
.ltu-card .ltu-bar{margin-top:6px}
.ltu-popup .ltu-bar{margin-bottom:8px}
.ltu-bar-fill{position:absolute;inset:0 auto 0 0;border-radius:999px;background:var(--dsw-alias-label-secondary);opacity:.9;min-width:2px}
.ltu-bar-fill.is-warn{background:var(--dsw-alias-state-warn-primary)}
.ltu-bar-fill.is-error{background:var(--dsw-alias-state-error-primary)}
.ltu-popup{position:absolute;left:0;right:0;bottom:calc(100% + 8px);z-index:30;box-sizing:border-box;padding:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 12px 32px rgba(0,0,0,.28);font:400 12px/18px inherit}
.ltu-head{display:flex;align-items:center;gap:6px;margin-bottom:8px}
.ltu-head-percent{margin-left:auto;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;font-variant-numeric:tabular-nums;white-space:nowrap}
@keyframes ltu-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
.ltu-icon-button.is-spinning svg{animation:ltu-spin .9s linear infinite}
.ltu-title{font-weight:600;flex:none}
.ltu-icon-button{flex:none;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
@media (hover:hover){.ltu-icon-button:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}}
.ltu-rows{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:0}
.ltu-rows dt{margin:0;color:var(--dsw-alias-label-secondary)}
.ltu-rows dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}
.ltu-foot{display:flex;justify-content:space-between;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}
.ltu-error{margin:0 0 8px;color:var(--dsw-alias-state-error-primary)}
.ltu-note{margin:0;color:var(--dsw-alias-label-secondary)}
`

    /** Money with a stable width: cents, plus a fourth digit below one unit. */
    function money(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
      if (value !== 0 && Math.abs(value) < 0.01) return `$${value.toFixed(4)}`
      return `$${value.toFixed(2)}`
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

    /**
     * Budget reset label. LiteLLM only reports a concrete instant when the key
     * carries `budget_reset_at`; this proxy returns just the weekly period, so
     * the Host derives the next Monday 00:00 boundary. Everything is rendered
     * in the fixed business time zone (UTC+8) so it matches the LiteLLM portal
     * regardless of the machine's own zone.
     */
    function resetText(payload, t) {
      const raw = payload !== null && payload !== undefined ? payload.resetAt : null
      const parsed = typeof raw === 'string' ? new Date(raw) : typeof raw === 'number' ? new Date(raw) : null
      if (parsed !== null && !Number.isNaN(parsed.getTime())) {
        const pad = n => String(n).padStart(2, '0')
        const wall = new Date(parsed.getTime() + RESET_UTC_OFFSET_MS)
        return `${pad(wall.getUTCMonth() + 1)}/${pad(wall.getUTCDate())} ${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`
      }
      return t('card.resetWeekly')
    }

    /** One shared observable holding the fold of usage data and popup state. */
    function createUsage() {
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
        let response
        const target = fresh === true ? `${url}${url.includes('?') ? '&' : '?'}fresh=1` : url
        try {
          response = await fetch(target, { headers: { accept: 'application/json' }, cache: 'no-store' })
        } catch (error) {
          throw new Error(error instanceof Error ? error.message : String(error))
        }
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
        // The first paint can outrun the Host carrier, so a failed start retries
        // a few times before settling into the steady refresh interval.
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
          // Opening the popup shows live numbers: refresh when the last read is stale.
          if (Date.now() - lastLoadAt > HOVER_REFRESH_MS) load(true)
        },
        pointerLeave() {
          if (hideTimer !== null) clearTimeout(hideTimer)
          hideTimer = setTimeout(() => {
            hideTimer = null
            if (state.hover) publish({ hover: false })
          }, HIDE_DELAY_MS)
        },
        close() {
          publish({ hover: false })
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

    /**
     * Resolves one key: the Host locale dictionary when the locale service is
     * reachable and already knows this namespace, our own copy otherwise, so a
     * page that mounts this plugin before the locale service never shows keys.
     */
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

    return {
      inject: ['slots'],
      apply(ctx) {
        const store = createUsage()

        ctx.effect(() => {
          const element = document.createElement('style')
          element.dataset.dshLitellmUsage = ''
          element.textContent = CSS
          document.head.appendChild(element)
          return () => element.remove()
        }, 'litellm-usage: styles')

        ctx.effect(() => {
          const locale = ctx.get('locale')
          if (locale === undefined || locale === null || typeof locale.register !== 'function') return undefined
          return locale.register(NAMESPACE, MESSAGES)
        }, 'litellm-usage: dictionaries')

        function Popup({ t, payload, weekSpent, limit, remainingRatio, busy }) {
          const ok = payload !== null && payload.ok === true
          const reserved = payload !== null && payload.budget !== null && payload.budget !== undefined && typeof payload.budget.reserved === 'number'
            ? payload.budget.reserved
            : 0
          // Spin from the click until the request settles, with a 400ms floor so
          // a cached or instant reply still shows a visible turn.
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
            rows.push([t('card.limit'), money(limit)])
            rows.push([t('card.spent'), money(weekSpent)])
            if (reserved > 0) rows.push([t('card.reserved'), money(reserved)])
            if (typeof payload.spend === 'number' && weekSpent !== null && Math.abs(payload.spend - weekSpent) > 0.000001) {
              rows.push([t('card.total'), money(payload.spend)])
            }
          }

          return h('div', {
            className: 'ltu-popup',
            role: 'dialog',
            'aria-label': t('chip.label'),
            onMouseEnter: () => store.pointerEnter(),
            onMouseLeave: () => store.pointerLeave(),
          }, [
            h('div', { key: 'head', className: 'ltu-head' }, [
              h('span', { key: 'title', className: 'ltu-title' }, t('chip.label')),
              h('span', { key: 'percent', className: 'ltu-head-percent' }, percent(remainingRatio)),
              h('button', {
                key: 'refresh',
                type: 'button',
                className: `ltu-icon-button${spinning ? ' is-spinning' : ''}`,
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
            !ok && payload !== null ? h('p', { key: 'error', className: 'ltu-error' }, payload.message) : null,
            ok
              ? h('div', { key: 'bar', className: 'ltu-bar' }, h('div', {
                className: `ltu-bar-fill${remainingRatio !== null && remainingRatio <= 0.1 ? ' is-error' : remainingRatio !== null && remainingRatio <= 0.3 ? ' is-warn' : ''}`,
                style: { width: `${Math.max(1, (remainingRatio ?? 0) * 100)}%` },
              }))
              : null,
            ok
              ? h('dl', { key: 'rows', className: 'ltu-rows', style: { marginTop: '8px' } }, rows.flatMap(([term, value]) => [
                h('dt', { key: `t-${term}` }, term),
                h('dd', { key: `d-${term}` }, value),
              ]))
              : null,
            !ok && payload === null ? h('p', { key: 'note', className: 'ltu-note' }, t('card.never')) : null,
            h('div', { key: 'foot', className: 'ltu-foot' }, [
              h('span', { key: 'reset' }, ok ? `${t('card.resetLabel')} ${resetText(payload, t)}` : ''),
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
           * The sidebar foot renders its actions in one flex row. Switching that
           * row to a grid makes each action its own line, so this card gets a
           * whole row without naming any host class. The nearest flex ancestor
           * is found at runtime and its inline styles are restored on unmount.
           */
          React.useEffect(() => {
            const entry = rootRef.current
            if (entry === null || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return undefined
            let node = entry.parentElement
            while (node !== null && node !== document.body) {
              const display = window.getComputedStyle(node).display
              if (display === 'flex' || display === 'inline-flex') break
              node = node.parentElement
            }
            if (node === null || node === document.body) return undefined
            // Only a horizontal action row may become a grid; a column ancestor
            // (the sidebar itself) must never be touched.
            const style = window.getComputedStyle(node)
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
          const ok = payload !== null && payload.ok === true
          const budget = ok && payload.budget ? payload.budget : null
          const open = snapshot.hover
          const spent = payload !== null && typeof payload.spend === 'number' ? payload.spend : null
          const weekSpent = budget !== null && typeof budget.spent === 'number' ? budget.spent : spent
          const remaining = budget !== null && typeof budget.remaining === 'number' ? budget.remaining : null
          const limit = budget !== null && typeof budget.limit === 'number' ? budget.limit : null
          const remainingRatio = remaining !== null && limit !== null && limit > 0 ? remaining / limit : null
          const warning = payload !== null && !ok

          return h('div', { className: 'ltu-entry', ref: rootRef }, [
            open
              ? h(Popup, { key: 'popup', t, payload, weekSpent, limit, remainingRatio, busy: snapshot.phase === 'refreshing' || snapshot.phase === 'loading' })
              : null,
            h('div', {
              key: 'card',
              className: `ltu-card${open ? ' is-open' : ''}`,
              role: 'group',
              tabIndex: 0,
              'aria-label': t('chip.label'),
              onMouseEnter: () => store.pointerEnter(),
              onMouseLeave: () => store.pointerLeave(),
              onFocus: () => store.pointerEnter(),
              onBlur: () => store.pointerLeave(),
              onKeyDown: (event) => {
                if (event.key === 'Escape' && typeof event.currentTarget.blur === 'function') event.currentTarget.blur()
              },
            }, [
              h('div', { key: 'line', className: 'ltu-line' }, [
                h('span', { key: 'label', className: 'ltu-label' }, t('card.remainingLabel')),
                h('span', { key: 'reset', className: 'ltu-reset' }, ok ? t('card.resetHint', { time: resetText(payload, t) }) : ''),
                h('span', { key: 'percent', className: 'ltu-percent' }, remainingRatio === null ? '—' : percent(remainingRatio)),
              ]),
              h('div', { key: 'sub', className: 'ltu-sub' }, warning
                ? t('card.error')
                : `${t('card.spent')} ${money(weekSpent)} / ${money(limit)}`),
              remainingRatio === null
                ? null
                : h('div', { key: 'bar', className: 'ltu-bar' }, h('div', {
                  className: `ltu-bar-fill${remainingRatio <= 0.1 ? ' is-error' : remainingRatio <= 0.3 ? ' is-warn' : ''}`,
                  style: { width: `${Math.max(1, remainingRatio * 100)}%` },
                })),
            ]),
          ])
        }

        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'litellm-usage',
          order: 20,
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
