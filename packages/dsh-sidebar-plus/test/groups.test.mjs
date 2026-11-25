// Behaviour test for the Session date-groups client half, with a minimal DOM.
// Run: node test/groups.test.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const SOURCE = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const FIXED_NOW = new Date(2026, 10, 20, 10, 0, 0).getTime()

/** Attribute predicates the plugin's selectors use; anything else throws. */
function matchesSelector(node, selector) {
  if (selector.startsWith('.')) {
    return (node.getAttribute('class') ?? '').split(/\s+/u).includes(selector.slice(1))
  }
  const parsed = /^([a-z]*)(.*)$/u.exec(selector)
  if (parsed === null) throw new Error(`unsupported selector: ${selector}`)
  const [, tag, rest] = parsed
  if (tag !== '' && node.tagName !== tag) return false
  let tail = rest
  while (tail !== '') {
    const attribute = /^\[([a-z-]+)(?:(\^?)=("?)([^"\]]*)\3)?\]/u.exec(tail)
    if (attribute === null) throw new Error(`unsupported selector: ${selector}`)
    const [, name, operator, , value] = attribute
    const actual = node.getAttribute(name)
    if (actual === null) return false
    if (operator === '^') {
      if (!actual.startsWith(value)) return false
    } else if (operator === '=') {
      if (actual !== value) return false
    }
    tail = tail.slice(attribute[0].length)
  }
  return true
}

class FakeElement {
  constructor(tag) {
    this.nodeType = 1
    this.tagName = tag
    this.childNodes = []
    this.parentElement = null
    this.attributes = new Map()
    this.dataset = {}
    this.listeners = new Map()
    this.textContent = ''
  }

  get className() {
    return this.getAttribute('class') ?? ''
  }

  set className(value) {
    this.setAttribute('class', value)
  }

  get children() {
    return this.childNodes.filter((node) => node.nodeType === 1)
  }

  get nextElementSibling() {
    if (this.parentElement === null) return null
    const siblings = this.parentElement.children
    return siblings[siblings.indexOf(this) + 1] ?? null
  }

  get isConnected() {
    let node = this
    while (node.parentElement !== null) node = node.parentElement
    return node.__isRoot === true
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parentElement = this
      this.childNodes.push(node)
    }
  }

  insertBefore(node, reference) {
    const index = this.childNodes.indexOf(reference)
    if (index === -1) throw new Error('insertBefore: reference is not a child')
    if (node.parentElement !== null) {
      const old = node.parentElement.childNodes
      old.splice(old.indexOf(node), 1)
    }
    node.parentElement = this
    this.childNodes.splice(index, 0, node)
  }

  remove() {
    if (this.parentElement === null) return
    const siblings = this.parentElement.childNodes
    siblings.splice(siblings.indexOf(this), 1)
    this.parentElement = null
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value ?? ''))
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null
  }

  hasAttribute(name) {
    return this.attributes.has(name)
  }

  removeAttribute(name) {
    this.attributes.delete(name)
  }

  addEventListener(type, handler) {
    const entry = this.listeners.get(type) ?? []
    entry.push(handler)
    this.listeners.set(type, entry)
  }

  dispatch(type, event = {}) {
    event.target ??= this
    event.preventDefault ??= () => {}
    event.stopPropagation ??= () => {}
    for (const handler of this.listeners.get(type) ?? []) handler(event)
  }

  matches(selector) {
    return matchesSelector(this, selector)
  }

  closest(selector) {
    for (let node = this; node !== null; node = node.parentElement) {
      if (matchesSelector(node, selector)) return node
    }
    return null
  }

  contains(node) {
    for (let candidate = node; candidate !== null; candidate = candidate.parentElement) {
      if (candidate === this) return true
    }
    return false
  }

  querySelectorAll(selector) {
    const found = []
    const walk = (node) => {
      for (const child of node.children) {
        if (matchesSelector(child, selector)) found.push(child)
        walk(child)
      }
    }
    walk(this)
    return found
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null
  }
}

function createStorage(entries = {}) {
  const map = new Map(Object.entries(entries))
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value))
    },
    removeItem: (key) => {
      map.delete(key)
    },
    dump: () => Object.fromEntries(map),
  }
}

