// Behaviour test for the sidebar-plus order lock, with a minimal
// DOM and no document: the refusal logic must not need one.
// Run: node test/lock.test.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const ROW_SELECTOR = '[data-row-key^="session:"]'
const ANY_ROW = '[data-row-key]'
const SOURCE = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')

const matches = (node, selector) => {
  const key = node.attributes.get('data-row-key')
  if (typeof key !== 'string') return false
  if (selector === ANY_ROW) return true
  if (selector === ROW_SELECTOR) return key.startsWith('session:')
  throw new Error(`unsupported selector: ${selector}`)
}

class FakeElement {
  constructor(tag) {
    this.tagName = tag
    this.childNodes = []
    this.parentElement = null
    this.attributes = new Map()
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parentElement = this
      this.childNodes.push(node)
    }
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value ?? ''))
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null
  }

  closest(selector) {
    for (let node = this; node !== null; node = node.parentElement) {
      if (matches(node, selector)) return node
    }
    return null
  }
}

function createStorage(entries = {}) {
  const map = new Map(Object.entries(entries))
  return {
    get length() {
      return map.size
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value))
    },
    removeItem: (key) => {
      map.delete(key)
    },
  }
}

const record = (orderBy) => JSON.stringify({ groupBy: 'flat', orderBy, groupExpansion: {}, sessionOrderByAccount: {}, archivedFilter: 'default' })

