/**
 * Client half of the Session sort-lock bundle.
 *
 * The sidebar's viewing store keeps one of two orders: "Manual" or "Last
 * updated". Dropping a Session on another Session writes a manual layout and
 * switches the store to "Manual", so a single drag silently replaces a "Last
 * updated" choice the user just made. This plugin holds "Last updated" to its
 * promise: while that mode is stored, a Session drag may still start (it is
 * also how a Session is dragged onto the composer to be referenced) but it can
 * no longer be dropped anywhere in the Session list.
 *
 * The list publishes no seat for reorderability, so the refusal happens at the
 * window's capture phase: `dragover` and `drop` over a Session row are claimed
 * and stopped before the row's own handlers run, which is what keeps the drag
 * from reaching the order write. The refusal is deliberately silent — the
 * pointer already reports it, and a notice would also fire for a drag that only
 * passes over the list on its way to the composer. The row is recognized by the
 * stable `data-row-key="session:<id>"` attribute, and the mode is read from the
 * same browser record the sidebar persists (`dsh.workspace.view.v<generation>`),
 * so neither a generated class name nor a menu label is involved.
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-session-sort-lock',
  factory() {
    /** Prefix shared by every persisted generation of the sidebar viewing store. */
    const STORE_PREFIX = 'dsh.workspace.view.'
    /** Stable attribute the Session list puts on each draggable Session row. */
    const SESSION_ROW = '[data-row-key^="session:"]'
    /** Order mode that keeps no manual layout; also the product default. */
    const UPDATED = 'updated'

    /**
     * Read the order mode the sidebar last persisted.
     *
     * The store writes one record per browser under
     * `dsh.workspace.view.v<generation>`, so the newest generation wins and an
     * absent or unreadable record falls back to the product default. The
     * generation is discovered rather than hard-coded so a shell upgrade that
     * bumps the version keeps the lock working.
     * @param storage - the page's `localStorage`, or undefined when unavailable.
     * @returns `'updated'` or `'manual'`.
     */
    function orderModeOf(storage) {
      if (storage === undefined || storage === null) return UPDATED
      let length = 0
      try {
        length = storage.length
      } catch {
        return UPDATED
      }
      let best = null
      for (let index = 0; index < length; index += 1) {
        let key = null
        try {
          key = storage.key(index)
        } catch {
          continue
        }
        if (typeof key !== 'string' || !key.startsWith(STORE_PREFIX)) continue
        const generation = /^v(\d+)/.exec(key.slice(STORE_PREFIX.length))
        const version = generation === null ? 0 : Number(generation[1])
        if (best !== null && version < best.version) continue
        let record = null
        try {
          record = JSON.parse(storage.getItem(key) ?? 'null')
        } catch {
          continue
        }
        const mode = record !== null && typeof record === 'object' ? record.orderBy : undefined
        if (mode !== 'manual' && mode !== UPDATED) continue
        // Prefer the newest generation; within it prefer the plain record over a per-account suffix.
        if (best === null || version > best.version || (version === best.version && key.length < best.key.length)) best = { version, key, mode }
      }
      return best === null ? UPDATED : best.mode
    }

    /**
     * Mount the drop refusal for the whole plugin lifetime.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      /** The Session drag in flight, or null when no Session row started one. */
      let drag = null

      /**
       * Resolve the Session row containing a drag target.
       * @param target - the event's deepest target.
       * @returns the row element, or null outside a Session row.
       */
      const rowOf = (target) => (target instanceof Element ? target.closest(SESSION_ROW) : null)

      /** Read the persisted mode, tolerating a storage that refuses access. */
      const modeNow = () => {
        try {
          return orderModeOf(window.localStorage)
        } catch {
          return UPDATED
        }
      }

      const onDragStart = (event) => {
        drag = null
        if (rowOf(event.target) === null) return
        // The row's own `dragstart` still runs: the drag is what drags a Session
        // onto the composer. Only a drop over the Session list is refused below.
        drag = { locked: modeNow() === UPDATED }
      }

      const onDragOver = (event) => {
        const active = drag
        if (active === null || !active.locked) return
        if (rowOf(event.target) === null) return
        // Claim the hover without accepting it: the row's own handler never arms
        // an insertion marker, and an unaccepted dragover means the browser fires
        // no drop here, so the row's order write cannot run.
        event.stopPropagation()
        if (event.dataTransfer !== null && event.dataTransfer !== undefined) event.dataTransfer.dropEffect = 'none'
      }

      const onDrop = (event) => {
        const active = drag
        if (active === null || !active.locked) return
        if (rowOf(event.target) === null) return
        // Backstop for a drop another ancestor accepted: stopping it here still
        // keeps the row's order write from running.
        event.preventDefault()
        event.stopPropagation()
      }

      const onDragEnd = () => {
        drag = null
      }

      ctx.effect(() => {
        window.addEventListener('dragstart', onDragStart, true)
        window.addEventListener('dragover', onDragOver, true)
        window.addEventListener('drop', onDrop, true)
        window.addEventListener('dragend', onDragEnd, true)
        return () => {
          window.removeEventListener('dragstart', onDragStart, true)
          window.removeEventListener('dragover', onDragOver, true)
          window.removeEventListener('drop', onDrop, true)
          window.removeEventListener('dragend', onDragEnd, true)
          drag = null
        }
      }, 'session-sort-lock: drop refusal')
    }

    return {
      name: 'session-sort-lock',
      apply,
    }
  },
})
