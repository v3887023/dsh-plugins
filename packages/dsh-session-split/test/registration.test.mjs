// Wiring test for the session-split client half, without the shell.
//
// Boots the real bundle against a stub Cordis context, then drives the three
// facts that decide whether the feature works at all: which slots it
// contributes, whether the Session-row menu entry switches the main panel and
// adds a pane, and whether a Session row dragged inside the workbench lands as
// a pane while a drag anywhere else is left to the shipped behaviour.
//
// Run: node test/registration.test.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'

const SOURCE = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')

const ReactStub = {
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children: children.flat(Infinity) }
  },
  Fragment: 'Fragment',
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useMemo: (factory) => factory(),
  useRef: (initial) => ({ current: initial }),
  useCallback: (callback) => callback,
}

/** Fake element: enough `Element` surface for the plugin's closest()/instanceof. */
class FakeElement {
  constructor(attributes = {}, parent = null) {
    this.attributes = { ...attributes }
    this.parent = parent
    this.isConnected = true
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null
  }

  closest(selector) {
    for (let node = this; node !== null && node !== undefined; node = node.parent) {
      if (selector === '[data-row-key]' && typeof node.attributes['data-row-key'] === 'string') return node
      if (selector === '[data-ssp-panel]' && Object.prototype.hasOwnProperty.call(node.attributes, 'data-ssp-panel')) return node
    }
    return null
  }
}

/** Boot the bundle against a stub shell. */
function boot(options = {}) {
  const rendered = []
  const store = new Map()
  const listeners = new Map()
  const effects = []
  const writes = []
  const styled = []
  const createElement = (tag) => {
    const element = { tag, dataset: {}, textContent: '', style: {}, removed: false, remove() { this.removed = true } }
    return element
  }

  const window = {
    __ModuleLoader__: { load: (entry) => rendered.push(entry) },
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => { store.set(key, String(value)); writes.push({ key, value }) },
    },
    addEventListener: (type, handler) => {
      const list = listeners.get(type) ?? []
      list.push(handler)
      listeners.set(type, list)
    },
    removeEventListener: (type, handler) => {
      const list = listeners.get(type) ?? []
      listeners.set(type, list.filter((item) => item !== handler))
    },
    innerWidth: 1600,
    setTimeout: () => 0,
    clearTimeout: () => {},
    requestAnimationFrame: () => 0,
  }
  const document = {
    createElement,
    head: { append: (element) => styled.push(element) },
    querySelector: () => null,
    querySelectorAll: () => [],
  }

  const registrations = []
  const injections = []
  const serviceInjections = []
  const layoutCalls = []
  // The host's openSession, as the bundle found it: the workbench replaces it
  // to keep an on-screen Session in the workbench.
  const openedByHost = []
  const uiWorkspace = { openSession: (id) => openedByHost.push(id) }
  const rawOpenSession = uiWorkspace.openSession
  // The shell's structured menu service: the bundle contributes data actions
  // here instead of hand-rendering a menu row.
  const menuContributions = new Map()
  const contextMenus = {
    register(contribution) {
      menuContributions.set(contribution.id, contribution)
      return () => menuContributions.delete(contribution.id)
    },
  }
  const ctx = {
    effect(factory) {
      const cleanup = factory()
      effects.push(cleanup)
      return () => { if (typeof cleanup === 'function') cleanup() }
    },
    // Services the workbench waits for before installing its hooks.
    inject(names, callback) {
      serviceInjections.push(names.join(','))
      // The real context hands the callback a scope of its own; the stub has
      // one flat context, so the same object stands in for it.
      callback(ctx)
      return () => {}
    },
    get(name) {
      if (name === 'contextMenus') return contextMenus
      if (name === 'sessions') {
        return {
          list: {
            getSnapshot: () => ({
              byId: {
                s1: { id: 's1', title: 'Alpha', retainedBy: { mainView: 1 } },
                s2: { id: 's2', title: 'Beta', retainedBy: {} },
              },
            }),
          },
          retain: () => ({ release: () => {} }),
        }
      }
      if (name === 'locale') return { getSnapshot: () => ({ active: options.locale ?? 'zh-CN' }) }
      if (name === 'layout') return { selectPanel: (id) => layoutCalls.push(id) }
      if (name === 'uiWorkspace') return uiWorkspace
      return undefined
    },
    slots: {
      inject(key, callback) {
        injections.push(key)
        return callback()
      },
      register(slotOptions, component) {
        registrations.push({ ...slotOptions, component })
        return () => {}
      },
    },
  }

  const run = new Function('window', 'document', 'console', 'Element', SOURCE)
  run(window, document, console, FakeElement)
  const plugin = rendered[0].factory((id) => {
    if (id === 'react') return ReactStub
    throw new Error(`unexpected module: ${id}`)
  })
  plugin.apply(ctx)

  const fire = (type, event) => {
    for (const handler of listeners.get(type) ?? []) handler(event)
  }
  const handlersOf = (type) => listeners.get(type) ?? []
  const slot = (name) => registrations.find((entry) => entry.name === name)

  return { plugin, registrations, menuContributions, injections, serviceInjections, layoutCalls, opened: openedByHost, workspace: uiWorkspace, rawOpenSession, ctx, writes, styled, effects, fire, handlersOf, slot, store, listeners }
}

