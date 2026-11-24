/**
 * Host half of the desktop-notify bundle.
 *
 * The desktop shell has no completion reminder of its own: closing the window
 * hides it in the tray, and the only system notification in the whole product
 * announces a mandatory update. This Host plugin fills that gap with its own
 * desktop notification surface: a small always-on-top WPF card in the
 * bottom-right corner (see `notifier/desktop-notify.ps1`), drawn by a helper
 * process that the plugin spawns and feeds through a spool directory.
 *
 * Three Host events feed it:
 *
 * - `agent/status` — a running Agent going idle means a turn finished. A short
 *   delay lets a follow-up turn replace the notification instead of racing it.
 * - `approval/request` — a permission decision is waiting. The listener runs
 *   before the composed answerers (`prepend`), reports the request, then
 *   delegates through `next()` so the real decision path is untouched.
 * - `user-questions/request` — the agent asked a question; the same observe-and
 *   -delegate pattern applies.
 *
 * The notifier draws one card per Session — a newer event replaces that
 * Session's card — keeps completion cards for a while and waiting cards until
 * they are dismissed, and brings the window forward when a card is clicked.
 * Subagent sessions are skipped: their work reports through the parent session.
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'desktop-notify'

/** Where this package's notifier script lives. */
const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.join(HERE, 'notifier', 'desktop-notify.ps1')

/** Longest question excerpt placed on a card. */
const EXCERPT_LENGTH = 120

/** Card copy; the notifier itself carries no locale. */
const COPY = {
  session: '会话',
  completion: '本轮已完成，等待你的下一条消息',
  approval: '需要你的批准：{tool}',
  approvalPlain: '有一个操作在等你批准',
  question: '等你回答：{question}',
  questionPlain: 'Agent 在等你回答',
  plan: '计划已就绪，等你审阅',
}

/** Collapse a question onto one card-sized line. */
function excerpt(text) {
  const value = String(text).replace(/\s+/g, ' ').trim()
  return value.length <= EXCERPT_LENGTH ? value : `${value.slice(0, EXCERPT_LENGTH - 1)}…`
}

/** The Session a request or Agent event belongs to. */
function sessionOf(value) {
  return value?.agent?.session ?? value?.session
}

/** A Session's stable id. */
function sessionIdOf(agent) {
  return agent?.id ?? agent?.session?.id
}

/** Whether the Session is a subagent's private conversation. */
function isSubagent(session) {
  if (session === undefined || session === null) return false
  return session.header?.parentSession !== undefined || session.header?.origin === 'subagent'
}

/** Resolve a readable Session name, falling back to the project directory. */
function titleOf(ctx, session) {
  if (session === undefined || session === null) return COPY.session
  try {
    const projections = ctx.get('sessionProjections')
    const snapshot = projections?.snapshot?.(session, ['title'])
    const title = snapshot?.values?.title
    if (typeof title === 'string' && title.trim() !== '') return title
  } catch {
    // A composition without the projection service still gets the path name.
  }
  const cwd = session.header?.cwd
  if (typeof cwd === 'string' && cwd !== '') return path.basename(cwd)
  return COPY.session
}

/** Card body for one approval request. */
function approvalBody(request) {
  const tool = request?.toolName
  return typeof tool === 'string' && tool !== ''
    ? COPY.approval.replace('{tool}', tool)
    : COPY.approvalPlain
}

/** Card body for one question batch. */
function questionBody(request) {
  const questions = request?.questions
  if (!Array.isArray(questions) || questions.length === 0) return COPY.questionPlain
  if (questions.every((question) => question?.intent?.kind === 'plan-review')) return COPY.plan
  const text = questions[0]?.question
  return typeof text === 'string' && text.trim() !== ''
    ? COPY.question.replace('{question}', excerpt(text))
    : COPY.questionPlain
}

/**
 * @param ctx - Host plugin context.
 */
