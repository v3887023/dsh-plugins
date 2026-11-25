// Wiring test for the sidebar-plus client half, without the shell.
//
// It boots the real bundle against a stub Cordis context and a minimal DOM, then
// drives the things that decide whether the bundle works at all: which slot
// rows the plugin contributes, whether a menu pick lands as a chip (the shell's
// scoped input event) or falls back to the public text verb, and whether
// dragging a Session row onto a composer references it there.
//
// Run: node test/registration.test.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'

const SOURCE = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')

/** Collect the transient notices a boot writes into the page. */
const notices = []
/** Record the order of the gesture's steps, across boots. */
const events = []

/** Minimal element the plugin's `instanceof Element` checks accept. */
class FakeElement {
  constructor() {
    this.attributes = new Map()
    this.isConnected = true
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value ?? ''))
  }

  removeAttribute(name) {
    this.attributes.delete(name)
  }

  hasAttribute(name) {
    return this.attributes.has(name)
  }

  /** Minimal containment: an element contains itself, as the DOM does. */
  contains(node) {
    return node === this
  }

  /** No ancestor by default; rows, cards, and anchors override this. */
  closest() {
    return null
  }
}

/** A composer card: holds the editor host the pick focuses. */
function makeCard() {
  const card = new FakeElement()
  card.editor = {
    focus: () => {
      events.push('focus')
      card.focused = (card.focused ?? 0) + 1
    },
  }
  card.closest = (selector) => (selector === '[data-composer-card]' ? card : null)
  card.querySelector = (selector) => (selector === '[contenteditable="true"]' ? card.editor : null)
  return card
}

/** A sidebar row the drag starts on. */
function makeRowElement(sessionId) {
  const row = new FakeElement()
  row.attributes.set('data-row-key', `session:${sessionId}`)
  row.closest = (selector) => (selector === '[data-row-key]' ? row : null)
  return row
}

/** The drag event a synthetic settle would construct. */
globalThis.DragEvent = class DragEvent {
  constructor(type, init = {}) {
    this.type = type
    this.bubbles = init.bubbles === true
    this.cancelable = init.cancelable === true
    this.clientX = init.clientX ?? 0
    this.clientY = init.clientY ?? 0
    this.dataTransfer = init.dataTransfer ?? null
    this.defaultPrevented = false
  }

  preventDefault() {
    this.defaultPrevented = true
  }
}

/** A drag transfer that keeps its payload, like the browser one. */
function makeTransfer() {
  const payload = new Map()
  return {
    types: [],
    effectAllowed: 'move',
    dropEffect: 'none',
    setData(type, value) {
      if (!this.types.includes(type)) this.types.push(type)
      payload.set(type, value)
    },
    getData(type) {
      return payload.get(type) ?? ''
    },
  }
}

globalThis.Element = FakeElement

/** Computed style stub: elements opt in with `__style`, everything else is plain. */
globalThis.getComputedStyle = (node) => node?.__style ?? { overflowY: 'visible', getPropertyValue: () => '' }

/**
 * Boot one fresh copy of the bundle: module state (the composer seats) is per
 * bundle instance, exactly as it is per page.
 * @param options - fake shell behaviour: scoped-event answer, text-verb answer,
 * draft text, and the Session list.
 * @returns the booted plugin, its registrations, its windows, and helpers.
 */