// --- contributions -------------------------------------------------------
{
  const shell = boot()
  const names = shell.registrations.map((entry) => entry.name).sort()
  assert.deepEqual(names, [
    'contextMenu.icon',
    'conversation.session.header.utilities',
    'main',
    'shell.overlay',
    'shell.overlay',
    'shell.overlay',
    'sidebar.panellist',
  ])
  assert.deepEqual(shell.injections.sort(), [
    'contextMenu.icon',
    'conversation.session.header.utilities',
    'main',
    'shell.overlay',
    'shell.overlay',
    'shell.overlay',
    'sidebar.panellist',
  ])
  const overlayIds = shell.registrations.filter((entry) => entry.name === 'shell.overlay').map((entry) => entry.id).sort()
  assert.deepEqual(overlayIds, ['session-split-bar', 'session-split-drop-hint', 'session-split-host'])

  assert.equal(shell.slot('main').key, 'session-split')
  assert.equal(shell.slot('sidebar.panellist').id, 'session-split')
  assert.equal(typeof shell.slot('sidebar.panellist').label, 'function')
  assert.equal(shell.slot('sidebar.panellist').label(), '会话分屏')
  assert.equal(shell.slot('contextMenu.icon').key, 'session-split.open', 'the glyph is keyed for the shell menu')
  const contribution = shell.menuContributions.get('session-split.open')
  assert.ok(contribution !== undefined, 'the structured menu action is registered')
  assert.equal(contribution.target, 'session')
  assert.equal(contribution.order, 400)
  assert.equal(shell.slot('shell.overlay').id, 'session-split-host')

  // Styles are installed once and removed on unload.
  assert.equal(shell.styled.length, 1)
  assert.match(shell.styled[0].textContent, /ssp-root/)
  for (const cleanup of shell.effects) if (typeof cleanup === 'function') cleanup()
  assert.equal(shell.styled[0].removed, true)
  assert.equal(shell.handlersOf('dragover').length, 0, 'drag listeners are removed on unload')
}

// --- Session-row menu entry ---------------------------------------------
{
  const shell = boot()
  const [action] = shell.menuContributions.get('session-split.open').resolve({ sessionId: 's2' })
  assert.equal(action.label, '在分屏中打开')
  assert.deepEqual(action.icon, { key: 'session-split.open' }, 'the shell renders the keyed glyph in its own menu font')
  action.run()
  assert.deepEqual(shell.layoutCalls, ['session-split'], 'picking the action shows the workbench')
  const persisted = JSON.parse(shell.writes.at(-1).value)
  assert.deepEqual(persisted.panes, ['s2'], 'the pane list is persisted')
}

// --- drag gesture --------------------------------------------------------
{
  const shell = boot()
  const panel = new FakeElement({ 'data-ssp-panel': '' })
  const pane = new FakeElement({}, panel)
  const sidebarRow = new FakeElement({ 'data-row-key': 'session:s1' })
  const transfer = { data: new Map(), dropEffect: 'none', setData(key, value) { this.data.set(key, value) } }

  shell.fire('dragstart', { target: sidebarRow, dataTransfer: transfer })
  assert.equal(transfer.data.get('application/x-dsh-session-split'), 's1')

  // Over the sidebar row itself: not our zone.
  let prevented = false
  shell.fire('dragover', { target: sidebarRow, dataTransfer: transfer, preventDefault: () => { prevented = true } })
  assert.equal(prevented, false, 'the sidebar keeps its own drop handling')

  // Over the workbench: claimed.
  let claimed = false
  shell.fire('dragover', { target: pane, dataTransfer: transfer, preventDefault: () => { claimed = true } })
  assert.equal(claimed, true, 'the workbench claims the drop')
  assert.equal(transfer.dropEffect, 'move')

  let dropped = false
  let propagated = true
  shell.fire('drop', {
    target: pane,
    dataTransfer: transfer,
    preventDefault: () => { dropped = true },
    stopPropagation: () => { propagated = false },
  })
  assert.equal(dropped, true)
  assert.equal(propagated, false)
  assert.deepEqual(shell.layoutCalls, ['session-split'])
  assert.deepEqual(JSON.parse(shell.writes.at(-1).value).panes, ['s1'])

  // The next drag no longer carries the previous Session.
  shell.fire('dragend', {})
  let secondClaim = false
  shell.fire('dragover', { target: pane, dataTransfer: transfer, preventDefault: () => { secondClaim = true } })
  assert.equal(secondClaim, false)
}