/** Minimal document: an html root holding head and body. */
function createDocument() {
  const root = new FakeElement('html')
  root.__isRoot = true
  const head = new FakeElement('head')
  const body = new FakeElement('body')
  root.append(head, body)
  return {
    root,
    head,
    body,
    createElement: (tag) => new FakeElement(tag),
    querySelectorAll: (selector) => root.querySelectorAll(selector),
    querySelector: (selector) => root.querySelector(selector),
  }
}

const DAY = 24 * 60 * 60 * 1000

/** Bucket key the plugin builds for one timestamp's local calendar day. */
const dayKey = (milliseconds) => {
  const date = new Date(milliseconds)
  const pad = (value) => String(value).padStart(2, '0')
  return `day:${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Chinese weekday names, indexed like `Date.getDay()`. */
const WEEKDAYS_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

/** Chinese label of one day bucket, as the plugin renders it: date + weekday. */
const dayLabelZh = (milliseconds) => {
  const date = new Date(milliseconds)
  return `${date.getMonth() + 1}月${date.getDate()}日（${WEEKDAYS_ZH[date.getDay()]}）`
}

/** English label of one day bucket, as the plugin renders it: date + weekday. */
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const dayLabelEn = (milliseconds) => {
  const date = new Date(milliseconds)
  return `${EN_MONTHS[date.getMonth()]} ${date.getDate()} (${WEEKDAYS_EN[date.getDay()]})`
}

/**
 * Build a harness around one sidebar flat list.
 * @param options - sessions, their timestamps, and pinned ids.
 */
function createHarness({ sessions, storage = createStorage(), flat = true, locale = 'zh', store = true, workspaceStore = true, wrap = true }) {
  const document = createDocument()
  const frames = []
  const intervals = []
  const observers = []
  const effects = []

  const window = {
    localStorage: storage,
    addEventListener() {},
    removeEventListener() {},
    clearTimeout() {},
    setInterval: (handler, ms) => {
      intervals.push(handler)
      return intervals.length
    },
    clearInterval: (id) => {
      intervals[id - 1] = null
    },
    requestAnimationFrame: (handler) => {
      frames.push(handler)
      return frames.length
    },
    cancelAnimationFrame: (id) => {
      frames[id - 1] = null
    },
    setTimeout: (handler) => {
      frames.push(handler)
      return frames.length
    },
  }

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback
      observers.push(this)
    }

    observe(root, options) {
      this.root = root
      this.options = options
    }

    disconnect() {
      this.root = null
    }

    fire() {
      this.callback([], this)
    }
  }

  const region = new FakeElement('div')
  region.setAttribute('class', 'root')
  const section = new FakeElement('div')
  section.setAttribute('data-sidebar-workspace-header', '')
  const container = new FakeElement('div')
  container.setAttribute('role', 'tree')
  container.setAttribute('class', flat ? 'GAkraW_list GAkraW_flatList' : 'GAkraW_list')
  region.append(section, container)
  document.body.append(region)

  const byId = {}
  const rows = new Map()
  const pinnedSessionIds = []
  for (const session of sessions) {
    const row = new FakeElement('div')
    row.setAttribute('data-row-key', `session:${session.id}`)
    const slot = new FakeElement('span')
    slot.setAttribute('data-slot', '')
    row.append(slot)
    if (session.pinned === true) pinnedSessionIds.push(session.id)
    if (session.active === true) row.setAttribute('aria-selected', 'true')
    // The browser wraps each row in the hover card's anchor element, so the
    // row is a grandchild of the list; `wrap: false` covers a build that does
    // not wrap it.
    if (wrap) {
      const anchor = new FakeElement('span')
      anchor.setAttribute('class', '_root_test_1')
      anchor.append(row)
      container.append(anchor)
    } else {
      container.append(row)
    }
    rows.set(session.id, row)
    byId[session.id] = {
      id: session.id,
      displayTitle: session.id,
      updatedAt: session.updatedAt ?? 0,
      blank: session.blank === true,
    }
  }

  const context = {
    document,
    window,
    MutationObserver: FakeMutationObserver,
    Date: class extends Date {
      constructor(...args) {
        if (args.length === 0) super(FIXED_NOW)
        else super(...args)
      }

      static now() {
        return FIXED_NOW
      }
    },
    Number,
    JSON,
    String,
    Object,
    Array,
    Set,
    Map,
    Math,
    console,
  }

  let loaded
  window.__ModuleLoader__ = {
    load(definition) {
      loaded = definition
    },
  }
  vm.createContext(context)
  vm.runInContext(SOURCE, context)
  assert.equal(loaded?.id, '@v3887023/dsh-sidebar-plus')

  const plugin = loaded.factory((id) => {
    if (id === 'react') {
      return {
        createElement: () => null,
        useRef: () => ({ current: null }),
        useEffect: () => {},
        useState: (initial) => [initial, () => {}],
      }
    }
    throw new Error(`unexpected module request: ${id}`)
  })
  assert.equal(plugin.name, 'sidebar-plus')

  const localeService = {
    register: () => () => {},
    getSnapshot: () => ({ active: locale }),
    bind: () => (key) => key,
  }

  const ctx = {
    effect(fn) {
      effects.push(fn())
    },
    get(name) {
      if (name === 'sessions') {
        if (!store) return undefined
        return { list: { getSnapshot: () => ({ byId }) } }
      }
      if (name === 'workspaces') {
        if (!workspaceStore) return undefined
        return { list: { getSnapshot: () => ({ items: [], archivedSessionIds: [], pinnedSessionIds, state: 'idle', phase: 'ready', error: null }) } }
      }
      if (name === 'locale') return localeService
      return undefined
    },
    locale: localeService,
    slots: {
      inject(key, contribute) {
        const cleanup = contribute()
        return typeof cleanup === 'function' ? cleanup : () => {}
      },
      register() {
        return () => {}
      },
    },
  }

  plugin.apply(ctx)

  return {
    document,
    container,
    rows,
    storage,
    frames,
    observers,
    /** Run pending frame callbacks (the observer's coalesced pass). */
    flush() {
      while (frames.length > 0) {
        const handler = frames.shift()
        if (handler !== null && handler !== undefined) handler()
      }
    },
    /** Run one sweep like the fallback interval does. */
    sweep() {
      for (const handler of intervals) if (handler !== null) handler()
    },
    /** Move the open Session to another row, as a click on it would. */
    setActive(id) {
      for (const [key, row] of this.rows) {
        if (key === id) row.setAttribute('aria-selected', 'true')
        else if (row.hasAttribute('aria-selected')) row.removeAttribute('aria-selected')
      }
      this.observers.at(-1).fire()
      this.flush()
    },
    /** Headers currently inserted, in document order. */
    headers() {
      return container.children.filter((node) => node.getAttribute('data-dsh-session-date-group') !== null)
    },
    /** Visible Session ids in document order. */
    visible() {
      return [...this.rows.values()]
        .filter((row) => row.isConnected && !row.hasAttribute('data-dsh-session-date-hidden'))
        .map((row) => row.getAttribute('data-row-key').slice('session:'.length))
    },
    dispose() {
      for (const dispose of effects) if (typeof dispose === 'function') dispose()
    },
  }
}

const history = [
  { id: 'pinned-old', updatedAt: FIXED_NOW - 40 * DAY, pinned: true },
  { id: 'today-1', updatedAt: FIXED_NOW - 2 * 60 * 60 * 1000 },
  { id: 'today-2', updatedAt: FIXED_NOW - 5 * 60 * 60 * 1000 },
  { id: 'yesterday-1', updatedAt: new Date(2026, 10, 19, 12, 0, 0).getTime() },
  { id: 'week-1', updatedAt: FIXED_NOW - 3 * DAY },
  { id: 'month-1', updatedAt: FIXED_NOW - 20 * DAY },
  { id: 'older-1', updatedAt: FIXED_NOW - 60 * DAY },
]

// 1. Headers land in bucket order with their counts, and only Today and Pinned
//    are open by default. Older Sessions keep one section per day.
{
  const week = FIXED_NOW - 3 * DAY
  const month = FIXED_NOW - 20 * DAY
  const older = FIXED_NOW - 60 * DAY
  const harness = createHarness({ sessions: history })
  const headers = harness.headers()
  assert.deepEqual(
    headers.map((node) => node.getAttribute('data-dsh-session-date-group')),
    ['pinned#0', 'today#0', 'yesterday#0', `${dayKey(week)}#0`, `${dayKey(month)}#0`, `${dayKey(older)}#0`],
  )
  assert.deepEqual(
    headers.map((node) => node.querySelector('.dsh-sdgroup-label').textContent),
    ['置顶', '今天', '昨天', dayLabelZh(week), dayLabelZh(month), dayLabelZh(older)],
  )
  // The weekday is the day's own, not today's: 2026-11-17 is a Tuesday.
  assert.equal(dayLabelZh(week), '11月17日（星期二）')
  assert.equal(dayLabelZh(month), '10月31日（星期六）')
  assert.equal(dayLabelZh(older), '9月21日（星期一）')
  // The aria name carries the same label, weekday included.
  assert.equal(headers[3].getAttribute('aria-label'), '11月17日（星期二），共 1 个会话')
  assert.deepEqual(
    headers.map((node) => node.querySelector('.dsh-sdgroup-count').textContent),
    ['1', '2', '1', '1', '1', '1'],
  )
  assert.deepEqual(harness.visible(), ['pinned-old', 'today-1', 'today-2'])
  assert.equal(
    headers[2].getAttribute('aria-expanded'),
    'false',
  )
  assert.equal(
    headers[1].getAttribute('aria-expanded'),
    'true',
  )
  // Every header sits immediately before its first row.
  for (const header of headers) {
    const key = header.getAttribute('data-dsh-session-date-group')
    const bucket = key.slice(0, key.lastIndexOf('#'))
    const firstRow = harness.container.children[harness.container.children.indexOf(header) + 1]
    assert.equal(firstRow.getAttribute('data-dsh-session-date-bucket'), bucket)
  }
  harness.dispose()
}

