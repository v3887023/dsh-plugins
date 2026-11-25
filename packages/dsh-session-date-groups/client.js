/**
 * Client half of the Session date-groups bundle.
 *
 * In the sidebar's single-list grouping ("单列表" / "In one list") the Session
 * list is one flat run of rows ordered by recency, so a long history reads as
 * an undifferentiated column. This plugin inserts headers into that run —
 * Pinned, Today, Yesterday, and then one section per calendar day — and makes
 * every header a collapse control. Only Today (and Pinned) start open; the
 * operator's choices persist per browser.
 *
 * Older Sessions are not aggregated: each day keeps its own header, so the list
 * stays a date-sorted history with one clickable section per date rather than
 * buckets that hide which day a Session belongs to.
 *
 * The feature is additive at the DOM level: the built-in browser publishes no
 * seat inside its row list, so this plugin decorates the list it renders
 * instead of replacing it. Both ends of the contract it relies on are stable
 * product data rather than styling internals:
 *
 * - A Session row carries `data-row-key="session:<id>"`, somewhere inside the
 *   `role="tree"` element whose class marks the flat list (the hover card wraps
 *   each row, so the row is usually a grandchild).
 * - Timestamps come from the Client Session store (`ctx.sessions.list`), the
 *   same `updatedAt` each row's own time label is printed from, and the pinned
 *   set from the Client Workspace store (`ctx.workspaces.list`), the same set
 *   the browser fronts pinned rows with.
 * - The `blank` flag on those summaries separates a draft from a conversation.
 *   A blank Session has never accepted a prompt, so its `updatedAt` is only its
 *   creation time, and DSH reuses one blank across New Session and workspace
 *   switches. Blank drafts are therefore read as Today — the day they are being
 *   worked on — instead of the day they were first created.
 *
 * Headers are ordinary siblings of the row slots, so React keeps owning every
 * row it renders; this plugin only adds nodes, marks the slot and the row with
 * its own attributes for collapsing, and removes all of it on unload. Every
 * pass is idempotent and cheap when the grouping already matches, which is what
 * keeps the MutationObserver from reacting to its own insertions.
 */

