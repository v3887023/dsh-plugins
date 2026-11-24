/**
 * Browser half of the desktop-notify bundle.
 *
 * The desktop cards are drawn by the Host-side notifier, which cannot navigate
 * the app. When a card is clicked it records the Session id and then raises the
 * Harness window; this half reads that id over the Host's same-origin
 * `/desktop-notify/click` route and opens the Session. Focusing the window is
 * what wakes this half up, so the jump usually happens immediately; a slow poll
 * covers the case where the window was already in front when the card closed.
 *
 * Everything here is read-only: one route fetch, one navigation call. A failure
 * to parse or a Host restart simply waits for the next tick.
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-desktop-notify',
  factory() {
    /** Same-origin route owned by the Host half. */
    const ENDPOINT = '/desktop-notify/click'
    /**
     * Fallback poll for a click that arrives while the window is already
     * focused. Two seconds keeps the worst case close to "instant" without
     * hammering the Host (the route is cheap, but every tab would poll).
     */
    const POLL_MS = 2000

    /**
     * Mount the click bridge.
     * @param ctx - client root context carrying uiWorkspace.
     */
    function apply(ctx) {
      const uiWorkspace = ctx.uiWorkspace
      let disposed = false
      let busy = false
      let timer = 0

      /** Ask the Host for one pending click and open that Session. */
      const take = async () => {
        if (disposed || busy) return
        busy = true
        try {
          const response = await fetch(ENDPOINT, { cache: 'no-store' })
          if (!response.ok) return
          const data = await response.json()
          const sessionId = data?.sessionId
          if (typeof sessionId !== 'string' || sessionId === '') return
          if (typeof uiWorkspace?.openSession !== 'function') return
          uiWorkspace.openSession(sessionId)
        } catch {
          // A closing window or a restarting Host: the next tick retries.
        } finally {
          busy = false
        }
      }

      ctx.effect(() => {
        const onFocus = () => {
          void take()
        }
        const onVisibility = () => {
          if (document.visibilityState === 'visible') void take()
        }
        window.addEventListener('focus', onFocus)
        document.addEventListener('visibilitychange', onVisibility)
        timer = window.setInterval(take, POLL_MS)
        void take()
        return () => {
          disposed = true
          window.removeEventListener('focus', onFocus)
          document.removeEventListener('visibilitychange', onVisibility)
          window.clearInterval(timer)
        }
      }, 'desktop-notify: click bridge')
    }

    return {
      name: 'desktop-notify',
      inject: ['uiWorkspace'],
      apply,
    }
  },
})