// 2. Clicking a header toggles its bucket and persists the choice.
{
  const harness = createHarness({ sessions: history })
  const yesterday = harness.headers()[2]
  yesterday.dispatch('click')
  assert.deepEqual(harness.visible(), ['pinned-old', 'today-1', 'today-2', 'yesterday-1'])
  const stored = harness.storage.getItem('dsh.session-date-groups.v1')
  assert.deepEqual(JSON.parse(stored), { expanded: { yesterday: true } })

  const today = harness.headers()[1]
  today.dispatch('click')
  assert.deepEqual(harness.visible(), ['pinned-old', 'yesterday-1'])
  assert.equal(today.getAttribute('aria-expanded'), 'false')
  harness.dispose()
}

// 3. A stored choice outlives the page: a collapsed Today stays collapsed, and
//    a day the operator opened stays open.
{
  const older = FIXED_NOW - 60 * DAY
  const storage = createStorage({
    'dsh.session-date-groups.v1': JSON.stringify({ expanded: { today: false, [`${dayKey(older)}`]: true } }),
  })
  const harness = createHarness({ sessions: history, storage })
  assert.deepEqual(harness.visible(), ['pinned-old', 'older-1'])
  harness.dispose()
}

// 4. Rows without a summary (the blank draft row) read as Today's work.
{
  const harness = createHarness({
    sessions: [{ id: 'draft', updatedAt: 0 }, { id: 'older-1', updatedAt: FIXED_NOW - 60 * DAY }],
  })
  assert.deepEqual(
    harness.headers().map((node) => node.getAttribute('data-dsh-session-date-group')),
    ['today#0', `${dayKey(FIXED_NOW - 60 * DAY)}#0`],
  )
  assert.deepEqual(harness.visible(), ['draft'])
  harness.dispose()
}

