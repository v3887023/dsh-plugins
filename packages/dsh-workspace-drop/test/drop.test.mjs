// Behaviour test for the sidebar folder-drop client half, with a minimal DOM.
// Run: node test/drop.test.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const MARKER = '--dsh-sidebar-inline-padding'
const SOURCE = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')

class FakeElement {
  constructor(tag) {
    this.tagName = tag
    this.childNodes = []
    this.parentElement = null
    this.attributes = new Map()
    this.style = { cssText: '' }
    this.dataset = {}
    this.textContent = ''
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parentElement = this
      this.childNodes.push(node)
    }
  }

  remove() {
    const parent = this.parentElement
    if (parent === null) return
    parent.childNodes = parent.childNodes.filter((node) => node !== this)
    this.parentElement = null
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

  contains(node) {
    for (let current = node; current != null; current = current.parentElement) {
      if (current === this) return true
    }
    return false
  }

  get isConnected() {
    return this.parentElement !== null
  }
}

function createHarness() {
  const listeners = new Map()
  const effects = []
  const created = []
  const started = []
  const notices = []

  const window = {
    addEventListener(type, handler) {
      const entry = listeners.get(type) ?? []
      entry.push(handler)
      listeners.set(type, entry)
    },
    removeEventListener(type, handler) {
      const entry = listeners.get(type) ?? []
      listeners.set(type, entry.filter((candidate) => candidate !== handler))
    },
    setTimeout: (fn, ms) => {
      const timer = setTimeout(fn, ms)
      timer.unref?.()
      return timer
    },
    clearTimeout: (timer) => clearTimeout(timer),
    dispatchEvent(event) {
      for (const handler of listeners.get(event.type) ?? []) handler(event)
      return true
    },
  }

  const documentElement = new FakeElement('html')
  const head = new FakeElement('head')
  const body = new FakeElement('body')
  documentElement.append(head)
  documentElement.append(body)

  const document = {
    head,
    body,
    documentElement,
    createElement: (tag) => {
      const element = new FakeElement(tag)
      if (tag === 'div') notices.push(element)
      return element
    },
  }

  const sidebar = new FakeElement('div')
  body.append(sidebar)
  const sidebarChild = new FakeElement('div')
  sidebar.append(sidebarChild)
  sidebar.__sidebar = true

  const outside = new FakeElement('div')
  body.append(outside)

  const getComputedStyle = (node) => ({
    getPropertyValue(name) {
      if (name !== MARKER) return ''
      for (let current = node; current != null; current = current.parentElement) {
        if (current.__sidebar === true) return '8px'
      }
      return ''
    },
  })

  let loaded
  window.__ModuleLoader__ = {
    load(definition) {
      loaded = definition
    },
  }

  const ctx = {
    effect(fn) {
      effects.push(fn())
    },
    locale: {
      register: () => () => {},
      bind: (ns) => (key, values) => `${ns}.${key}${values?.message === undefined ? '' : `:${values.message}`}`,
    },
    workspaces: {
      async create(input) {
        created.push(input)
        return { workspaceId: 'ws-created' }
      },
    },
    uiWorkspace: {
      startSession: (workspaceId) => {
        started.push(workspaceId)
      },
    },
  }

  const context = vm.createContext({
    window,
    document,
    Element: FakeElement,
    Event: class FakeEvent {
      constructor(type) {
        this.type = type
      }
    },
    getComputedStyle,
    console,
    setTimeout,
    clearTimeout,
    queueMicrotask,
  })
  vm.runInContext(SOURCE, context)
  assert.equal(loaded?.id, '@local/dsh-workspace-drop')
  const plugin = loaded.factory(() => {
    throw new Error('no runtime requires')
  })
  assert.deepEqual(Array.from(plugin.inject), ['locale', 'workspaces', 'uiWorkspace'])
  plugin.apply(ctx)

  const event = (type, target, overrides = {}) => {
    const result = {
      type,
      target,
      defaultPrevented: false,
      propagationStopped: false,
      preventDefault() {
        result.defaultPrevented = true
      },
      stopPropagation() {
        result.propagationStopped = true
      },
      ...overrides,
    }
    return result
  }

  const transfer = (files, directories) => ({
    types: ['Files'],
    dropEffect: 'none',
    files,
    items: files.map((file, index) => ({
      kind: 'file',
      webkitGetAsEntry: () => ({ isDirectory: directories.includes(index) }),
    })),
  })

  const dispatch = (type, target, dataTransfer) => {
    const subject = event(type, target, { dataTransfer })
    for (const handler of listeners.get(type) ?? []) handler(subject)
    return subject
  }

  return {
    ctx,
    window,
    document,
    sidebar,
    sidebarChild,
    outside,
    created,
    started,
    notices,
    listeners,
    effects,
    transfer,
    dispatch,
    dispose() {
      for (const dispose of effects) dispose()
    },
    setBridge(bridge) {
      context.__DSH_HOST_PATHS__ = bridge
    },
  }
}