function boot(options = {}) {
  const cleanups = []
  const registrations = new Map()
  const bailCalls = []
  const textInserts = []
  const listeners = new Map()
  const pending = []
  const rows = []
  let mountTarget = null

  /** A row the sidebar rendered, wired for the settle probe. */
  const makeRow = (sessionId) => {
    const row = makeRowElement(sessionId)
    row.dispatchEvent = (event) => {
      events.push('sidebar-settle')
      row.synthetic = event
    }
    row.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 20 })
    rows.push(row)
    return row
  }

  const runEffects = () => {
    for (const effect of pending.splice(0)) {
      const cleanup = effect()
      if (typeof cleanup === 'function') cleanups.push(cleanup)
    }
  }

  const react = {
    createElement: (type, props, ...children) => {
      if (props !== null && typeof props === 'object' && props.ref !== undefined && props.ref !== null) {
        props.ref.current = mountTarget
      }
      return { type, props: { ...props, children: children.length <= 1 ? children[0] : children } }
    },
    useState: (initial) => [initial, () => {}],
    useRef: (initial) => ({ current: initial }),
    // Effects run after the component returns, as React does, so a seat can read
    // the anchor its own render just assigned.
    useEffect: (fn) => {
      pending.push(fn)
    },
  }

  const sessions = {
    list: { getSnapshot: () => ({ byId: options.byId ?? {} }) },
    scope: (id) => ({
      bail(subject, name, payload) {
        events.push('insert-chip')
        bailCalls.push({ id, name, payload })
        return options.bailAnswer ?? true
      },
    }),
  }

  const actions = {
    captureInsertion: () => {
      events.push('capture')
      return { start: 4, end: 4, draftRev: 7 }
    },
    insertText: (text, span) => {
      events.push('insert-text')
      textInserts.push({ text, span })
      return options.textAnswer ?? true
    },
  }

  let module = null
  // The sidebar's persisted view record decides the order mode the lock reads.
  // `manual` is the default here: the reference gesture is what most of this
  // test drives, and a locked list would (correctly) refuse row hovers. The
  // same store holds the feature switches, so one harness covers both.
  const orderBy = options.orderBy ?? 'manual'
  const viewRecord = JSON.stringify({ groupBy: 'flat', orderBy, groupExpansion: {}, sessionOrderByAccount: {}, archivedFilter: 'default' })
  const storage = new Map([['dsh.workspace.view.v5', viewRecord]])
  const window = {
    localStorage: {
      get length() {
        return storage.size
      },
      key: (index) => [...storage.keys()][index] ?? null,
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => {
        storage.set(key, String(value))
      },
      removeItem: (key) => {
        storage.delete(key)
      },
    },
    setTimeout: (fn, ms) => {
      const timer = setTimeout(fn, ms)
      timer.unref?.()
      return timer
    },
    clearTimeout: (timer) => clearTimeout(timer),
    setInterval: () => 0,
    clearInterval: () => {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    addEventListener(type, handler) {
      const entry = listeners.get(type) ?? []
      entry.push(handler)
      listeners.set(type, entry)
    },
    removeEventListener(type, handler) {
      const entry = listeners.get(type) ?? []
      listeners.set(type, entry.filter((candidate) => candidate !== handler))
    },
    __ModuleLoader__: {
      load(spec) {
        module = spec.factory((id) => {
          if (id === 'react') return react
          throw new Error(`unexpected module request: ${id}`)
        })
      },
    },
  }

  const document = {
    body: { append: (element) => notices.push(element.textContent) },
    head: { append: () => {} },
    createElement: () => ({ dataset: {}, style: {}, textContent: '', remove: () => {}, setAttribute() {} }),
    querySelector: () => null,
    querySelectorAll: (selector) => (selector === '[data-row-key]' ? rows : []),
  }
  globalThis.document = document

  new Function('window', 'document', SOURCE)(window, document)

  const locale = {
    register: () => () => {},
    getSnapshot: () => ({ active: options.locale ?? 'zh' }),
  }

  const ctx = {
    get(name) {
      return name === 'locale' ? locale : name === 'sessions' ? sessions : undefined
    },
    effect(fn) {
      const cleanup = fn()
      if (typeof cleanup === 'function') cleanups.push(cleanup)
      return cleanup
    },
    locale,
    slots: {
      inject(key, contribute) {
        const cleanup = contribute()
        return typeof cleanup === 'function' ? cleanup : () => {}
      },
      register(descriptor, component) {
        registrations.set(descriptor.name, { descriptor, component })
        return () => registrations.delete(descriptor.name)
      },
    },
  }

  module.apply(ctx)

  const state = { draft: options.draft ?? '', phase: 'plain' }

  return {
    module,
    registrations,
    bailCalls,
    textInserts,
    cleanups,
    options,
    storage,
    /**
     * Mount the seat the composer renders for one Session.
     * @returns the card that composer lives in.
     */
    mountSeat(sessionId, card = makeCard(), inputActions = actions) {
      const seat = registrations.get('conversation.input.overlay')
      assert.ok(seat !== undefined, 'the overlay seat is registered')
      mountTarget = new FakeElement()
      mountTarget.isConnected = true
      mountTarget.closest = (selector) => (selector === '[data-composer-card]' ? card : null)
      pending.length = 0
      seat.component({ sessionId, inputActions, useInput: (selector) => selector(state) })
      runEffects()
      return card
    },
    /** Render the sidebar row the menu would show for one Session. */
    renderRow(sessionId, displayTitle = sessionId) {
      const row = registrations.get('sidebar.workspaces.session.menu.item')
      assert.ok(row !== undefined, 'the menu row is registered')
      const dismissed = []
      const element = row.component({
        sessionId,
        displayTitle,
        useMenuOpenState: () => [true, (open) => dismissed.push(open)],
        t: (key) => key,
      })
      return { element, dismissed }
    },
    /** Dispatch one synthetic DOM event through the plugin's listeners. */
    dispatch(type, event) {
      const payload = { defaultPrevented: false, propagated: false, ...event }
      payload.preventDefault = payload.preventDefault ?? function preventDefault() { this.defaultPrevented = true }
      payload.stopPropagation = payload.stopPropagation ?? function stopPropagation() { this.propagated = true }
      for (const handler of listeners.get(type) ?? []) handler(payload)
      return payload
    },
    makeCard,
    makeRow,
    makeTransfer,
  }
}

