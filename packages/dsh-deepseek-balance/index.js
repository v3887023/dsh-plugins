/**
 * Host half of the DeepSeek balance bundle.
 *
 * Reads the DeepSeek official API key balance (`GET /user/balance`) with the
 * credential the official provider already uses, caches it briefly, and serves
 * the result to the Client half over one exact Web route. The API key never
 * reaches the browser, and the gateway is only asked for read-only numbers.
 */

const DEFAULTS = {
  /** API root; `/user/balance` is appended. */
  baseUrl: 'https://api.deepseek.com',
  /** Credential name holding the official API key. */
  apiKeyEnv: 'DEEPSEEK_API_KEY',
  /** Exact path the Client half reads. */
  path: '/deepseek-balance',
  /** Seconds a successful read is reused. */
  cacheSeconds: 30,
  /** Request timeout in milliseconds. */
  timeoutMs: 10000,
  /** Reference balance the percentage is measured against; null hides it. */
  baseline: null,
  /** Currency `baseline` is expressed in. */
  baselineCurrency: 'CNY',
}

export const inject = ['webServer']

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '')
}

function finiteOrNull(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

export function apply(ctx, config) {
  const options = { ...DEFAULTS, ...(config ?? {}) }
  const cacheMs = Math.max(0, Number(options.cacheSeconds) || 0) * 1000
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || DEFAULTS.timeoutMs)
  const endpoint = `${trimTrailingSlash(options.baseUrl)}/user/balance`
  const baseline = finiteOrNull(options.baseline)
  const baselineCurrency = String(options.baselineCurrency ?? DEFAULTS.baselineCurrency).toUpperCase()
  const logger = ctx.logger

  let cache
  let pending

  function warn(message) {
    if (logger !== undefined && typeof logger.warn === 'function') logger.warn(`deepseek-balance: ${message}`)
  }

  /** The official key: the credential store first, then the environment. */
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
    return { ok: false, fetchedAt: Date.now(), endpoint, baseline, baselineCurrency, code, message }
  }

  function summarize(body) {
    const infos = Array.isArray(body?.balance_infos) ? body.balance_infos : []
    const info = infos.find(entry => String(entry?.currency ?? '').toUpperCase() === baselineCurrency) ?? infos[0] ?? null
    if (info === null) {
      return failure('NO_BALANCE', 'DeepSeek 未返回余额信息（balance_infos 为空）。')
    }
    const currency = String(info.currency ?? baselineCurrency).toUpperCase()
    return {
      ok: true,
      fetchedAt: Date.now(),
      endpoint,
      isAvailable: body?.is_available === true,
      currency,
      total: finiteOrNull(info.total_balance),
      granted: finiteOrNull(info.granted_balance),
      toppedUp: finiteOrNull(info.topped_up_balance),
      baseline: currency === baselineCurrency ? baseline : null,
      baselineCurrency,
      baselineCurrencyMismatch: currency !== baselineCurrency,
    }
  }

  async function collect() {
    const key = await readKey()
    if (key === undefined) {
      return failure('NO_KEY', `没有找到 DeepSeek 凭据 ${String(options.apiKeyEnv)}。请在「设置 → 凭据」中保存 DeepSeek API Key（或设置环境变量同名声明的密钥）。`)
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(endpoint, {
        headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
        signal: controller.signal,
      })
      if (response.status === 401 || response.status === 403) {
        return failure('UNAUTHORIZED', `DeepSeek 拒绝了该密钥（HTTP ${response.status}），余额接口需要有效的官方 Key。`)
      }
      if (!response.ok) {
        return failure(`HTTP_${response.status}`, `DeepSeek 返回 HTTP ${response.status}。`)
      }
      return summarize(await response.json())
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return failure('TIMEOUT', `读取 DeepSeek 余额超时（${timeoutMs} 毫秒）。`)
      }
      return failure('NETWORK', `无法连接 DeepSeek：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      clearTimeout(timer)
    }
  }

  async function balance(fresh = false) {
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
      const payload = await balance(fresh)
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      response.end(JSON.stringify(payload))
    },
  }), 'deepseek-balance: balance route')
}