// 4b. A blank Session is Today's work even though its list timestamp is a real
//     creation date: DSH mints one blank and reuses it across New Session and
//     workspace switches, so a draft opened today can be days old. Dating it by
//     creation filed the draft under Yesterday or an earlier day.
{
  const createdDaysAgo = new Date(2026, 10, 18, 9, 30, 0).getTime()
  const harness = createHarness({
    sessions: [
      { id: 'reused-draft', updatedAt: createdDaysAgo, blank: true, active: true },
      { id: 'today-1', updatedAt: FIXED_NOW - 60 * 1000 },
      { id: 'yesterday-1', updatedAt: FIXED_NOW - DAY },
    ],
  })
  assert.deepEqual(
    harness.headers().map((node) => node.getAttribute('data-dsh-session-date-group')),
    ['today#0', 'yesterday#0'],
  )
  assert.deepEqual(
    harness.headers().map((node) => node.querySelector('.dsh-sdgroup-label').textContent),
    ['今天', '昨天'],
  )
  assert.equal(harness.headers()[0].querySelector('.dsh-sdgroup-count').textContent, '2')
  assert.deepEqual(harness.visible(), ['reused-draft', 'today-1'])
  harness.dispose()
}

// 4c. Pinning still outranks blankness: a pinned draft leads Pinned, not Today.
{
  const harness = createHarness({
    sessions: [
      { id: 'pinned-draft', updatedAt: FIXED_NOW - 9 * DAY, blank: true, pinned: true },
      { id: 'today-1', updatedAt: FIXED_NOW - 60 * 1000 },
      { id: 'yesterday-1', updatedAt: FIXED_NOW - DAY },
    ],
  })
  assert.deepEqual(
    harness.headers().map((node) => node.getAttribute('data-dsh-session-date-group')),
    ['pinned#0', 'today#0', 'yesterday#0'],
  )
  harness.dispose()
}

