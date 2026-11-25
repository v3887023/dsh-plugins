// Behaviour test for the sidebar-plus feature switches.
//
// The switches are the one piece of state this bundle owns, so they are tested
// on their own: defaults, a partially written record, unreadable storage,
// persistence, and the notification a Settings page relies on.
//
// Run: node test/prefs.test.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'

const SOURCE = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const KEY = 'dsh.sidebar-plus.v1'

/** Boot one fresh copy of the bundle over a fake storage. */
function boot(entries = {}) {
  const map = new Map(Object.entries(entries))
  const listeners = new Map()

  const window = {
    localStorage: {
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
    },
    addEventListener(type, handler) {
      const entry = listeners.get(type) ?? []
      entry.push(handler)
      listeners.set(type, entry)
    },
    removeEventListener(type, handler) {
      listeners.set(type, (listeners.get(type) ?? []).filter((candidate) => candidate !== handler))
    },
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
  }

  let loaded = null
  window.__ModuleLoader__ = {
    load(definition) {
      loaded = definition
    },
  }

  const react = {
    createElement: () => null,
    useRef: (initial) => ({ current: initial }),
    useEffect: () => {},
    useState: (initial) => [initial, () => {}],
  }

  new Function('window', SOURCE)(window)
  assert.ok(loaded !== null, 'the bundle registered itself')
  assert.equal(loaded.id, '@v3887023/dsh-sidebar-plus')
  const module = loaded.factory((id) => {
    if (id === 'react') return react
    throw new Error(`unexpected module request: ${id}`)
  })

  return { module, map, window }
}

// --- defaults ---------------------------------------------------------------

{
  const { module } = boot()
  assert.deepEqual({ ...module.__internals.PREF_DEFAULTS }, { dateGroups: true, sessionDrag: true, sortLock: true, folderDrop: true })
  assert.deepEqual({ ...module.__internals.readPrefs() }, { dateGroups: true, sessionDrag: true, sortLock: true, folderDrop: true })
  assert.equal(module.__internals.PREFS_KEY, KEY)
}

// --- a written record wins, field by field ----------------------------------

{
  const { module } = boot({ [KEY]: JSON.stringify({ sortLock: false }) })
  const prefs = module.__internals.readPrefs()
  assert.equal(prefs.sortLock, false, 'a stored switch is read')
  assert.equal(prefs.dateGroups, true, 'an absent switch keeps its default')
  assert.equal(prefs.sessionDrag, true)
  assert.equal(prefs.folderDrop, true)
}

// --- unreadable or foreign records fall back to defaults --------------------

for (const stored of ['not json', 'null', '[]', '"off"', JSON.stringify({ dateGroups: 'no' })]) {
  const { module } = boot({ [KEY]: stored })
  const prefs = module.__internals.readPrefs()
  assert.equal(prefs.dateGroups, true, `a record of ${stored} keeps every switch on`)
  assert.equal(prefs.folderDrop, true)
}

// A page that refuses storage still yields the defaults.
{
  const { module } = boot()
  const original = module.__internals.readPrefs
  assert.equal(typeof original, 'function')
  // A boot whose window has no localStorage at all.
  const bare = boot()
  delete bare.window.localStorage
  assert.deepEqual({ ...bare.module.__internals.readPrefs() }, { dateGroups: true, sessionDrag: true, sortLock: true, folderDrop: true })
}

// --- writes persist and notify ---------------------------------------------

{
  const { module, map } = boot()
  const notifications = []
  const off = module.__internals.subscribePrefs(() => notifications.push(true))
  assert.equal(typeof off, 'function')

  module.__internals.updatePrefs({ dateGroups: false })
  const stored = JSON.parse(map.get(KEY))
  assert.equal(stored.dateGroups, false, 'the change is persisted')
  assert.equal(stored.sortLock, true, 'and leaves the others on')
  assert.deepEqual({ ...module.__internals.readPrefs() }, { dateGroups: false, sessionDrag: true, sortLock: true, folderDrop: true })
  assert.equal(notifications.length, 1, 'a listener is called once per change')

  // A second change merges rather than replacing the record.
  module.__internals.updatePrefs({ folderDrop: false })
  const merged = JSON.parse(map.get(KEY))
  assert.equal(merged.dateGroups, false)
  assert.equal(merged.folderDrop, false)
  assert.equal(merged.sessionDrag, true)
  assert.equal(notifications.length, 2)

  off()
  module.__internals.updatePrefs({ sortLock: false })
  assert.equal(notifications.length, 2, 'a removed listener is not called')
  assert.equal(JSON.parse(map.get(KEY)).sortLock, false, 'but the change still persists')
}

console.log('sidebar-plus: feature switches OK')