window.__ModuleLoader__.load({
  id: '@v3887023/dsh-session-date-groups',
  factory() {
    /** Locale namespace this plugin's own dictionary is bound under. */
    const NS = 'session-date-groups'
    /** Marker/owning id of the stylesheet injected into the document head. */
    const STYLE_ID = '@v3887023/dsh-session-date-groups'
    /** Browser-record key holding the operator's expansion choices. */
    const STORAGE_KEY = 'dsh.session-date-groups.v1'
    /** Browser-record key holding the last diagnostics record (see `recordDiagnosis`). */
    const DIAGNOSE_KEY = 'dsh.session-date-groups.diagnose'
    /** Marker attribute on an inserted header box. */
    const HEADER = 'data-dsh-session-date-group'
    /** Marker attribute carrying a slot's bucket (also used by the stylesheet). */
    const BUCKET_ATTR = 'data-dsh-session-date-bucket'
    /** Present on a slot and its row while that section is collapsed. */
    const HIDDEN_ATTR = 'data-dsh-session-date-hidden'
    /** Session row identity, as the built-in browser renders it. */
    const ROW_KEY = 'data-row-key'
    const SESSION_PREFIX = 'session:'
    /** A Session row element; the hover-card anchor may nest it one level down. */
    const SESSION_ROW = '[data-row-key^="session:"]'
    /** Falls back to re-finding the list when the sidebar remounts. */
    const SWEEP_MS = 1000

    /**
     * Buckets that are not dates. Today and Yesterday are named because a date
     * alone reads worse for them; every older day is its own `day:` bucket.
     */
    const FIXED_BUCKETS = ['pinned', 'today', 'yesterday']

    /** Prefix of a per-day bucket, followed by the local `YYYY-MM-DD`. */
    const DAY_PREFIX = 'day:'

    /** A per-day bucket key, as this plugin writes it; its groups are the date parts. */
    const DAY_BUCKET = /^day:(\d{4})-(\d{2})-(\d{2})$/u

    /** Buckets open on first use; every older day starts collapsed. */
    const DEFAULT_EXPANDED = { pinned: true, today: true }

    /** English UI copy, also the fallback for every other language. */
    const en = {
      pinned: 'Pinned',
      today: 'Today',
      yesterday: 'Yesterday',
      'day.sameYear': '{mon} {d}',
      'day.otherYear': '{mon} {d}, {y}',
      'label.weekday': '{label} ({weekday})',
      groupAria: '{label}, {n} sessions',
    }

    /** English month names, shortest unambiguous form. */
    const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    /** Chinese UI copy. */
    const zh = {
      pinned: '置顶',
      today: '今天',
      yesterday: '昨天',
      'day.sameYear': '{m}月{d}日',
      'day.otherYear': '{y}年{m}月{d}日',
      'label.weekday': '{label}（{weekday}）',
      groupAria: '{label}，共 {n} 个会话',
    }

    /**
     * Weekday names indexed by `Date.getDay()`, per UI language.
     *
     * A date alone does not answer the question a reader has when scanning a
     * week of Sessions: whether that day was a Tuesday, and whether the work
     * belongs to a weekend. The full name is used rather than an abbreviation
     * ("星期日", not "周日"); Chinese brackets it with the full-width pair,
     * English with a plain parenthetical.
     */
    const WEEKDAYS = {
      en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      zh: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'],
    }

    /**
     * Stylesheet for the headers, the chevron, and the collapsed rows. Only
     * theme tokens are used, so light and dark follow the host.
     */
    const CSS = `
.dsh-sdgroup-head{display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;overflow:hidden;
  margin:6px 0 2px;min-height:24px;
  padding:3px calc(var(--dsh-sidebar-row-padding, 8px) - var(--dsh-sidebar-paint-inset, 0px) + var(--dsh-workspace-indent, 0px));
  border:0;border-radius:var(--dsw-radius-md, 6px);background:transparent;color:var(--dsw-alias-label-tertiary, #8b8b92);
  font:inherit;font-size:12px;line-height:18px;text-align:left;cursor:pointer}
.dsh-sdgroup-head:first-child{margin-top:0}
.dsh-sdgroup-chevron{flex:none;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;
  border-top:5px solid currentColor;transition:transform 120ms ease;transform-origin:50% 40%}
.dsh-sdgroup-head[aria-expanded="false"] .dsh-sdgroup-chevron{transform:rotate(-90deg)}
.dsh-sdgroup-label{flex:0 1 auto;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dsh-sdgroup-count{flex:none;margin-left:auto;color:var(--dsw-alias-label-caption, #6b6b73);font-variant-numeric:tabular-nums}
.dsh-sdgroup-head:focus-visible{outline:var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #4d6bfe));outline-offset:-2px}
@media (hover: hover){
  .dsh-sdgroup-head:hover{color:var(--dsw-alias-label-secondary, #b4b4bb);background-color:var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.06))}
}
[${HIDDEN_ATTR}]{display:none !important}
`

    /**
     * The active UI language this plugin has copy for.
     * @param ctx - client root context.
     * @returns `'zh'` or `'en'`.
     */
    function languageOf(ctx) {
      const locale = ctx.get('locale')
      if (locale === undefined || locale === null || typeof locale.getSnapshot !== 'function') return 'en'
      let active = ''
      try {
        active = String(locale.getSnapshot().active ?? '')
      } catch {
        return 'en'
      }
      return active.toLowerCase().startsWith('zh') ? 'zh' : 'en'
    }

    /**
     * Resolve one key against the locale service, falling back to local copy.
     * @param ctx - client root context.
     * @param key - dictionary key.
     * @param params - optional `{name}` substitutions.
     * @returns localized text.
     */
    function translate(ctx, key, params) {
      const locale = ctx.get('locale')
      const dictionary = languageOf(ctx) === 'zh' ? zh : en
      let bound = null
      if (locale !== undefined && locale !== null && typeof locale.bind === 'function') {
        try {
          bound = locale.bind(NS)
        } catch {
          bound = null
        }
      }
      let template = dictionary[key] ?? en[key] ?? key
      if (bound !== null) {
        const value = bound(key)
        if (typeof value === 'string' && value !== '' && value !== key) template = value
      }
      if (params === undefined || params === null) return template
      return template.replace(/\{(\w+)\}/gu, (match, name) => (name in params ? String(params[name]) : match))
    }

    /**
     * The local calendar day a timestamp belongs to.
     *
     * Built from local date parts, never from `toISOString`, whose UTC day is
     * the wrong day for most of the world every evening.
     * @param milliseconds - epoch milliseconds.
     * @returns the day key without the bucket prefix.
     */
    function dayOf(milliseconds) {
      const date = new Date(milliseconds)
      const pad = (value) => String(value).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    }

    /**
     * The weekday name of one local date, in the active UI language.
     * @param ctx - client root context.
     * @param date - a date whose local day is the one to name.
     * @returns the weekday name, e.g. `星期日` or `Sunday`.
     */
    function weekdayName(ctx, date) {
      const names = WEEKDAYS[languageOf(ctx)] ?? WEEKDAYS.en
      return names[date.getDay()] ?? ''
    }

    /**
     * The header label for one bucket.
     *
     * Today and Yesterday are named; every other bucket is a date in the app's
     * language, followed by its weekday in brackets — a column of dates says
     * nothing about which day of the week a Session was worked on — with the
     * year only when the day is not in the current year.
     * @param ctx - client root context.
     * @param bucket - bucket name, either fixed or `day:`-prefixed.
     * @returns the localized label.
     */
    function bucketLabel(ctx, bucket) {
      if (bucket === 'pinned' || bucket === 'today' || bucket === 'yesterday') return translate(ctx, bucket)
      if (!bucket.startsWith(DAY_PREFIX)) return bucket
      const parts = DAY_BUCKET.exec(bucket)
      if (parts === null) return bucket
      const year = Number(parts[1])
      const month = Number(parts[2])
      const day = Number(parts[3])
      const sameYear = new Date().getFullYear() === year
      const key = sameYear ? 'day.sameYear' : 'day.otherYear'
      const params = { y: year, m: month, d: day, mon: EN_MONTHS[month - 1] ?? String(month) }
      const label = translate(ctx, key, params)
      const date = new Date(year, month - 1, day)
      return translate(ctx, 'label.weekday', { label, weekday: weekdayName(ctx, date) })
    }

    /**
     * Read the persisted expansion choices.
     *
     * The record only holds choices the operator made; a bucket absent from it
     * keeps its default. Anything unreadable falls back to the defaults rather
     * than to an empty sidebar. Keys that are neither a fixed bucket nor a
     * well-formed day are dropped, so a stale record cannot inject anything.
     * @param storage - the page's `localStorage`, or null when unavailable.
     * @returns bucket name to `expanded` flag.
     */
    function readExpansion(storage) {
      if (storage === null) return {}
      let parsed = null
      try {
        parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null')
      } catch {
        return {}
      }
      const source = parsed !== null && typeof parsed === 'object' ? parsed.expanded : undefined
      if (source === null || typeof source !== 'object' || Array.isArray(source)) return {}
      const expansion = {}
      for (const [bucket, value] of Object.entries(source)) {
        if (typeof value !== 'boolean') continue
        if (!FIXED_BUCKETS.includes(bucket) && !DAY_BUCKET.test(bucket)) continue
        expansion[bucket] = value
      }
      return expansion
    }

    /**
     * Persist the expansion choices.
     * @param storage - the page's `localStorage`, or null when unavailable.
     * @param expansion - bucket name to `expanded` flag.
     */
    function writeExpansion(storage, expansion) {
      if (storage === null) return
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify({ expanded: expansion }))
      } catch {
        // A storage that refuses the write only costs persistence this session.
      }
    }

    /**
     * Record what the last pass saw, so a sidebar that gains no headers can be
     * diagnosed without browser control.
     *
     * The record is ASCII JSON under its own key. Callers write it once per
     * outcome change, never per pass, and no failure to write it can escape.
     * @param storage - the page's `localStorage`, or null when unavailable.
     * @param diagnosis - the outcome name and its facts.
     */
    function recordDiagnosis(storage, diagnosis) {
      if (storage === null) return
      try {
        storage.setItem(DIAGNOSE_KEY, JSON.stringify({ at: Date.now(), ...diagnosis }))
      } catch {
        // Diagnostics are best effort; a refusing storage must not affect grouping.
      }
    }

    /**
     * Whether a bucket is open, applying this plugin's defaults.
     * @param expansion - stored choices.
     * @param bucket - bucket name.
     * @returns true when the bucket's rows are visible.
     */
    function isExpanded(expansion, bucket) {
      const stored = expansion[bucket]
      return typeof stored === 'boolean' ? stored : DEFAULT_EXPANDED[bucket] === true
    }

    /**
     * Classify one Session timestamp into a bucket.
     *
     * Boundaries are calendar days in the browser's zone, not rolling 24-hour
     * windows: a Session from 23:50 yesterday belongs to Yesterday at 00:05,
     * which is what a reader expects from a header named "Yesterday". Older
     * Sessions are not aggregated — each day is one bucket.
     * @param updatedAt - the Session's last activity, in epoch milliseconds.
     * @param now - the current time, in epoch milliseconds.
     * @returns the bucket name.
     */
    function bucketOf(updatedAt, now) {
      if (!Number.isFinite(updatedAt) || updatedAt <= 0) return 'today'
      const date = new Date(now)
      const dayStart = (offset) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset).getTime()
      if (updatedAt >= dayStart(0)) return 'today'
      if (updatedAt >= dayStart(-1)) return 'yesterday'
      return `${DAY_PREFIX}${dayOf(updatedAt)}`
    }

    /**
     * Classify one Session row into a bucket.
     *
     * A blank Session — one that has never accepted a prompt — has no activity
     * of its own, but the list store still carries a number for it: the Host
     * reports `updatedAt` as `max(createdAt, lastPromptAt ?? 0)`, which for a
     * blank Session is simply the moment it was created. DSH mints a blank once
     * and then reuses it across New Session and workspace switches, so a blank
     * opened today can be days old. Dating it by that timestamp is what filed
     * the operator's current draft under Yesterday or an earlier day; the row
     * itself prints no time and leads the list as the live draft, so a blank
     * Session belongs to Today.
     * @param summary - the row's Session summary, or undefined when the store
     * does not describe it.
     * @param now - the current time, in epoch milliseconds.
     * @returns the bucket name.
     */
    function bucketFor(summary, now) {
      if (summary === undefined || summary === null) return 'today'
      if (summary.blank === true) return 'today'
      return bucketOf(summary.updatedAt, now)
    }

    /**
     * Read the Session id a row shows.
     * @param row - one Session row element.
     * @returns the id after `session:`, or null when the attribute is absent.
     */
    function rowSessionId(row) {
      const key = row.getAttribute(ROW_KEY)
      if (typeof key !== 'string' || !key.startsWith(SESSION_PREFIX)) return null
      const id = key.slice(SESSION_PREFIX.length)
      return id === '' ? null : id
    }

    /**
     * Read the list's Session rows in display order.
     *
     * The browser wraps each row in the hover card's anchor element, so a row
     * is usually a grandchild of the list rather than a child. This returns,
     * for each row, the direct child of the list that carries it — the slot a
     * header is inserted before and a collapse hides — together with the row
     * element that holds the identity and the selected state.
     * @param list - the flat-list container.
     * @returns one entry per Session row, in order.
     */
    function rowSlots(list) {
      const slots = []
      for (const child of list.children) {
        if (child.nodeType !== 1) continue
        const row = child.matches(SESSION_ROW) ? child : child.querySelector(SESSION_ROW)
        if (row === null) continue
        const id = rowSessionId(row)
        if (id === null) continue
        slots.push({ slot: child, row, id })
      }
      return slots
    }

    /**
     * Mount the date headers for the plugin lifetime.
     * @param ctx - client root context carrying the Session store.
     */
    function mount(ctx) {
      if (typeof window === 'undefined' || typeof document === 'undefined') return
      const doc = document
      let storage = null
      try {
        storage = window.localStorage ?? null
      } catch {
        storage = null
      }

      /** The operator's expansion choices, exactly as persisted. */
      let expansion = readExpansion(storage)
      /**
       * Buckets opened only to keep the Session the operator just moved to
       * visible. Kept out of the record: the stored choices stay the choices
       * the operator made by clicking a header.
       */
      const opened = new Set()

      /**
       * Whether a bucket is open right now.
       * @param bucket - bucket name.
       * @returns true when the bucket's rows are shown.
       */
      const expandedOf = (bucket) => opened.has(bucket) || isExpanded(expansion, bucket)

      /** The flat-list container currently decorated. */
      let container = null
      /** The watched ancestor of {@link container}, kept to detect remounts. */
      let watched = null
      /** Group key to its rendered header parts. */
      const headers = new Map()
      /**
       * The Session row that was active at the previous pass. Starts empty so
       * the first pass adopts the active row instead of reopening its bucket:
       * the stored choices must survive a reload.
       */
      let activeSeen = null
      /** Cheap fingerprint of the last applied grouping. */
      let signature = ''
      let observer = null
      let timer = 0
      let frame = 0
      let disposed = false

      /**
       * The list element this plugin decorates, if it is on screen.
       * @returns the flat-list `role="tree"` container, or null.
       */
      const findContainer = () => {
        for (const candidate of doc.querySelectorAll('[role="tree"]')) {
          if (!candidate.isConnected) continue
          const className = candidate.getAttribute('class') ?? ''
          if (!className.includes('flatList')) continue
          return candidate
        }
        return null
      }

      /** Remove every header this plugin inserted, leaving the rows untouched. */
      const clearHeaders = () => {
        for (const parts of headers.values()) parts.box.remove()
        headers.clear()
      }

      /** Strip the plugin's attributes from a set of row slots. */
      const forgetSlots = (slots) => {
        for (const item of slots) {
          for (const node of [item.slot, item.row]) {
            if (node.hasAttribute(HIDDEN_ATTR)) node.removeAttribute(HIDDEN_ATTR)
            if (node.hasAttribute('inert')) node.removeAttribute('inert')
          }
          if (item.slot.hasAttribute(BUCKET_ATTR)) item.slot.removeAttribute(BUCKET_ATTR)
        }
      }

      /** Remove everything the plugin added to the page. */
      const clear = () => {
        if (container !== null) forgetSlots(rowSlots(container))
        clearHeaders()
        container = null
        signature = ''
      }

      /**
       * Read the Session store's current summaries.
       * @returns Session id to `updatedAt`, or null when the store is absent.
       */
      const summaries = () => {
        const sessions = ctx.get('sessions')
        if (sessions === undefined || sessions === null || typeof sessions !== 'object') return null
        const list = sessions.list
        if (list === undefined || list === null || typeof list.getSnapshot !== 'function') return null
        const state = list.getSnapshot()
        return state !== null && typeof state === 'object' && state.byId !== null && typeof state.byId === 'object'
          ? state.byId
          : null
      }

      /**
       * Read the registry-global pin set, the same set the browser fronts pinned
       * rows with — read as data rather than guessed from a row's icons.
       * @returns the pinned Session ids, or null when the Workspace service is
       * absent (dates still group; nothing is treated as pinned).
       */
      const pinnedIds = () => {
        const workspaces = ctx.get('workspaces')
        if (workspaces === undefined || workspaces === null || typeof workspaces !== 'object') return null
        const list = workspaces.list
        if (list === undefined || list === null || typeof list.getSnapshot !== 'function') return null
        const state = list.getSnapshot()
        const ids = state !== null && typeof state === 'object' ? state.pinnedSessionIds : undefined
        return Array.isArray(ids) ? new Set(ids) : null
      }

      /**
       * Build or update one header.
       *
       * One header per run, not per bucket: the same bucket can appear in two
       * runs (a pinned block leads whatever its age, and manual ordering can
       * interleave dates), and both runs still toggle together because the
       * control writes the bucket's own expansion choice.
       * @param key - the run's key.
       * @param bucket - bucket name.
       * @param count - rows in this run.
       * @param expanded - whether the run's rows are visible.
       * @returns the header parts.
       */
      const headerFor = (key, bucket, count, expanded) => {
        const cached = headers.get(key)
        const parts = cached ?? (() => {
          // The control is the header: no presentational wrapper, and the tree
          // gains one focusable disclosure instead of a div around it.
          const button = doc.createElement('button')
          button.setAttribute('type', 'button')
          button.setAttribute(HEADER, key)
          button.className = 'dsh-sdgroup-head'
          const chevron = doc.createElement('span')
          chevron.className = 'dsh-sdgroup-chevron'
          chevron.setAttribute('aria-hidden', 'true')
          const label = doc.createElement('span')
          label.className = 'dsh-sdgroup-label'
          const tally = doc.createElement('span')
          tally.className = 'dsh-sdgroup-count'
          tally.setAttribute('aria-hidden', 'true')
          button.append(chevron, label, tally)
          button.addEventListener('click', (event) => {
            event.preventDefault()
            event.stopPropagation()
            const next = !expandedOf(bucket)
            // The click is the operator's own choice: it replaces any
            // follow-the-active-Session open, and only choices like this one
            // reach the record.
            opened.delete(bucket)
            expansion = { ...expansion, [bucket]: next }
            writeExpansion(storage, expansion)
            signature = ''
            sync()
          })
          const created = { box: button, button, label, tally }
          headers.set(key, created)
          return created
        })()
        const name = bucketLabel(ctx, bucket)
        const text = translate(ctx, 'groupAria', { label: name, n: count })
        if (parts.label.textContent !== name) parts.label.textContent = name
        if (parts.tally.textContent !== String(count)) parts.tally.textContent = String(count)
        if (parts.button.getAttribute('aria-label') !== text) parts.button.setAttribute('aria-label', text)
        const state = expanded ? 'true' : 'false'
        if (parts.button.getAttribute('aria-expanded') !== state) parts.button.setAttribute('aria-expanded', state)
        return parts
      }

      /** The active locale tag, so switching language re-labels the headers. */
      const localeTag = () => {
        const locale = ctx.get('locale')
        if (locale === undefined || locale === null || typeof locale.getSnapshot !== 'function') return ''
        try {
          return String(locale.getSnapshot().active ?? '')
        } catch {
          return ''
        }
      }

      /** The outcome already written to the diagnostics record. */
      let diagnosed = ''

      /**
       * Record why this pass did or did not decorate the list, once per outcome.
       * @param outcome - the short outcome name.
       * @param facts - called only when the outcome changed, so a pass that
       * repeats itself costs nothing.
       */
      const diagnose = (outcome, facts) => {
        if (outcome === diagnosed) return
        diagnosed = outcome
        recordDiagnosis(storage, { outcome, ...facts() })
      }

      /** What the page holds right now, for a diagnostics record. */
      const pageFacts = (list) => {
        const trees = [...doc.querySelectorAll('[role="tree"]')]
        const rows = [...doc.querySelectorAll('[data-row-key^="session:"]')]
        const first = rows[0]
        const ancestry = []
        let node = first ?? null
        while (node !== null && ancestry.length < 5) {
          ancestry.push(`${node.tagName}.${String(node.getAttribute('class') ?? '').slice(0, 36)}`)
          node = node.parentElement
        }
        return {
          trees: trees.length,
          classes: trees.map(tree => String(tree.getAttribute('class') ?? '')).slice(0, 3),
          children: trees.map(tree => tree.children.length).slice(0, 3),
          kids: trees.map(tree => [...tree.children].slice(0, 3).map(
            kid => `${kid.tagName}.${String(kid.getAttribute('class') ?? '').slice(0, 26)}`,
          )).slice(0, 3),
          rows: rows.length,
          ancestry,
          inside: list !== null && first !== undefined ? list.contains(first) : null,
          section: doc.querySelector('[data-sidebar-workspace-header]') !== null,
          sessions: ctx.get('sessions') !== undefined,
          workspaces: ctx.get('workspaces') !== undefined,
        }
      }

      /** Monotonic milliseconds where available, for the diagnostics duration. */
      const nowMs = () => (typeof performance === 'object' && performance !== null
        && typeof performance.now === 'function'
        ? performance.now()
        : Date.now())

      /** Apply one pass: read the rows, group them, and reconcile the DOM. */
      const sync = () => {
        if (disposed) return
        const started = nowMs()
        const next = findContainer()
        if (next === null) {
          diagnose('no-flat-list', () => pageFacts(container))
          if (container !== null) clear()
          return
        }
        if (next !== container) {
          clearHeaders()
          if (container !== null) forgetSlots(rowSlots(container))
          container = next
          watch(next)
        }

        const items = rowSlots(container)
        const store = summaries()
        // The store is what makes a grouping truthful. Until it is readable,
        // leave the plain list alone instead of filing every Session under
        // Today and reshuffling a moment later.
        if (store === null) {
          diagnose('no-session-store', () => pageFacts(container))
          clearHeaders()
          forgetSlots(items)
          signature = ''
          return
        }
        const now = Date.now()
        const pinned = pinnedIds()
        const entries = items.map((item) => {
          if (pinned !== null && pinned.has(item.id)) return { ...item, bucket: 'pinned' }
          return { ...item, bucket: bucketFor(store[item.id], now) }
        })

        // One run per contiguous bucket: the list may hand back the same bucket
        // twice (a pinned block leads regardless of age, and manual ordering can
        // interleave dates), and each run needs its own header. Run keys are
        // numbered inside their bucket, so a row arriving elsewhere does not
        // renumber — and rebuild — a header the operator may be focused on.
        const groups = []
        const runs = new Map()
        for (const entry of entries) {
          const last = groups[groups.length - 1]
          if (last !== undefined && last.bucket === entry.bucket) {
            last.entries.push(entry)
            continue
          }
          const ordinal = runs.get(entry.bucket) ?? 0
          runs.set(entry.bucket, ordinal + 1)
          groups.push({ bucket: entry.bucket, key: `${entry.bucket}#${ordinal}`, entries: [entry] })
        }

        // A single run holds nothing to separate: skip the headers rather than
        // print one section title over the whole list.
        if (groups.length < 2) {
          diagnose('one-section', () => ({ ...pageFacts(container), sections: groups.length }))
          clearHeaders()
          forgetSlots(items)
          signature = ''
          return
        }

        // Follow the open Session: when the operator moves to one whose bucket
        // is closed, show that bucket for this session so the row being read is
        // never hidden. This stays in memory — the record keeps only choices
        // made by clicking a header — and the first pass merely adopts the
        // active row, so a stored collapse survives a reload.
        const active = entries.find(entry => entry.row.getAttribute('aria-selected') === 'true')
        if (active !== undefined) {
          if (activeSeen === null) {
            activeSeen = active
          } else if (active.row !== activeSeen.row) {
            activeSeen = active
            if (!expandedOf(active.bucket)) opened.add(active.bucket)
          }
        }

        const fingerprint = [
          groups.map(group => `${group.key}:${group.entries.length}`).join(','),
          entries.length,
          groups.map(group => (expandedOf(group.bucket) ? '1' : '0')).join(''),
          localeTag(),
        ].join('/')
        const intact = [...headers.values()].every(parts => parts.box.isConnected)
        // A header is only in place while it still sits immediately before its
        // section's first row. Reordering rows *inside* one section changes no
        // run and no count, so the fingerprint cannot see it, yet the header can
        // end up below a row of its own section.
        const placed = groups.every((group) => {
          const parts = headers.get(group.key)
          if (parts === undefined) return false
          if (!parts.box.isConnected) return false
          const first = group.entries[0]
          return first === undefined || parts.box.nextElementSibling === first.slot
        })
        if (fingerprint === signature && intact && placed) {
          applyCollapse(groups)
          return
        }

        const used = new Set()
        for (const group of groups) {
          const expanded = expandedOf(group.bucket)
          const parts = headerFor(group.key, group.bucket, group.entries.length, expanded)
          used.add(group.key)
          const first = group.entries[0]
          if (first !== undefined && first.slot.parentElement === container && parts.box.nextElementSibling !== first.slot) {
            container.insertBefore(parts.box, first.slot)
          }
        }
        for (const [key, parts] of headers) {
          if (used.has(key)) continue
          parts.box.remove()
          headers.delete(key)
        }
        applyCollapse(groups)
        signature = fingerprint

        // Recorded after the DOM work, so the counts describe what is on the
        // page rather than what this pass intended.
        diagnose('grouped', () => ({
          ...pageFacts(container),
          sections: groups.length,
          headers: container.querySelectorAll(`[${HEADER}]`).length,
          hidden: container.querySelectorAll(`[${HIDDEN_ATTR}]`).length,
          ms: Math.round(nowMs() - started),
        }))
      }

      /**
       * Show or hide each run's rows.
       *
       * Both the row and the hover-card slot that carries it are marked: the
       * slot owns the list layout, and marking the row as well keeps the state
       * readable whether or not a build wraps it.
       * @param groups - the runs the last pass produced.
       */
      const applyCollapse = (groups) => {
        const collapsed = new Set()
        for (const group of groups) {
          if (expandedOf(group.bucket)) continue
          for (const entry of group.entries) collapsed.add(entry)
        }
        for (const group of groups) {
          for (const entry of group.entries) {
            const hide = collapsed.has(entry)
            for (const node of [entry.slot, entry.row]) {
              const marked = node.hasAttribute(HIDDEN_ATTR)
              if (hide && !marked) node.setAttribute(HIDDEN_ATTR, '')
              else if (!hide && marked) node.removeAttribute(HIDDEN_ATTR)
            }
            // Hidden rows are already out of the accessibility tree; `inert`
            // also keeps assistive technology and focus traps from counting
            // them as collapsed-but-present controls.
            if (hide && !entry.slot.hasAttribute('inert')) entry.slot.setAttribute('inert', '')
            else if (!hide && entry.slot.hasAttribute('inert')) entry.slot.removeAttribute('inert')
            if (entry.slot.getAttribute(BUCKET_ATTR) !== group.bucket) {
              entry.slot.setAttribute(BUCKET_ATTR, group.bucket)
            }
          }
        }
      }

      /**
       * Observe the list's ancestor so row changes refresh the grouping, and
       * re-attach when the sidebar remounts.
       * @param node - the container to watch.
       */
      const watch = (node) => {
        const root = node.parentElement ?? node
        if (watched !== null && watched !== root && observer !== null) observer.disconnect()
        watched = root
        if (typeof MutationObserver !== 'function') return
        if (observer === null) observer = new MutationObserver(schedule)
        observer.observe(root, {
          childList: true,
          subtree: true,
          // The open row moves by attribute, not by insertion: without these
          // the "follow the active Session" rule would wait for the sweep.
          attributes: true,
          attributeFilter: ['aria-selected', 'class', ROW_KEY],
        })
      }

      /** Coalesce a burst of DOM changes into one pass. */
      const schedule = () => {
        if (disposed) return
        if (frame !== 0) return
        if (typeof window.requestAnimationFrame === 'function') {
          frame = window.requestAnimationFrame(() => {
            frame = 0
            sync()
          })
          return
        }
        frame = window.setTimeout(() => {
          frame = 0
          sync()
        }, 16)
      }

      ctx.effect(() => {
        const style = doc.createElement('style')
        style.dataset.plugin = STYLE_ID
        style.dataset.pluginCss = 'session-date-groups'
        style.textContent = CSS
        doc.head.append(style)

        sync()
        timer = window.setInterval(sync, SWEEP_MS)

        return () => {
          disposed = true
          window.clearInterval(timer)
          timer = 0
          if (frame !== 0 && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frame)
          frame = 0
          if (observer !== null) observer.disconnect()
          observer = null
          watched = null
          clear()
          style.remove()
          expansion = {}
          activeSeen = null
        }
      }, 'session-date-groups: date headers')
    }

    /**
     * Activate the plugin, recording a fault instead of letting it disappear.
     *
     * A decorative plugin that throws during activation is hard to notice from
     * the console alone. The diagnostics record names the failure so the page
     * can be inspected later; the error is still rethrown so the Plugins page
     * reports the failure as usual.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      try {
        mount(ctx)
      } catch (error) {
        let storage = null
        try {
          storage = window.localStorage ?? null
        } catch {
          storage = null
        }
        const message = error === null || error === undefined
          ? String(error)
          : String(error.message ?? error)
        recordDiagnosis(storage, { outcome: 'crashed', message: message.slice(0, 180) })
        throw error
      }
    }

    return {
      name: 'session-date-groups',
      apply,
    }
  },
})