// 5. The same bucket twice gets two headers that share one expansion choice.
{
  const older = FIXED_NOW - 60 * DAY
  const harness = createHarness({
    sessions: [
      { id: 'today-1', updatedAt: FIXED_NOW - 60 * 1000 },
      { id: 'older-1', updatedAt: older },
      { id: 'today-2', updatedAt: FIXED_NOW - 2 * 60 * 1000 },
    ],
  })
  assert.deepEqual(
    harness.headers().map((node) => node.getAttribute('data-dsh-session-date-group')),
    ['today#0', `${dayKey(older)}#0`, 'today#1'],
  )
  assert.deepEqual(harness.visible(), ['today-1', 'today-2'])
  // Collapsing the first Today header hides the second run's rows too.
  harness.headers()[0].dispatch('click')
  assert.deepEqual(harness.visible(), [])
  harness.headers()[2]
  assert.deepEqual(harness.visible(), [])
  harness.dispose()
}

// 6. Only the single-list container is decorated.
{
  const harness = createHarness({ sessions: history, flat: false })
  assert.deepEqual(harness.headers(), [])
  assert.deepEqual(harness.visible(), history.map((session) => session.id))
  harness.dispose()
}

// 7. A stored collapse survives the page: mounting on a Session whose bucket
//    is closed does not reopen it.
{
  const storage = createStorage({
    'dsh.session-date-groups.v1': JSON.stringify({ expanded: { today: false, yesterday: false } }),
  })
  const harness = createHarness({
    sessions: [
      { id: 'yesterday-1', updatedAt: FIXED_NOW - DAY, active: true },
      { id: 'today-1', updatedAt: FIXED_NOW - 60 * 1000 },
    ],
    storage,
  })
  assert.deepEqual(harness.visible(), [])
  assert.deepEqual(JSON.parse(storage.getItem('dsh.session-date-groups.v1')), {
    expanded: { today: false, yesterday: false },
  })
  harness.dispose()
}

// 7b. Moving to a closed Session shows its bucket, but that is this session's
//     convenience, not a stored choice: the record keeps user clicks only.
{
  const storage = createStorage({
    'dsh.session-date-groups.v1': JSON.stringify({ expanded: { today: true, yesterday: false } }),
  })
  const harness = createHarness({
    sessions: [
      { id: 'today-1', updatedAt: FIXED_NOW - 60 * 1000, active: true },
      { id: 'yesterday-1', updatedAt: FIXED_NOW - DAY },
    ],
    storage,
  })
  assert.deepEqual(harness.visible(), ['today-1'])
  harness.setActive('yesterday-1')
  assert.deepEqual(harness.visible(), ['today-1', 'yesterday-1'])
  assert.deepEqual(JSON.parse(storage.getItem('dsh.session-date-groups.v1')), {
    expanded: { today: true, yesterday: false },
  })
  // A later click records its own choice, and no other bucket leaks into it:
  // the auto-opened Yesterday stays false in the record.
  harness.headers()[0].dispatch('click')
  assert.deepEqual(JSON.parse(storage.getItem('dsh.session-date-groups.v1')), {
    expanded: { today: false, yesterday: false },
  })
  harness.dispose()
}