function createHarness({ storage = createStorage() } = {}) {
  const listeners = new Map()
  const effects = []

  const window = {
    localStorage: storage,
    addEventListener(type, handler) {
      const entry = listeners.get(type) ?? []
      entry.push(handler)
      listeners.set(type, entry)
    },
    removeEventListener(type, handler) {
      listeners.set(type, (listeners.get(type) ?? []).filter((candidate) => candidate !== handler))
    },
  }

  let loaded
  window.__ModuleLoader__ = {
    load(definition) {
      loaded = definition
    },
  }

  const locale = {
    register: () => () => {},
    getSnapshot: () => ({ active: 'en' }),
  }

  const ctx = {
    get(name) {
      return name === 'locale' ? locale : undefined
    },
    effect(fn) {
      effects.push(fn())
    },
    locale,
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

  const context = vm.createContext({ window, Element: FakeElement, console })
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
  // The bundle runs in its own realm, so its inject array is copied into this
  // one before the deep comparison.
  assert.deepEqual([...plugin.inject], ['slots', 'locale', 'sessions'], 'the slots, the locale, and the list')
  plugin.apply(ctx)

  /** A Session row like the sidebar renders: the row carries the draggable. */
  const sessionRow = (id) => {
    const row = new FakeElement('div')
    row.setAttribute('data-row-key', `session:${id}`)
    const title = new FakeElement('span')
    row.append(title)
    return { row, title }
  }

  /** A Workspace row: draggable too, but not a Session row. */
  const workspaceRow = () => {
    const row = new FakeElement('div')
    row.setAttribute('data-row-key', 'workspace:ws-1')
    const title = new FakeElement('span')
    row.append(title)
    return { row, title }
  }

  const dispatch = (type, target, overrides = {}) => {
    const subject = {
      type,
      target,
      defaultPrevented: false,
      propagationStopped: false,
      dataTransfer: null,
      preventDefault() {
        subject.defaultPrevented = true
      },
      stopPropagation() {
        subject.propagationStopped = true
      },
      ...overrides,
    }
    for (const handler of listeners.get(type) ?? []) handler(subject)
    return subject
  }

  const transfer = () => ({ dropEffect: 'move' })

  return {
    storage,
    listeners,
    effects,
    sessionRow,
    workspaceRow,
    dispatch,
    transfer,
    dispose() {
      for (const dispose of effects) if (typeof dispose === 'function') dispose()
    },
  }
}

// 1. With "Last updated", a Session drag starts but no drop is accepted on the list.
{
  const harness = createHarness({ storage: createStorage({ 'dsh.workspace.view.v5': record('updated') }) })
  const source = harness.sessionRow('session-a')
  const target = harness.sessionRow('session-b')

  const start = harness.dispatch('dragstart', source.title, { dataTransfer: harness.transfer() })
  assert.equal(start.defaultPrevented, false, 'the drag still starts, so drag-to-composer keeps working')
  assert.equal(start.propagationStopped, false)

  const hover = harness.dispatch('dragover', target.title, { dataTransfer: harness.transfer() })
  assert.equal(hover.defaultPrevented, false, 'the hover is not accepted, so no drop can fire here')
  assert.equal(hover.propagationStopped, true, 'the row handler never arms an insertion marker')
  assert.equal(hover.dataTransfer.dropEffect, 'none', 'the cursor reports a refused drop')

  // Releasing over the row ends the drag without a drop and without any notice.
  harness.dispatch('dragend', source.title, { dataTransfer: harness.transfer() })
  assert.equal(JSON.parse(harness.storage.getItem('dsh.workspace.view.v5')).orderBy, 'updated')
  harness.dispose()
}

// 2. A locked drag that ends outside the list — the composer, say — is untouched.
{
  const harness = createHarness({ storage: createStorage({ 'dsh.workspace.view.v5': record('updated') }) })
  const source = harness.sessionRow('session-a')
  const target = harness.sessionRow('session-b')
  const composer = new FakeElement('div')
  harness.dispatch('dragstart', source.title, { dataTransfer: harness.transfer() })
  harness.dispatch('dragover', target.title, { dataTransfer: harness.transfer() })
  const outside = harness.dispatch('dragover', composer, { dataTransfer: harness.transfer() })
  assert.equal(outside.propagationStopped, false, 'the shell keeps its own feedback outside the list')
  const drop = harness.dispatch('drop', composer, { dataTransfer: { dropEffect: 'move' } })
  assert.equal(drop.defaultPrevented, false, 'Session drops onto the composer still reach the shell')
  harness.dispose()
}

// 3. In manual order every drag stays exactly as the shell made it.
{
  const harness = createHarness({ storage: createStorage({ 'dsh.workspace.view.v5': record('manual') }) })
  const source = harness.sessionRow('session-a')
  const target = harness.sessionRow('session-b')
  harness.dispatch('dragstart', source.title, { dataTransfer: harness.transfer() })
  const hover = harness.dispatch('dragover', target.title, { dataTransfer: harness.transfer() })
  assert.equal(hover.defaultPrevented, false)
  assert.equal(hover.propagationStopped, false)
  assert.equal(hover.dataTransfer.dropEffect, 'move')
  const drop = harness.dispatch('drop', target.title, { dataTransfer: { dropEffect: 'move' } })
  assert.equal(drop.defaultPrevented, false)
  assert.equal(drop.propagationStopped, false)
  harness.dispose()
}

// 4. A browser with no stored record uses the product default, "Last updated".
{
  const harness = createHarness()
  const source = harness.sessionRow('session-a')
  const target = harness.sessionRow('session-b')
  harness.dispatch('dragstart', source.title, { dataTransfer: harness.transfer() })
  const hover = harness.dispatch('dragover', target.title, { dataTransfer: harness.transfer() })
  assert.equal(hover.propagationStopped, true)
  harness.dispose()
}

// 5. The newest persisted generation wins over a stale one.
{
  const harness = createHarness({
    storage: createStorage({
      'dsh.workspace.view.v5': record('updated'),
      'dsh.workspace.view.v6': record('manual'),
    }),
  })
  const source = harness.sessionRow('session-a')
  const target = harness.sessionRow('session-b')
  harness.dispatch('dragstart', source.title, { dataTransfer: harness.transfer() })
  const hover = harness.dispatch('dragover', target.title, { dataTransfer: harness.transfer() })
  assert.equal(hover.propagationStopped, false, 'v6 manual order is respected')
  harness.dispose()
}

// 6. Other drags — Workspace rows, files — are never touched.
{
  const harness = createHarness({ storage: createStorage({ 'dsh.workspace.view.v5': record('updated') }) })
  const workspace = harness.workspaceRow()
  const target = harness.sessionRow('session-b')
  harness.dispatch('dragstart', workspace.title, { dataTransfer: harness.transfer() })
  const hover = harness.dispatch('dragover', target.title, { dataTransfer: harness.transfer() })
  assert.equal(hover.defaultPrevented, false)
  assert.equal(hover.propagationStopped, false, 'a Workspace drag is not a Session drag')

  // A drag that never started on a Session row is not tracked at all.
  const fileHover = harness.dispatch('dragover', target.title, { dataTransfer: { dropEffect: 'copy' } })
  assert.equal(fileHover.defaultPrevented, false)
  assert.equal(fileHover.propagationStopped, false)
  harness.dispose()
}

// 7. dragend clears the drag, so a later dragover is judged from scratch.
{
  const harness = createHarness({ storage: createStorage({ 'dsh.workspace.view.v5': record('updated') }) })
  const source = harness.sessionRow('session-a')
  const target = harness.sessionRow('session-b')
  harness.dispatch('dragstart', source.title, { dataTransfer: harness.transfer() })
  harness.dispatch('dragend', source.title, { dataTransfer: harness.transfer() })
  const hover = harness.dispatch('dragover', target.title, { dataTransfer: harness.transfer() })
  assert.equal(hover.propagationStopped, false, 'a finished drag cannot affect a later hover')
  harness.dispose()
}

// 8. Unload removes every listener.
{
  const harness = createHarness({ storage: createStorage({ 'dsh.workspace.view.v5': record('updated') }) })
  const target = harness.sessionRow('session-b')
  harness.dispose()
  for (const type of ['dragstart', 'dragover', 'drop', 'dragend']) {
    assert.equal((harness.listeners.get(type) ?? []).length, 0, `${type} listener removed`)
  }
  const hover = harness.dispatch('dragover', target.title, { dataTransfer: harness.transfer() })
  assert.equal(hover.defaultPrevented, false)
}

console.log('sidebar-plus client: order lock, 8 scenarios passed')
