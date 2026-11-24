// Behaviour test for the desktop-notify Host half: the spool payloads it hands
// to the notifier, and the event edges that produce them.
// Run: node test/host.test.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { apply } from '../index.js'

/**
 * Apply the Host plugin to a fake context with an isolated spool directory.
 * @returns the harness.
 */
function createHarness() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-notify-host-'))
  process.env.DSH_DESKTOP_NOTIFY_QUEUE = root
  process.env.DSH_DESKTOP_NOTIFY_NO_SPAWN = '1'
  process.env.DSH_DESKTOP_NOTIFY_DONE_DELAY_MS = '20'

  const handlers = new Map()
  const effects = []
  const routes = []
  const webServer = {
    register(route) {
      routes.push(route)
      return () => {}
    },
  }
  const ctx = {
    on(name, handler, prepend) {
      handlers.set(name, { handler, prepend })
      return () => {}
    },
    effect(fn) {
      effects.push(fn())
    },
    get(name) {
      return name === 'webServer' ? webServer : undefined
    },
    // The real Host composes its Web server after this plugin, so the plugin
    // registers the click route through `inject` rather than `get`.
    inject(names, callback) {
      if (!names.includes('webServer')) return () => {}
      callback({ webServer, effect: (fn) => { effects.push(fn()) } })
      return () => {}
    },
  }
  apply(ctx)

  const queueDir = path.join(root, 'queue')
  return {
    ctx,
    handlers,
    effects,
    routes,
    root,
    queueDir,
    cards() {
      if (!fs.existsSync(queueDir)) return []
      return fs.readdirSync(queueDir)
        .filter((name) => name.endsWith('.json'))
        .sort()
        .map((name) => JSON.parse(fs.readFileSync(path.join(queueDir, name), 'utf8')))
    },
    dispose() {
      for (const dispose of effects) dispose()
      effects.length = 0
      fs.rmSync(root, { recursive: true, force: true })
    },
  }
}

/** A Session stub with the fields the plugin reads. */
function makeSession(id, cwd = 'G:\\work\\demo') {
  return { id, header: { cwd } }
}

/** An Agent stub owning one Session. */
function makeAgent(id, cwd) {
  return { id, session: makeSession(id, cwd) }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// 1. An approval request becomes one waiting card and still delegates.
{
  const harness = createHarness()
  const { handler } = harness.handlers.get('approval/request')
  let delegated = 0
  const result = await handler({ agent: makeAgent('s1'), toolName: 'Bash' }, () => {
    delegated += 1
    return Promise.resolve('allowed')
  })
  assert.equal(result, 'allowed')
  assert.equal(delegated, 1)

  const cards = harness.cards()
  assert.equal(cards.length, 1)
  assert.equal(cards[0].kind, 'wait')
  assert.equal(cards[0].sessionId, 's1')
  assert.equal(cards[0].title, 'demo')
  assert.match(cards[0].body, /Bash/)
  harness.dispose()
}

// 2. A question is excerpted onto the card.
{
  const harness = createHarness()
  const { handler } = harness.handlers.get('user-questions/request')
  await handler({
    agent: makeAgent('s1', 'G:\\work\\builder'),
    questions: [{ id: 'q1', question: 'A'.repeat(400) }],
  }, () => Promise.resolve(null))

  const [card] = harness.cards()
  assert.equal(card.kind, 'wait')
  assert.equal(card.sessionId, 's1')
  assert.equal(card.title, 'builder')
  assert.match(card.body, /等你回答/)
  assert.ok(card.body.length < 200)
  harness.dispose()
}

// 3. A plan review gets its own copy.
{
  const harness = createHarness()
  const { handler } = harness.handlers.get('user-questions/request')
  await handler({
    agent: makeAgent('s1'),
    questions: [{ id: 'q1', question: 'plan', intent: { kind: 'plan-review' } }],
  }, () => Promise.resolve(null))

  assert.match(harness.cards()[0].body, /计划/)
  harness.dispose()
}

// 4. Running → idle publishes a completion card after the settle delay.
{
  const harness = createHarness()
  const { handler } = harness.handlers.get('agent/status')
  handler({ agent: makeAgent('s1'), status: 'running' })
  handler({ agent: makeAgent('s1'), status: 'idle' })
  await sleep(80)

  const cards = harness.cards()
  assert.equal(cards.length, 1)
  assert.equal(cards[0].kind, 'done')
  assert.equal(cards[0].sessionId, 's1')
  assert.match(cards[0].body, /本轮已完成/)
  harness.dispose()
}

// 5. A follow-up turn inside the settle delay cancels the completion card.
{
  const harness = createHarness()
  const { handler } = harness.handlers.get('agent/status')
  handler({ agent: makeAgent('s1'), status: 'running' })
  handler({ agent: makeAgent('s1'), status: 'idle' })
  handler({ agent: makeAgent('s1'), status: 'running' })
  await sleep(80)

  assert.equal(harness.cards().length, 0)
  harness.dispose()
}

// 6. Subagent sessions report through their parent and never notify.
{
  const harness = createHarness()
  const worker = { id: 'child', session: { id: 'child', header: { cwd: 'G:\\work\\demo', parentSession: 's1' } } }
  const { handler } = harness.handlers.get('agent/status')
  handler({ agent: worker, status: 'running' })
  handler({ agent: worker, status: 'idle' })
  await sleep(80)

  assert.equal(harness.cards().length, 0)

  const approval = harness.handlers.get('approval/request').handler
  await approval({ agent: worker, toolName: 'Bash' }, () => Promise.resolve('allowed'))
  assert.equal(harness.cards().length, 0)
  harness.dispose()
}

// 7. Both observers are registered ahead of the composed answerers.
{
  const harness = createHarness()
  assert.equal(harness.handlers.get('approval/request').prepend, true)
  assert.equal(harness.handlers.get('user-questions/request').prepend, true)
  harness.dispose()
}

// 8. Unloading cancels a completion that has not fired yet.
{
  const harness = createHarness()
  const { handler } = harness.handlers.get('agent/status')
  handler({ agent: makeAgent('s1'), status: 'running' })
  handler({ agent: makeAgent('s1'), status: 'idle' })
  harness.dispose()
  await sleep(80)

  assert.equal(fs.existsSync(harness.queueDir), false)
}

// 9. Recorded card clicks come back over the click route, one per request.
{
  const harness = createHarness()
  const route = harness.routes.find((candidate) => candidate.path === '/desktop-notify/click')
  assert.ok(route, 'expected the click route to be registered')

  const ask = () => {
    const response = { code: 0, body: '' }
    route.handler({ method: 'GET' }, {
      writeHead(code) {
        response.code = code
        return this
      },
      end(body) {
        response.body = body ?? ''
      },
    })
    return JSON.parse(response.body).sessionId
  }

  fs.writeFileSync(path.join(harness.root, 'click.json'), JSON.stringify({
    items: [{ sessionId: 's1' }, { sessionId: 's2' }],
  }), 'utf8')
  assert.equal(ask(), 's1')
  assert.equal(ask(), 's2')
  assert.equal(ask(), null)
  assert.equal(fs.existsSync(path.join(harness.root, 'click.json')), false)

  // The single-click shape written by older notifiers still works.
  fs.writeFileSync(path.join(harness.root, 'click.json'), JSON.stringify({ sessionId: 's3' }), 'utf8')
  assert.equal(ask(), 's3')
  assert.equal(ask(), null)
  harness.dispose()
}

console.log('desktop-notify (host): all checks passed')