// 7c. A browser with no choices and no Session today starts with every day
//     closed — the headers alone — and writes nothing.
{
  const storage = createStorage()
  const harness = createHarness({
    sessions: [
      { id: 'week-1', updatedAt: FIXED_NOW - 3 * DAY },
      { id: 'older-1', updatedAt: FIXED_NOW - 60 * DAY },
    ],
    storage,
  })
  assert.deepEqual(harness.visible(), [])
  assert.equal(harness.headers().length, 2)
  assert.equal(storage.getItem('dsh.session-date-groups.v1'), null)
  harness.dispose()
}

// 7d. One run of Sessions is not a grouping: no headers, nothing hidden.
{
  const harness = createHarness({
    sessions: [
      { id: 'today-1', updatedAt: FIXED_NOW - 60 * 1000 },
      { id: 'today-2', updatedAt: FIXED_NOW - 2 * 60 * 1000 },
    ],
  })
  assert.deepEqual(harness.headers(), [])
  assert.deepEqual(harness.visible(), ['today-1', 'today-2'])
  harness.dispose()
}

// 7e. Without the Session store the plain list is left alone rather than
//     filing everything under Today.
{
  const harness = createHarness({ sessions: history, store: false })
  assert.deepEqual(harness.headers(), [])
  for (const row of harness.rows.values()) {
    assert.equal(row.hasAttribute('data-dsh-session-date-bucket'), false)
  }
  harness.dispose()
}

// 7f. Without the Workspace store the dates still group, and a Session that
//     happens to be pinned is dated like any other.
{
  const harness = createHarness({ sessions: history, workspaceStore: false })
  const d = (days) => dayKey(FIXED_NOW - days * DAY)
  assert.deepEqual(
    harness.headers().map((node) => node.getAttribute('data-dsh-session-date-group')),
    [`${d(40)}#0`, 'today#0', 'yesterday#0', `${d(3)}#0`, `${d(20)}#0`, `${d(60)}#0`],
  )
  harness.dispose()
}

// 8. A row change is picked up, and a bucket that empties loses its header.
{
  const harness = createHarness({ sessions: history })
  const older = [...harness.rows.values()].find(
    (row) => row.getAttribute('data-row-key') === 'session:older-1',
  )
  older.remove()
  harness.observers.at(-1).fire()
  harness.flush()
  assert.deepEqual(
    harness.headers().map((node) => node.getAttribute('data-dsh-session-date-group')),
    ['pinned#0', 'today#0', 'yesterday#0', `${dayKey(FIXED_NOW - 3 * DAY)}#0`, `${dayKey(FIXED_NOW - 20 * DAY)}#0`],
  )
  harness.dispose()
}

// 9. The sweep keeps the grouping current without duplicating headers.
{
  const harness = createHarness({ sessions: history })
  harness.sweep()
  harness.sweep()
  assert.equal(harness.headers().length, 6)
  assert.equal(
    harness.container.children.filter((node) => node.className === 'dsh-sdgroup-head').length,
    6,
  )
  harness.dispose()
}

// 10. Unload removes every header, marker attribute, and the stylesheet.
{
  const harness = createHarness({ sessions: history })
  assert.notEqual(harness.document.head.querySelector('style'), null)
  harness.dispose()
  assert.deepEqual(harness.headers(), [])
  assert.equal(harness.document.head.querySelector('style'), null)
  for (const row of harness.rows.values()) {
    assert.equal(row.hasAttribute('data-dsh-session-date-hidden'), false)
    assert.equal(row.hasAttribute('data-dsh-session-date-bucket'), false)
  }
}

// 11. Every bucket label and the aria name come from the active locale.
{
  const harness = createHarness({ sessions: history, locale: 'en' })
  assert.deepEqual(
    harness.headers().map((node) => node.querySelector('.dsh-sdgroup-label').textContent),
    [
      'Pinned', 'Today', 'Yesterday',
      dayLabelEn(FIXED_NOW - 3 * DAY), dayLabelEn(FIXED_NOW - 20 * DAY), dayLabelEn(FIXED_NOW - 60 * DAY),
    ],
  )
  assert.equal(
    harness.headers()[1].getAttribute('aria-label'),
    'Today, 2 sessions',
  )
  harness.dispose()
}