// --- registrations ---------------------------------------------------------

const shell = boot({ byId: { a: { id: 'a', title: '会话 A', retainedBy: { mainView: 1 } }, b: { id: 'b', title: '会话 B', retainedBy: {} } } })
assert.equal(shell.module.name, 'sidebar-plus')
assert.deepEqual(shell.module.inject, ['slots', 'locale', 'sessions'])

const seat = shell.registrations.get('conversation.input.overlay')
assert.equal(seat.descriptor.id, 'sidebar-plus-seat')
const row = shell.registrations.get('sidebar.workspaces.session.menu.item')
assert.equal(row.descriptor.id, 'sidebar-plus-row')
assert.equal(row.descriptor.locale, 'sidebarPlus')

const mention = (label, id) => `@[${label}](dsh-session:${Buffer.from(JSON.stringify(id), 'utf8').toString('base64url')})`

// --- the row follows the composer's presence -------------------------------

assert.equal(shell.renderRow('b').element, null, 'no composer yet: the row is hidden')
shell.mountSeat('a')
assert.equal(shell.renderRow('a').element, null, 'the current conversation offers no reference to itself')

const offered = shell.renderRow('b', '会话 B')
assert.notEqual(offered.element, null)
assert.equal(offered.element.type, 'button', 'the primitive is optional, a plain menuitem works')
assert.equal(offered.element.props.children, 'row.insert')

// --- a pick lands as a chip, synchronously ---------------------------------

events.length = 0
offered.element.props.onClick()
assert.deepEqual(offered.dismissed, [false], 'the menu dismisses before the insert')
assert.deepEqual(events, ['capture', 'focus', 'capture', 'insert-chip'])
assert.equal(shell.bailCalls.length, 1, 'one scoped insert dispatch')
assert.equal(shell.bailCalls[0].name, 'slash/input-insert-reference')
assert.equal(shell.bailCalls[0].id, 'a', 'the dispatch runs on the composer Session scope')
assert.deepEqual(shell.bailCalls[0].payload.span, { start: 4, end: 4, draftRev: 7 })
assert.equal(shell.bailCalls[0].payload.reference.appearance, 'session')
assert.equal(shell.bailCalls[0].payload.reference.ref, mention('会话 B', 'b'))
assert.equal(shell.bailCalls[0].payload.reference.clipboardText, mention('会话 B', 'b'))
assert.equal(shell.textInserts.length, 0, 'no fallback when the chip applied')
assert.equal(notices.length, 0, 'a successful pick says nothing')

// --- fallback: the scoped event answered nothing ---------------------------

const fallback = boot({ byId: shell.options.byId, bailAnswer: false })
fallback.mountSeat('a')
fallback.renderRow('b', '会话 B').element.props.onClick()
assert.equal(fallback.bailCalls.length, 1, 'the chip path was attempted first')
assert.equal(fallback.textInserts.length, 1, 'then the public text verb')
assert.equal(fallback.textInserts[0].text, `${mention('会话 B', 'b')} `, 'the mention plus a trailing space')