// --- dropping outside the workbench is never claimed ---------------------
{
  const shell = boot()
  const conversation = new FakeElement({}, null)
  const sidebarRow = new FakeElement({ 'data-row-key': 'session:s2' })
  const transfer = { data: new Map(), dropEffect: 'none', setData() {} }
  shell.fire('dragstart', { target: sidebarRow, dataTransfer: transfer })
  let prevented = false
  shell.fire('dragover', { target: conversation, dataTransfer: transfer, preventDefault: () => { prevented = true } })
  assert.equal(prevented, false, 'the Conversation page keeps the shipped reference drop')
  let dropped = false
  shell.fire('drop', { target: conversation, dataTransfer: transfer, preventDefault: () => { dropped = true }, stopPropagation: () => {} })
  assert.equal(dropped, false)
  assert.deepEqual(shell.layoutCalls, [])
}

// --- the openSession hook keeps an on-screen Session in the workbench -----
{
  const shell = boot()
  const workspace = shell.workspace
  shell.plugin.__internals.setPanes(['s1'])
  shell.layoutCalls.length = 0

  // What a desktop notification, a command, or another panel calls.
  workspace.openSession('s1')
  assert.deepEqual(shell.layoutCalls, ['session-split'], 'the workbench is shown')
  assert.deepEqual(shell.opened, [], 'the native Conversation is not opened')

  // A Session that is not a pane still opens natively.
  workspace.openSession('s2')
  assert.deepEqual(shell.opened, ['s2'])

  // The switch decides: off hands the pane's Session back to the caller.
  shell.plugin.__internals.setFollowOpened(false)
  workspace.openSession('s1')
  assert.deepEqual(shell.opened, ['s2', 's1'])

  // Unload restores the host method instead of leaving the hook behind.
  for (const cleanup of shell.effects) if (typeof cleanup === 'function') cleanup()
  assert.equal(workspace.openSession, shell.rawOpenSession, 'the host openSession is restored')
}

// --- a pane's ↗ reaches the shipped page, hook and all -------------------
{
  const shell = boot()
  const api = shell.plugin.__internals
  api.setPanes(['s1', 's2'])
  shell.layoutCalls.length = 0

  // The ↗ button must open its own Session on the Conversation page, not be
  // caught by the workbench's own "stay here" hook.
  api.openNative(shell.ctx, 's2')
  assert.deepEqual(shell.opened, ['s2'], 'the pane ↗ opens that Session natively')
  assert.deepEqual(shell.layoutCalls, [null], 'the workbench is left for the Conversation')
}

// --- a restored pane list is honored ------------------------------------
{
  // Persisted state is read when the module factory runs, before `apply`.
  const store = new Map([['dsh-session-split:v1', JSON.stringify({ panes: ['s1', 's2', 's1'] })]])
  const rendered = []
  const window = {
    __ModuleLoader__: { load: (entry) => rendered.push(entry) },
    localStorage: { getItem: (key) => (store.has(key) ? store.get(key) : null), setItem: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  const document = { createElement: () => ({ dataset: {}, textContent: '', remove() {} }), head: { append: () => {} } }
  const run = new Function('window', 'document', 'console', 'Element', SOURCE)
  run(window, document, console, FakeElement)
  const plugin = rendered[0].factory((id) => {
    if (id === 'react') return ReactStub
    throw new Error(`unexpected module: ${id}`)
  })
  // Normalization happens on read; a stale duplicate never renders twice.
  assert.deepEqual(plugin.__internals.normalizePanes(['s1', 's2', 's1']), ['s1', 's2'])
}

console.log('registration.test.mjs: all assertions passed')