export function apply(ctx) {
  if (process.platform !== 'win32') return

  const root = process.env.DSH_DESKTOP_NOTIFY_QUEUE ?? path.join(os.tmpdir(), 'dsh-desktop-notify')
  const queueDir = path.join(root, 'queue')
  const doneDelay = Number(process.env.DSH_DESKTOP_NOTIFY_DONE_DELAY_MS ?? 1500)
  const spawnEnabled = process.env.DSH_DESKTOP_NOTIFY_NO_SPAWN !== '1'

  /** Running state last seen per Session, for the turn-completion edge. */
  const running = new Map()
  /** Completion notifiers kept cancellable until their delay elapses. */
  const pendingDone = new Map()
  /** Spool file sequence, keeping names unique within one millisecond. */
  let sequence = 0
  /** The notifier process, spawned lazily on the first card. */
  let notifier = null

  /** Start the WPF notifier if it is not already alive. */
  const ensureNotifier = () => {
    if (!spawnEnabled) return
    if (notifier !== null && notifier.exitCode === null) return
    fs.mkdirSync(queueDir, { recursive: true })
    const command = process.env.DSH_DESKTOP_NOTIFY_PWSH ?? 'pwsh'
    const args = [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Sta',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      SCRIPT,
      '-QueueDir',
      queueDir,
    ]
    const doneSeconds = process.env.DSH_DESKTOP_NOTIFY_DONE_SECONDS
    if (doneSeconds !== undefined && doneSeconds !== '') {
      const seconds = Number(doneSeconds)
      if (Number.isFinite(seconds) && seconds >= 0) args.push('-DoneSeconds', String(Math.trunc(seconds)))
    }
    if (process.env.DSH_DESKTOP_NOTIFY_MUTE === '1') args.push('-Mute')
    let child
    try {
      child = spawn(command, args, {
        windowsHide: true,
        // The notifier writes its own log, but a crash before the WPF app is up
        // only reaches stderr. Keep that in a file instead of dropping it.
        stdio: ['ignore', 'ignore', 'pipe'],
        detached: false,
      })
      if (child.stderr !== null && child.stderr !== undefined) {
        child.stderr.setEncoding('utf8')
        child.stderr.on('data', (chunk) => {
          try {
            fs.appendFileSync(path.join(root, 'notifier.err.log'), String(chunk))
          } catch {
            // A missing state directory is not worth losing the notifier over.
          }
        })
      }
    } catch (error) {
      console.warn('[desktop-notify] could not start the notifier:', error)
      return
    }
    child.on('error', (error) => {
      console.warn('[desktop-notify] notifier failed:', error)
      if (notifier === child) notifier = null
      // Windows PowerShell is the always-present fallback when pwsh is absent.
      if (error?.code === 'ENOENT' && command !== 'powershell.exe' && process.env.DSH_DESKTOP_NOTIFY_PWSH === undefined) {
        process.env.DSH_DESKTOP_NOTIFY_PWSH = 'powershell.exe'
        ensureNotifier()
      }
    })
    child.on('exit', () => {
      if (notifier === child) notifier = null
    })
    notifier = child
  }

  /**
   * Hand one card to the notifier through the spool directory.
   * @param payload - `{ kind, title, body, at }`.
   */
  const publish = (payload) => {
    try {
      fs.mkdirSync(queueDir, { recursive: true })
      ensureNotifier()
      sequence += 1
      const name = `n-${String(payload.at).padStart(13, '0')}-${String(sequence).padStart(4, '0')}.json`
      const file = path.join(queueDir, name)
      const temporary = `${file}.tmp`
      fs.writeFileSync(temporary, JSON.stringify(payload), 'utf8')
      fs.renameSync(temporary, file)
    } catch (error) {
      console.warn('[desktop-notify] could not queue a card:', error)
    }
  }

  /** Report one pending interaction without consuming it. */
  const observe = (request, body) => {
    try {
      const session = sessionOf(request)
      if (session === undefined || isSubagent(session)) return
      publish({ sessionId: session.id, kind: 'wait', title: titleOf(ctx, session), body, at: Date.now() })
    } catch (error) {
      console.warn('[desktop-notify] could not report the request:', error)
    }
  }

  ctx.on('agent/status', ({ agent, status }) => {
    if (agent === undefined) return
    const id = sessionIdOf(agent)
    if (id === undefined) return
    const isRunning = status === 'running'
    const wasRunning = running.get(id) === true
    running.set(id, isRunning)
    if (isRunning) {
      const timer = pendingDone.get(id)
      if (timer !== undefined) {
        clearTimeout(timer)
        pendingDone.delete(id)
      }
      return
    }
    if (!wasRunning) return
    const session = sessionOf(agent)
    if (isSubagent(session)) return
    const timer = setTimeout(() => {
      pendingDone.delete(id)
      publish({ sessionId: id, kind: 'done', title: titleOf(ctx, session), body: COPY.completion, at: Date.now() })
    }, doneDelay)
    pendingDone.set(id, timer)
  })

  ctx.on('approval/request', (request, next) => {
    observe(request, approvalBody(request))
    return next()
  }, true)

  ctx.on('user-questions/request', (request, next) => {
    observe(request, questionBody(request))
    return next()
  }, true)

  // The notifier writes the clicked Session id next to its spool; the browser
  // half reads it over this same-origin route and opens the Session. A card
  // click therefore lands on the conversation that asked for attention.
  const clickFile = path.join(root, 'click.json')
  const route = {
    kind: 'exact',
    path: '/desktop-notify/click',
    handler(req, res) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405).end()
        return
      }
      let payload = '{"sessionId":null}'
      try {
        if (fs.existsSync(clickFile)) {
          const parsed = JSON.parse(fs.readFileSync(clickFile, 'utf8'))
          const items = Array.isArray(parsed?.items) ? parsed.items.slice() : []
          if (items.length === 0 && typeof parsed?.sessionId === 'string') items.push({ sessionId: parsed.sessionId })
          const next = items.shift()
          if (items.length === 0) fs.rmSync(clickFile, { force: true })
          else fs.writeFileSync(clickFile, JSON.stringify({ items }), 'utf8')
          if (next !== undefined && typeof next.sessionId === 'string' && next.sessionId !== '') {
            payload = JSON.stringify({ sessionId: next.sessionId })
          }
        }
      } catch (error) {
        console.warn('[desktop-notify] could not read the click:', error)
      }
      res.writeHead(200, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      })
      res.end(payload)
    },
  }

  /**
   * Register the click route on the Host's Web server.
   *
   * The Web server is composed *after* this plugin, so `ctx.get('webServer')`
   * at apply time is undefined and the route would silently never exist — the
   * browser half then gets a 404 and a card click only raises the window.
   * `ctx.inject` waits for the service and registers the route when it appears.
   *
   * @param scope - Context to hang the effect on (it may outlive `ctx`).
   * @param webServer - The Web server service, if the scope carries one.
   */
  const mountClickRoute = (scope, webServer) => {
    if (webServer === undefined || webServer === null || typeof webServer.register !== 'function') return
    const register = () => webServer.register(route)
    if (typeof scope?.effect === 'function') scope.effect(register, 'desktop-notify: click route')
    else register()
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (web) => mountClickRoute(web, web?.webServer))
  } else {
    mountClickRoute(ctx, ctx.get('webServer'))
  }

  ctx.effect(() => () => {
    for (const timer of pendingDone.values()) clearTimeout(timer)
    pendingDone.clear()
    running.clear()
    const child = notifier
    notifier = null
    if (child !== null && child.exitCode === null) {
      try {
        child.kill()
      } catch {
        // The notifier already exited.
      }
    }
  }, 'desktop-notify: notifier process')
}