// --- labels never come out empty -------------------------------------------

const labels = boot({ byId: { a: { id: 'a', title: 'A', retainedBy: { mainView: 1 } }, b: { id: 'b', title: '列表标题', retainedBy: {} } } })
labels.mountSeat('a')
labels.renderRow('b', '').element.props.onClick()
assert.equal(labels.bailCalls[0].payload.reference.ref, mention('列表标题', 'b'), 'an untitled row falls back to the list title')

const untitled = boot({ byId: { a: { id: 'a', title: 'A', retainedBy: { mainView: 1 } }, b: { id: 'b', retainedBy: {} } } })
untitled.mountSeat('a')
untitled.renderRow('b', '').element.props.onClick()
assert.equal(untitled.bailCalls[0].payload.reference.ref, mention('b', 'b'), 'and then to the id')

// --- a menu left open across a conversation switch still refuses a self-pick

const stale = boot({ byId: { a: { id: 'a', title: 'A', retainedBy: { mainView: 1 } }, b: { id: 'b', title: 'B', retainedBy: {} } } })
stale.mountSeat('a')
stale.mountSeat('b')
const pendingRow = stale.renderRow('b', 'B')
assert.notEqual(pendingRow.element, null, 'a non-current row is offered')
stale.options.byId = { a: { id: 'a', title: 'A', retainedBy: {} }, b: { id: 'b', title: 'B', retainedBy: { mainView: 1 } } }
pendingRow.element.props.onClick()
assert.equal(stale.bailCalls.length, 0, 'the pick re-resolves the target and refuses')
assert.equal(notices.pop(), '不能引用当前对话本身')

// --- the Host limit is enforced before anything is inserted ----------------

const full = boot({
  byId: { a: { id: 'a', title: 'A', retainedBy: { mainView: 1 } }, b: { id: 'b', title: 'B', retainedBy: {} } },
  draft: '@[甲](dsh-session:a) @[乙](dsh-session:b) @[丙](dsh-session:c)',
})
full.mountSeat('a')
full.renderRow('b').element.props.onClick()
assert.equal(full.bailCalls.length, 0, 'a fourth reference is refused')
assert.equal(full.textInserts.length, 0)
assert.equal(notices.pop(), '一条消息最多引用 3 个对话')

// --- drag: a Session row dropped on a composer references it there ---------

const drag = boot({ byId: { a: { id: 'a', title: '会话 A', retainedBy: { mainView: 1 } }, b: { id: 'b', title: '会话 B', retainedBy: {} } } })
const card = drag.mountSeat('a')
const transfer = drag.makeTransfer()
const rowB = drag.makeRow('b')
const settles = () => events.filter((event) => event === 'sidebar-settle').length

const start = drag.dispatch('dragstart', { target: rowB, dataTransfer: transfer })
assert.equal(start.propagated, false, 'a dragstart is never swallowed: the sidebar still reorders')
assert.ok(transfer.types.includes('application/x-dsh-session-ref'), 'the drag is tagged for the composer')
drag.dispatch('dragstart', { target: rowB, dataTransfer: transfer })
assert.equal(transfer.effectAllowed, 'copyMove', 'the row effect is widened so a copy cursor is legal')
assert.equal(settles(), 0, 'nothing is pinned while the drag is still inside the sidebar')

const over = drag.dispatch('dragover', { target: card, dataTransfer: transfer })
assert.equal(over.defaultPrevented, true, 'the composer accepts the drop')
assert.equal(transfer.dropEffect, 'copy')
assert.equal(card.hasAttribute('data-dsh-session-ref-drop'), true, 'the card is highlighted')
assert.equal(settles(), 1, 'leaving the sidebar pins the pending reorder to the dragged row')
assert.equal(rowB.synthetic?.type, 'dragover', 'the pin is the row hover the sidebar itself listens for')

drag.dispatch('dragover', { target: card, dataTransfer: transfer })
assert.equal(settles(), 1, 'and it is pinned once per exit, not on every dragover')

