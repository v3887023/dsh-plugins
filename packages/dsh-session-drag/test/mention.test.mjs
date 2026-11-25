// Behaviour test for the Session drag client half's reference codec.
//
// The browser bundle is one module whose rendering depends on the shell, so this
// test drives the parts that must be exactly right and are easy to get wrong
// offline: the canonical mention codec, label escaping, and the reference count
// the Host's per-message limit is enforced with.
//
// Run: node test/mention.test.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'

const SOURCE = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')

/** Minimal React stand-in: the factory only needs it to exist and to build elements. */
const react = {
  createElement: (type, props) => ({ type, props }),
  useState: (initial) => [initial, () => {}],
  useRef: (initial) => ({ current: initial }),
  useEffect: () => {},
}

let module = null
const window = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (timer) => clearTimeout(timer),
  __ModuleLoader__: {
    load(spec) {
      module = spec.factory((id) => {
        if (id === 'react') return react
        throw new Error(`unexpected module request: ${id}`)
      })
    },
  },
}

new Function('window', SOURCE)(window)

assert.ok(module !== null, 'the bundle registered itself')
assert.deepEqual(module.inject, ['slots', 'sessions', 'locale'])
assert.equal(typeof module.apply, 'function')

const { escapeLabel, encodeSessionUri, formatMention, countReferences, MAX_REFERENCES } = module.__internals

// --- canonical URI ---------------------------------------------------------

assert.equal(encodeSessionUri('s-1'), 'dsh-session:InMtMSI', 'ASCII ids use base64url without padding')

for (const id of ['会话-1', 'a b', 'x'.repeat(120), '"quoted"', 'id/with+chars']) {
  const expected = Buffer.from(JSON.stringify(id), 'utf8').toString('base64url')
  assert.equal(encodeSessionUri(id), `dsh-session:${expected}`, `round-trip spelling for ${JSON.stringify(id)}`)
}

// The payload must decode back through JSON, not be a plain base64 id.
assert.equal(JSON.parse(Buffer.from(encodeSessionUri('s-1').slice('dsh-session:'.length), 'base64url').toString('utf8')), 's-1')

// --- mention ---------------------------------------------------------------

assert.equal(formatMention('标题', 's-1'), '@[标题](dsh-session:InMtMSI)')
assert.equal(escapeLabel('a]b\\c'), 'a\\]b\\\\c', 'labels escape ] and \\')
assert.equal(formatMention('a]b', 's-1'), '@[a\\]b](dsh-session:InMtMSI)')

// --- reference counting ----------------------------------------------------

assert.equal(MAX_REFERENCES, 3)
assert.equal(countReferences(''), 0)
assert.equal(countReferences('随便聊聊，没有引用'), 0)
assert.equal(countReferences('@[甲](dsh-session:InMtMSI) 帮我看看'), 1)
assert.equal(countReferences('@[甲](dsh-session:InMtMSI) 和 dsh-session:InQU0x'), 2)
assert.equal(
  countReferences('@[甲](dsh-session:a) @[乙](dsh-session:b) @[丙](dsh-session:c)'),
  3,
  'three mentions are still under the limit',
)
assert.equal(countReferences('@[a](dsh-session:a) 加上 `code` 不算'), 1, 'prose never counts')

console.log('session-drag: mention codec and reference counting OK')