const tick = () => new Promise((resolve) => setImmediate(resolve))

// 1. A folder hovering the sidebar is claimed, outlined, and the page mask hidden.
{
  const harness = createHarness()
  harness.setBridge({ pathFor: () => 'D:\\work\\demo' })
  let shellResets = 0
  harness.window.addEventListener('dragend', () => {
    shellResets += 1
  })
  const drag = harness.transfer([{}], [0])
  const over = harness.dispatch('dragover', harness.sidebarChild, drag)
  assert.equal(over.defaultPrevented, true, 'folder drag over the sidebar is claimed')
  assert.equal(over.propagationStopped, false, 'the shell keeps its own drag lifecycle')
  assert.equal(drag.dropEffect, 'copy')
  assert.equal(harness.sidebar.hasAttribute('data-dsh-workspace-drop'), true)
  assert.equal(harness.document.documentElement.hasAttribute('data-dsh-workspace-dragging'), true)

  const drop = harness.dispatch('drop', harness.sidebarChild, drag)
  assert.equal(drop.defaultPrevented, true)
  assert.equal(drop.propagationStopped, true)
  await tick()
  assert.equal(harness.created.length, 1)
  assert.equal(harness.created[0].path, 'D:\\work\\demo')
  assert.deepEqual(harness.started, ['ws-created'])
  assert.equal(shellResets, 1, 'the suppressed shell drag state is released')
  assert.equal(harness.sidebar.hasAttribute('data-dsh-workspace-drop'), false)
  assert.equal(harness.document.documentElement.hasAttribute('data-dsh-workspace-dragging'), false)
  harness.dispose()
}

// 2. An ordinary file dropped on the sidebar keeps the shell's own behavior.
{
  const harness = createHarness()
  harness.setBridge({ pathFor: () => 'D:\\work\\note.txt' })
  const drag = harness.transfer([{}], [])
  harness.dispatch('dragover', harness.sidebarChild, drag)
  const drop = harness.dispatch('drop', harness.sidebarChild, drag)
  assert.equal(drop.defaultPrevented, false, 'file drops still reach the shell')
  assert.equal(drop.propagationStopped, false)
  await tick()
  assert.deepEqual(harness.created, [])
  assert.deepEqual(harness.started, [])
  harness.dispose()
}

// 3. A folder dropped outside the sidebar is left alone.
{
  const harness = createHarness()
  harness.setBridge({ pathFor: () => 'D:\\work\\demo' })
  const drag = harness.transfer([{}], [0])
  const over = harness.dispatch('dragover', harness.outside, drag)
  assert.equal(over.defaultPrevented, false)
  assert.equal(harness.sidebar.hasAttribute('data-dsh-workspace-drop'), false)
  const drop = harness.dispatch('drop', harness.outside, drag)
  assert.equal(drop.defaultPrevented, false)
  await tick()
  assert.deepEqual(harness.created, [])
  harness.dispose()
}

// 4. Without the Desktop bridge the gesture is not claimed at all.
{
  const harness = createHarness()
  const drag = harness.transfer([{}], [0])
  const over = harness.dispatch('dragover', harness.sidebarChild, drag)
  assert.equal(over.defaultPrevented, false, 'web keeps the shell behavior')
  const drop = harness.dispatch('drop', harness.sidebarChild, drag)
  assert.equal(drop.defaultPrevented, false)
  harness.dispose()
}

// 5. A Host refusal surfaces as a notice and changes nothing.
{
  const harness = createHarness()
  harness.setBridge({ pathFor: () => 'D:\\work\\demo' })
  harness.ctx.workspaces.create = async () => {
    throw new Error('workspace/invalid-path: not a directory')
  }
  harness.dispatch('drop', harness.sidebarChild, harness.transfer([{}], [0]))
  await tick()
  await tick()
  assert.deepEqual(harness.started, [])
  assert.equal(harness.notices.length, 1)
  assert.match(harness.notices[0].textContent, /invalid-path/)
  harness.dispose()
}

// 6. Cleanup removes every listener, style, and decoration.
{
  const harness = createHarness()
  harness.setBridge({ pathFor: () => 'D:\\work\\demo' })
  harness.dispatch('dragover', harness.sidebarChild, harness.transfer([{}], [0]))
  harness.dispose()
  assert.equal((harness.listeners.get('dragover') ?? []).length, 0)
  assert.equal((harness.listeners.get('drop') ?? []).length, 0)
  assert.equal(harness.sidebar.hasAttribute('data-dsh-workspace-drop'), false)
  assert.equal(harness.document.head.childNodes.length, 0)
}

console.log('workspace-drop client: 6 scenarios passed')