const drop = drag.dispatch('drop', { target: card, dataTransfer: transfer })
assert.equal(drop.defaultPrevented, true)
assert.equal(drop.propagated, true, 'the composer gets the drop instead of inserting the row text')
assert.equal(settles(), 2, 'the drop pins it once more, covering a drag that never reported a dragover')
assert.equal(drag.bailCalls.length, 1)
assert.equal(drag.bailCalls[0].id, 'a', 'the drop target composer receives the reference')
assert.equal(drag.bailCalls[0].payload.reference.ref, mention('会话 B', 'b'))
assert.equal(card.hasAttribute('data-dsh-session-ref-drop'), false, 'the highlight is cleared')

// --- drag: dropping anywhere in the conversation references it -------------

const surface = new FakeElement()
surface.__style = { overflowY: 'auto', getPropertyValue: () => '' }
const message = new FakeElement()
surface.contains = (node) => node === message

const wide = boot({ byId: { a: { id: 'a', title: '会话 A', retainedBy: { mainView: 1 } }, b: { id: 'b', title: '会话 B', retainedBy: {} } } })
const wideCard = wide.mountSeat('a')
wideCard.parentElement = surface
const wideTransfer = wide.makeTransfer()
wide.dispatch('dragstart', { target: wide.makeRow('b'), dataTransfer: wideTransfer })

const overMessage = wide.dispatch('dragover', { target: message, dataTransfer: wideTransfer })
assert.equal(overMessage.defaultPrevented, true, 'the transcript accepts the drop, not just the input box')
assert.equal(wideCard.hasAttribute('data-dsh-session-ref-drop'), true, 'the composer it feeds is highlighted')

const dropMessage = wide.dispatch('drop', { target: message, dataTransfer: wideTransfer })
assert.equal(dropMessage.propagated, true)
assert.equal(wide.bailCalls.length, 1, 'the reference lands in that conversation')
assert.equal(wide.bailCalls[0].payload.reference.ref, mention('会话 B', 'b'))

// --- drag: a row dragged over its own conversation is refused --------------

const self = boot({ byId: { a: { id: 'a', title: 'A', retainedBy: { mainView: 1 } }, b: { id: 'b', title: 'B', retainedBy: {} } } })
const selfCard = self.mountSeat('a')
const selfTransfer = self.makeTransfer()
self.dispatch('dragstart', { target: self.makeRow('a'), dataTransfer: selfTransfer })
const refused = self.dispatch('dragover', { target: selfCard, dataTransfer: selfTransfer })
assert.equal(refused.defaultPrevented, false, 'a self-reference is never accepted')

// --- drag: unrelated text drags keep their own behavior -------------------

const text = boot({ byId: { a: { id: 'a', title: 'A', retainedBy: { mainView: 1 } } } })
const textCard = text.mountSeat('a')
const prose = text.makeTransfer()
prose.setData('text/plain', 'some dragged prose')
const proseOver = text.dispatch('dragover', { target: textCard, dataTransfer: prose })
assert.equal(proseOver.defaultPrevented, false, 'prose is not claimed by the Session target')

// --- an unexpected shell error still explains itself -----------------------

const broken = boot({ byId: { a: { id: 'a', retainedBy: { mainView: 1 } }, b: { id: 'b', title: 'B', retainedBy: {} } } })
const throwing = {
  captureInsertion: () => { throw new Error('editor gone') },
  insertText: () => { throw new Error('editor gone') },
}
broken.mountSeat('a', makeCard(), throwing)
const warn = console.warn
console.warn = () => {}
broken.renderRow('b').element.props.onClick()
console.warn = warn
assert.equal(notices.pop(), '没能把这个对话插入输入框', 'a throwing editor reports instead of failing silently')

// --- locked list: the reorder drop is refused, the reference still works ----

events.length = 0
const locked = boot({
  byId: { a: { id: 'a', title: 'A', retainedBy: { mainView: 1 } }, b: { id: 'b', title: 'B', retainedBy: {} } },
  orderBy: 'updated',
})
const lockedCard = locked.mountSeat('a')
const lockedTransfer = locked.makeTransfer()
const lockedRowB = locked.makeRow('b')
const lockedRowC = locked.makeRow('c')