// 12. The diagnostics record names what the pass saw.
{
  const harness = createHarness({ sessions: history })
  const record = JSON.parse(harness.storage.getItem('dsh.session-date-groups.diagnose'))
  assert.equal(record.outcome, 'grouped')
  assert.equal(record.sections, 6)
  assert.equal(record.trees, 1)
  assert.equal(record.rows, history.length)
  assert.equal(record.section, true)
  assert.equal(record.sessions, true)
  assert.equal(record.workspaces, true)
  harness.dispose()
}

// 13. A page without the single-list container says so, with the classes it saw.
{
  const harness = createHarness({ sessions: history, flat: false })
  const record = JSON.parse(harness.storage.getItem('dsh.session-date-groups.diagnose'))
  assert.equal(record.outcome, 'no-flat-list')
  assert.deepEqual(record.classes, ['GAkraW_list'])
  assert.equal(record.rows, history.length)
  harness.dispose()
}

// 14. A list that keeps each row as its own child (no hover-card wrapper)
//     groups the same way.
{
  const harness = createHarness({ sessions: history, wrap: false })
  assert.deepEqual(
    harness.headers().map((node) => node.getAttribute('data-dsh-session-date-group')),
    [
      'pinned#0', 'today#0', 'yesterday#0',
      `${dayKey(FIXED_NOW - 3 * DAY)}#0`, `${dayKey(FIXED_NOW - 20 * DAY)}#0`, `${dayKey(FIXED_NOW - 60 * DAY)}#0`,
    ],
  )
  assert.deepEqual(harness.visible(), ['pinned-old', 'today-1', 'today-2'])
  harness.dispose()
}

// 15. A day in another year carries the year in its label, and two days that
//     share a month and day in different years stay separate sections.
{
  const thisYear = new Date(2026, 10, 17, 12, 0, 0).getTime()
  const lastYear = new Date(2025, 10, 17, 12, 0, 0).getTime()
  const harness = createHarness({
    sessions: [
      { id: 'today-1', updatedAt: FIXED_NOW - 60 * 1000 },
      { id: 'this-year', updatedAt: thisYear },
      { id: 'last-year', updatedAt: lastYear },
    ],
  })
  assert.deepEqual(
    harness.headers().map((node) => node.getAttribute('data-dsh-session-date-group')),
    ['today#0', `${dayKey(thisYear)}#0`, `${dayKey(lastYear)}#0`],
  )
  assert.deepEqual(
    harness.headers().map((node) => node.querySelector('.dsh-sdgroup-label').textContent),
    ['今天', '11月17日（星期二）', '2025年11月17日（星期一）'],
  )
  harness.dispose()
}

// 16. Reordering rows inside one section keeps its header above the section:
//     the run structure does not change, so only a placement check can notice.
{
  const harness = createHarness({
    sessions: [
      { id: 'today-1', updatedAt: FIXED_NOW - 60 * 1000 },
      { id: 'today-2', updatedAt: FIXED_NOW - 2 * 60 * 1000 },
      { id: 'older-1', updatedAt: FIXED_NOW - 60 * DAY },
    ],
  })
  const firstSlot = harness.rows.get('today-1').parentElement
  const secondSlot = harness.rows.get('today-2').parentElement
  const nodes = harness.container.childNodes
  // Move the section's second row above its header, as a bare reorder would.
  nodes.splice(nodes.indexOf(secondSlot), 1)
  nodes.splice(0, 0, secondSlot)
  harness.observers.at(-1).fire()
  harness.flush()
  const headers = harness.headers()
  assert.equal(headers.length, 2)
  assert.equal(harness.container.children[0], headers[0], 'the header returns above the section')
  const afterHeader = harness.container.children[harness.container.children.indexOf(headers[0]) + 1]
  assert.equal(afterHeader, secondSlot, 'today header must sit above the section’s new first row')
  harness.dispose()
}

console.log('sidebar-plus: date groups OK')
