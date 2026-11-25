/**
 * Host half of the LiteLLM usage bundle.
 *
 * Reads the LiteLLM proxy's own key-usage facts (`GET /key/info`) with the
 * credential the model provider already uses, caches them briefly, and serves
 * the result to the Client half over one exact Web route. The proxy key never
 * reaches the browser.
 */

const DEFAULTS = {
  /** LiteLLM proxy root; `/key/info` is appended. */
  baseUrl: '',
  /** Credential name holding the proxy virtual key. */
  apiKeyEnv: 'LITELLM_API_KEY',
  /** Exact path the Client half reads. */
  path: '/litellm-usage',
  /** Seconds a successful read is reused. */
  cacheSeconds: 20,
  /** Request timeout in milliseconds. */
  timeoutMs: 10000,
}

export const inject = ['webServer']

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '')
}

function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function apply(ctx, config) {
  const options = { ...DEFAULTS, ...(config ?? {}) }
  const cacheMs = Math.max(0, Number(options.cacheSeconds) || 0) * 1000
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || DEFAULTS.timeoutMs)
  const endpoint = `${trimTrailingSlash(options.baseUrl)}/key/info`
  const logger = ctx.logger

  let cache
  let pending

  function warn(message) {
    if (logger !== undefined && typeof logger.warn === 'function') logger.warn(`litellm-usage: ${message}`)
  }

  /** The proxy virtual key: an explicit config value, the credential store, then the environment. */
  async function readKey() {
    if (typeof options.apiKey === 'string' && options.apiKey.length > 0) return options.apiKey
    const credentials = ctx.get('credentials')
    if (credentials !== undefined && credentials !== null && typeof credentials.resolve === 'function') {
      try {
        const hit = await credentials.resolve(options.apiKeyEnv)
        if (hit !== undefined && hit !== null && typeof hit.value === 'string' && hit.value.length > 0) return hit.value
      } catch (error) {
        warn(`credential lookup failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    const fromEnv = process.env[options.apiKeyEnv]
    if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv
    return undefined
  }

  function failure(code, message) {
    return { ok: false, fetchedAt: Date.now(), endpoint, code, message }
  }

  /**
   * LiteLLM only reports `budget_reset_at` when the budget row carries one; a
   * plain `1 week` budget leaves it empty. The window boundary is the next
   * Monday 00:00 in the Host's time zone, which is what the LiteLLM portal
   * shows as "11/16 00:00 重置".
   */
  const RESET_UTC_OFFSET_HOURS = 8

  function deriveWeeklyReset(period) {
    if (period !== 'week') return null
    const offsetMs = Math.max(-12, Math.min(14, Number(options.resetUtcOffsetHours ?? RESET_UTC_OFFSET_HOURS))) * 3600 * 1000
    // Work on the wall clock of the fixed offset, then map the boundary back to UTC.
    const wall = new Date(Date.now() + offsetMs)
    const daysUntilMonday = (1 - wall.getUTCDay() + 7) % 7 || 7
    const boundaryWall = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + daysUntilMonday, 0, 0, 0, 0)
    return new Date(boundaryWall - offsetMs).toISOString()
  }

  function summarize(body) {
    const info = body !== null && typeof body === 'object' && body.info !== null && typeof body.info === 'object' ? body.info : {}
    const budgets = Array.isArray(info.budgets) ? info.budgets : []
    const primary = budgets.find(budget => budget !== null && typeof budget === 'object' && budget.period === 'week')
      ?? budgets.find(budget => budget !== null && typeof budget === 'object')
      ?? null
    const reported = info.budget_reset_at ?? primary?.reset_at ?? primary?.budget_reset_at ?? null
    const reportedReset = typeof reported === 'string' || typeof reported === 'number' ? reported : null
    const derivedReset = reportedReset === null ? deriveWeeklyReset(typeof primary?.period === 'string' ? primary.period : null) : null
    return {
      ok: true,
      fetchedAt: Date.now(),
      endpoint,
      alias: typeof info.key_alias === 'string' && info.key_alias.length > 0 ? info.key_alias : null,
      spend: finiteOrNull(info.spend),
      maxBudget: finiteOrNull(info.max_budget),
      resetAt: reportedReset ?? derivedReset,
      resetDerived: reportedReset === null && derivedReset !== null,
      budget: primary === null ? null : {
        period: typeof primary.period === 'string' ? primary.period : null,
        limit: finiteOrNull(primary.limit),
        spent: finiteOrNull(primary.spent),
        remaining: finiteOrNull(primary.remaining),
        reserved: finiteOrNull(primary.reserved),
      },
    }
  }

  async function collect() {
    if (typeof options.baseUrl !== 'string' || options.baseUrl.length === 0) {
      return failure('NO_CONFIG', '还没有配置 LiteLLM 地址：请在插件配置里设置 baseUrl，并把 apiKeyEnv 指向保存该代理密钥的凭据名。')
    }
    const key = await readKey()
    if (key === undefined) {
      return failure('NO_KEY', `没有找到 LiteLLM 凭据 ${String(options.apiKeyEnv)}，请先在设置中保存该密钥。`)
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(endpoint, {
        headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
        signal: controller.signal,
      })
      if (response.status === 401 || response.status === 403) {
        return failure('UNAUTHORIZED', `LiteLLM 拒绝了该密钥（HTTP ${response.status}），用量接口需要有效的虚拟 Key。`)
      }
      if (!response.ok) {
        return failure(`HTTP_${response.status}`, `LiteLLM 返回 HTTP ${response.status}。`)
      }
      const body = await response.json()
      return summarize(body)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return failure('TIMEOUT', `读取 LiteLLM 用量超时（${timeoutMs} 毫秒）。`)
      }
      return failure('NETWORK', `无法连接 LiteLLM：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      clearTimeout(timer)
    }
  }

  async function usage(fresh = false) {
    const now = Date.now()
    if (fresh !== true && cache !== undefined && now - cache.at < cacheMs) return cache.payload
    if (pending !== undefined) return pending
    const started = collect().then((payload) => {
      if (payload.ok) cache = { at: Date.now(), payload }
      return payload
    })
    pending = started
    try {
      return await started
    } finally {
      if (pending === started) pending = undefined
    }
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: options.path,
    handler: async (request, response) => {
      let fresh = false
      try {
        fresh = new URL(request.url ?? '/', 'http://localhost').searchParams.get('fresh') === '1'
      } catch {
        fresh = false
      }
      const payload = await usage(fresh)
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      response.end(JSON.stringify(payload))
    },
  }), 'litellm-usage: usage route')
}