locked.dispatch('dragstart', { target: lockedRowB, dataTransfer: lockedTransfer })
const refusedHover = locked.dispatch('dragover', { target: lockedRowC, dataTransfer: lockedTransfer })
assert.equal(refusedHover.defaultPrevented, false, 'a row hover is never accepted on a locked list')
assert.equal(refusedHover.propagated, true, 'the row handler never arms an insertion marker')
assert.equal(lockedTransfer.dropEffect, 'none', 'the pointer reports the refusal')

const lockedOverCard = locked.dispatch('dragover', { target: lockedCard, dataTransfer: lockedTransfer })
assert.equal(lockedOverCard.defaultPrevented, true, 'a locked list still references on a conversation')
assert.equal(lockedCard.hasAttribute('data-dsh-session-ref-drop'), true, 'the composer is highlighted')
locked.dispatch('dragover', { target: lockedRowC, dataTransfer: lockedTransfer })
assert.equal(lockedCard.hasAttribute('data-dsh-session-ref-drop'), false, 'the highlight clears when the pointer returns to the list')
assert.equal(settles(), 0, 'a locked list pins no sidebar marker')

// A row drop under the lock is claimed as a backstop, even without a hover.
const lockedRowDrop = locked.dispatch('drop', { target: lockedRowC, dataTransfer: lockedTransfer })
assert.equal(lockedRowDrop.defaultPrevented, true, 'a row drop never reaches the order write')
assert.equal(lockedRowDrop.propagated, true)
assert.equal(locked.bailCalls.length, 0, 'and it inserts nothing')

// Back on a conversation the same drag still references; the lock only refuses
// the list.
locked.dispatch('dragstart', { target: lockedRowB, dataTransfer: lockedTransfer })
const lockedDrop = locked.dispatch('drop', { target: lockedCard, dataTransfer: lockedTransfer })
assert.equal(lockedDrop.defaultPrevented, true)
assert.equal(locked.bailCalls.length, 1, 'the reference still lands')
assert.equal(settles(), 0, 'and the lock keeps the sidebar out of the drop')

// --- the Settings page switches each feature on its own --------------------

const prefsBoot = boot({ byId: { a: { id: 'a', title: 'A', retainedBy: { mainView: 1 } } } })
const section = prefsBoot.registrations.get('settings.section')
assert.ok(section !== undefined, 'the Settings section is registered')
assert.equal(section.descriptor.id, 'sidebar-plus')
const rowsOf = (element) => element.props.children.filter(
  (child) => child !== null && child !== undefined && child.props !== undefined && child.props.className === 'dsh-sbp-row',
)
const page = section.component({ close: () => {} })
const rows = rowsOf(page)
assert.equal(rows.length, 4, 'one switch per feature')
const switchOf = (row) => row.props.children[1]
assert.equal(switchOf(rows[0]).props['aria-checked'], 'true', 'features default on')
assert.equal(switchOf(rows[0]).props.role, 'switch')

switchOf(rows[0]).props.onClick()
const saved = JSON.parse(prefsBoot.storage.get('dsh.sidebar-plus.v1'))
assert.equal(saved.dateGroups, false, 'the click persists the switch')
assert.equal(saved.sessionDrag, true, 'and leaves every other switch alone')
assert.equal(saved.sortLock, true)
assert.equal(saved.folderDrop, true)

const rerendered = rowsOf(section.component({ close: () => {} }))
assert.equal(switchOf(rerendered[0]).props['aria-checked'], 'false', 'the page reads the stored value back')

// Turning the reference off hides its menu row without touching the others.
prefsBoot.mountSeat('a')
assert.notEqual(prefsBoot.renderRow('b').element, null, 'with the switch on the row is offered')
prefsBoot.module.__internals.updatePrefs({ sessionDrag: false })
assert.equal(prefsBoot.renderRow('b').element, null, 'the menu row is gone once the switch is off')

// --- unloading releases the gesture and the seats -------------------------

for (const cleanup of shell.cleanups) cleanup()
assert.equal(shell.renderRow('b').element, null, 'after unload the row has no target to offer')

console.log('sidebar-plus: slots, menu pick, drag gesture, and failure paths OK')
