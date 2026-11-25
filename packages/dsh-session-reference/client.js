/**
 * Client half of the session-reference bundle.
 *
 * Adds one row, "引用到当前对话", to a Session's sidebar context menu. Picking
 * it inserts the same atomic Session reference the `@` completion inserts into
 * the currently open composer: the chip carries the canonical
 * `@[label](dsh-session:…)` mention, and the Host turns that mention into a
 * bounded, read-only snapshot of the referenced Session when the message is
 * sent.
 *
 * Two facts drive the design:
 *
 * 1. The composer is a shell-owned Lexical editor. A reference chip is an
 *    atomic node, not text, and the only public insertion verbs accept plain
 *    text — so the chip path borrows the shell's own scoped input events
 *    (`slash/input-insert-reference`), which is exactly what the `@` pick calls.
 *    That dispatch answers `true` only when the shell applied the edit, so a
 *    failed dispatch falls back to the public `inputActions.insertText` verb:
 *    the submitted message still resolves, it just shows the mention as text
 *    while it is still a draft.
 *
 * 2. `inputActions` is a Session-scoped standard prop, not a service, and the
 *    sidebar menu is root-scoped. A null-rendering seat registered into
 *    `conversation.input.overlay` therefore records each mounted composer's
 *    action face, keyed by its Session; the menu row resolves the current
 *    conversation from that registry.
 *
 * Nothing is added to the page except the menu row and, on failure, one
 * transient notice; everything is removed by the plugin's effects on unload.
 */

window.__ModuleLoader__.load({
  id: '@v3887023/dsh-session-reference',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /**
     * Primitives are a baseline browser module. A host that does not expose the
     * row primitive degrades to a plain `role="menuitem"` button rather than
     * failing to load the plugin.
     */
    const primitives = (() => {
      try {
        return require('@deepseek-ai/dsh-client-ui-primitives')
      } catch {
        return null
      }
    })()
    const MenuItemButton = primitives !== null && typeof primitives.MenuItemButton === 'function'
      ? primitives.MenuItemButton
      : null

    /** Locale namespace owned by this plugin. */
    const NS = 'sessionReference'
    /** The Host rejects more than three distinct Session references in one message. */
    const MAX_REFERENCES = 3
    /** How long a failure notice stays on screen. */
    const TOAST_MS = 4000

    /** Chinese copy. */
    const zh = {
      'row.insert': '引用到当前对话',
      'toast.self': '不能引用当前对话本身',
      'toast.limited': '一条消息最多引用 {max} 个对话',
      'toast.noComposer': '当前对话的输入框还没准备好',
      'toast.failed': '没能把这个对话插入输入框',
    }
    /** English copy. */
    const en = {
      'row.insert': 'Reference in current chat',
      'toast.self': 'The current chat cannot reference itself',
      'toast.limited': 'A message can reference at most {max} chats',
      'toast.noComposer': 'The current chat has no composer ready',
      'toast.failed': 'Could not insert the reference into the composer',
    }

    /** One mounted composer's insertion face, keyed by its Session. */
    const seats = new Map()

    /** Live client root context, published by `apply` for the slot components. */
    const ctxRef = { current: null }

    /**
     * Escape a mention label the way the Host's mention formatter does.
     * @param label - raw Session title.
     * @returns the label with `\` and `]` escaped.
     */
    function escapeLabel(label) {
      return String(label).replace(/[\\\]]/gu, (match) => `\\${match}`)
    }

    /**
     * Encode a Session id as its canonical reference URI payload.
     * @param sessionId - opaque Session id.
     * @returns `dsh-session:<base64url of the JSON string>`.
     */
    function encodeSessionUri(sessionId) {
      const bytes = new TextEncoder().encode(JSON.stringify(String(sessionId)))
      let binary = ''
      for (const byte of bytes) binary += String.fromCharCode(byte)
      const encoded = btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
      return `dsh-session:${encoded}`
    }

    /**
     * Render a canonical Session mention.
     * @param label - Session title used as the visible label.
     * @param sessionId - the Session to reference.
     * @returns `@[label](dsh-session:…)`.
     */
    function formatMention(label, sessionId) {
      return `@[${escapeLabel(label)}](${encodeSessionUri(sessionId)})`
    }

    /**
     * Count the Session references already carried by a draft.
     * @param draft - the composer's plain-text draft projection.
     * @returns how many mentions it holds.
     */
    function countReferences(draft) {
      if (typeof draft !== 'string' || draft === '') return 0
      const wire = /@\[(?:\\.|[^\\\]])*\]\(dsh-session:[^)\s]+\)|dsh-session:[A-Za-z0-9_-]+/gu
      let count = 0
      while (wire.exec(draft) !== null) count += 1
      return count
    }

    /**
     * Resolve one key against the locale service, falling back to local copy.
     * @param ctx - client root context.
     * @param key - dictionary key.
     * @param params - optional `{name}` substitutions.
     * @returns localized text.
     */
    function translate(ctx, key, params) {
      const locale = ctx.get('locale')
      let dictionary = en
      let bound = null
      if (locale !== undefined && locale !== null) {
        const active = typeof locale.getSnapshot === 'function'
          ? String(locale.getSnapshot().active ?? '')
          : ''
        dictionary = active.toLowerCase().startsWith('zh') ? zh : en
        if (typeof locale.bind === 'function') {
          try {
            bound = locale.bind(NS)
          } catch {
            bound = null
          }
        }
      }
      let template = dictionary[key] ?? en[key] ?? key
      if (bound !== null) {
        const value = bound(key)
        if (typeof value === 'string' && value !== '' && value !== key) template = value
      }
      if (params === undefined || params === null) return template
      return template.replace(/\{(\w+)\}/gu, (match, name) => (name in params ? String(params[name]) : match))
    }

    /** One transient failure notice at a time. */
    let toast = null
    let toastTimer = 0

    /** Remove the transient notice. */
    function hideToast() {
      window.clearTimeout(toastTimer)
      toastTimer = 0
      if (toast !== null) toast.remove()
      toast = null
    }

    /**
     * Show a transient notice over the page.
     * @param text - already-localized message.
     */
    function notify(text) {
      hideToast()
      if (typeof document === 'undefined' || document.body === null) return
      const element = document.createElement('div')
      element.setAttribute('role', 'status')
      element.textContent = text
      element.style.cssText = [
        'position:fixed',
        'left:50%',
        'bottom:40px',
        'transform:translateX(-50%)',
        'z-index:2147483000',
        'max-width:min(560px,80vw)',
        'padding:10px 14px',
        'border-radius:10px',
        'border:.5px solid rgba(255,255,255,.14)',
        'background:var(--dsw-specific-menu,#22262e)',
        'color:var(--dsw-alias-label-primary,#f5f5f7)',
        'box-shadow:0 10px 28px rgba(0,0,0,.32)',
        'font-size:13px',
        'line-height:20px',
        'pointer-events:none',
      ].join(';')
      document.body.append(element)
      toast = element
      toastTimer = window.setTimeout(hideToast, TOAST_MS)
    }

    /**
     * The Session the main conversation column is showing.
     *
     * The Session list publishes `retainedBy.mainView` for exactly the Session
     * its main occurrence holds, which is the same fact the shell's own
     * Session adapter reads when it publishes the main binding.
     *
     * @param ctx - client root context.
     * @returns the current Session id, or undefined when nothing is open.
     */
    function mainSessionId(ctx) {
      const sessions = ctx.get('sessions')
      if (sessions === undefined || sessions === null) return undefined
      const state = sessions.list !== undefined && typeof sessions.list.getSnapshot === 'function'
        ? sessions.list.getSnapshot()
        : undefined
      const byId = state !== undefined && state !== null ? state.byId : undefined
      if (byId === undefined || byId === null) return undefined
      for (const summary of Object.values(byId)) {
        if (summary === undefined || summary === null) continue
        const retained = summary.retainedBy
        if (retained === undefined || retained === null) continue
        if ((retained.mainView ?? 0) > 0) return summary.id
      }
      return undefined
    }

    /**
     * The conversation the main column is showing: the Session whose composer a
     * reference must land in, and the one a menu row must never offer as its own
     * reference.
     *
     * @param ctx - client root context.
     * @returns the current Session id, or undefined when nothing is open.
     */
    function currentSessionId(ctx) {
      const id = mainSessionId(ctx)
      if (id !== undefined) return id
      // No main retention to read (older Host, or a transition): a single mounted
      // composer is unambiguous, more than one is not worth guessing.
      if (seats.size !== 1) return undefined
      const [only] = seats.keys()
      return only
    }

    /**
     * Resolve the composer the reference must land in.
     * @param ctx - client root context.
     * @returns `{sessionId, seat}`, or undefined when no composer is mounted.
     */
    function resolveTarget(ctx) {
      const id = currentSessionId(ctx)
      if (id === undefined) return undefined
      const seat = seats.get(id)
      return seat === undefined ? undefined : { sessionId: id, seat }
    }

    /**
     * The title a mention should carry: the row's own title, else the Session
     * title the list projects, else the id. A mention never carries an empty
     * label.
     *
     * @param ctx - client root context.
     * @param sessionId - Session being referenced.
     * @param rowTitle - the sidebar row's display title.
     * @returns a non-empty label.
     */
    function labelFor(ctx, sessionId, rowTitle) {
      if (typeof rowTitle === 'string' && rowTitle.trim() !== '') return rowTitle
      const sessions = ctx.get('sessions')
      const state = sessions !== undefined && sessions !== null && typeof sessions.list?.getSnapshot === 'function'
        ? sessions.list.getSnapshot()
        : undefined
      const summary = state !== undefined && state !== null && state.byId !== undefined
        ? state.byId[sessionId]
        : undefined
      const title = summary !== undefined && summary !== null ? summary.title : undefined
      if (typeof title === 'string' && title.trim() !== '') return title
      return String(sessionId)
    }

    /**
     * Build the reference the composer should receive.
     *
     * The mention is assembled locally: `@[label](dsh-session:…)` is the Host's
     * own canonical spelling, and the Host parses it back when the message is
     * sent. Asking the Host's resolver first would put a retained-Session round
     * trip in front of a gesture whose label the sidebar already shows — and a
     * round trip that never settles would swallow the gesture entirely.
     *
     * @param ctx - client root context.
     * @param sessionId - Session being referenced.
     * @param rowTitle - the sidebar row's display title.
     * @returns the reference insertion payload.
     */
    function referenceFor(ctx, sessionId, rowTitle) {
      const label = labelFor(ctx, sessionId, rowTitle)
      const ref = formatMention(label, sessionId)
      return { source: 'reference', ref, label, appearance: 'session', clipboardText: ref }
    }

    /**
     * Put one reference into the composer: the atomic chip first, plain text as
     * the fallback.
     *
     * The chip path needs a span carrying the shell's draft revision, which is
     * The span is captured by the caller before the composer is focused, so
     * focusing cannot change where the chip lands.
     *
     * @param ctx - client root context.
     * @param currentId - Session whose composer receives the reference.
     * @param seat - that composer's action face.
     * @param reference - reference insertion payload.
     * @param span - insertion span captured before the focus change.
     * @returns `'chip'`, `'text'`, or `'failed'`.
     */
    function applyReference(ctx, currentId, seat, reference, span) {
      const sessions = ctx.get('sessions')
      const scope = sessions !== undefined && sessions !== null && typeof sessions.scope === 'function'
        ? sessions.scope(currentId)
        : undefined
      if (scope !== undefined && scope !== null && typeof scope.bail === 'function') {
        try {
          if (scope.bail(scope, 'slash/input-insert-reference', { reference, span }) === true) return 'chip'
        } catch (error) {
          console.warn('[session-reference] scoped insert failed:', error)
        }
      }
      try {
        if (seat.actions.insertText(`${reference.ref} `, span) === true) return 'text'
      } catch (error) {
        console.warn('[session-reference] text insert failed:', error)
      }
      return 'failed'
    }

    /**
     * Insert the referenced Session into the current conversation.
     *
     * Everything here is synchronous on purpose: the gesture must either land or
     * explain itself before the menu closes. No Host round trip sits in front of
     * the edit, so there is no state in which a pick silently does nothing.
     *
     * @param ctx - client root context.
     * @param sessionId - Session being referenced.
     * @param label - that Session's row title, when the gesture had one.
     * @param explicitTarget - the composer a drop landed on; the menu pick
     * resolves the current conversation instead.
     */
    function insertReference(ctx, sessionId, label, explicitTarget) {
      try {
        const target = explicitTarget ?? resolveTarget(ctx)
        if (target === undefined) {
          notify(translate(ctx, 'toast.noComposer'))
          return
        }
        if (target.sessionId === sessionId) {
          notify(translate(ctx, 'toast.self'))
          return
        }
        const draft = typeof target.seat.draft === 'function' ? target.seat.draft() : ''
        if (countReferences(draft) >= MAX_REFERENCES) {
          notify(translate(ctx, 'toast.limited', { max: MAX_REFERENCES }))
          return
        }
        const reference = referenceFor(ctx, sessionId, label)
        // Capture the position while the composer is still unfocused (its caret
        // falls back to the draft end), then focus *before* the edit: Lexical
        // writes the post-insert caret into the DOM only while its editor owns
        // the selection, so focusing afterwards left the caret before the new
        // chip instead of after it.
        const location = target.seat.actions.captureInsertion()
        focusComposer(target.seat)
        // Focusing can commit a selection-only editor update, which bumps the
        // draft revision the span must match; the text itself did not move, so
        // only the revision is refreshed.
        const revision = target.seat.actions.captureInsertion()
        const span = { start: location.start, end: location.end, draftRev: revision.draftRev }
        const outcome = applyReference(ctx, target.sessionId, target.seat, reference, span)
        if (outcome === 'failed') {
          notify(translate(ctx, 'toast.failed'))
        }
      } catch (error) {
        console.warn('[session-reference] insert failed:', error)
        notify(translate(ctx, 'toast.failed'))
      }
    }

    /** Drag type that marks a Session-row drag started in this page. */
    const SESSION_DRAG_TYPE = 'application/x-dsh-session-ref'
    /** Attribute painted on the composer card while a Session drag hovers it. */
    const DROP_ATTRIBUTE = 'data-dsh-session-ref-drop'
    /** Stylesheet identity used for the drop highlight. */
    const STYLE_ID = '@v3887023/dsh-session-reference/composer-drop.css'
    /** Highlight for the composer card under a Session drag. */
    const DROP_CSS = `[${DROP_ATTRIBUTE}]{outline:2px dashed var(--dsw-alias-state-business-primary,#4d6bfe);outline-offset:-3px;border-radius:var(--dsw-radius-panel,12px)}`
    /** Inherited custom property the sidebar column declares on its root. */
    const SIDEBAR_MARKER = '--dsh-sidebar-inline-padding'

    /**
     * Whether this transfer is a Session-row drag started in this page.
     *
     * A custom type is required: a `dragover` may read `types` but not the
     * payload, so `text/plain` alone cannot tell a Session row from dragged
     * prose — and prose must keep its own drop behavior.
     *
     * @param transfer - the event's data transfer.
     * @returns true for a Session-row drag.
     */
    function isSessionDrag(transfer) {
      return transfer !== null && transfer !== undefined
        && transfer.types !== null && transfer.types !== undefined
        && Array.prototype.includes.call(transfer.types, SESSION_DRAG_TYPE)
    }

    /**
     * The drop effect this transfer permits.
     *
     * The sidebar pins `effectAllowed` to `move`; the plugin widens it to
     * `copyMove` on the dragstart bubble so a copy cursor is legal, but a host
     * that keeps `move` must still be answered with `move` — an incompatible
     * drop effect cancels the drop entirely.
     *
     * @param transfer - the event's data transfer.
     * @returns a permitted effect.
     */
    function dropEffectFor(transfer) {
      const allowed = typeof transfer.effectAllowed === 'string' ? transfer.effectAllowed : ''
      if (allowed === 'copy' || allowed === 'copyMove' || allowed === 'copyLink' || allowed === 'all' || allowed === 'uninitialized') return 'copy'
      return 'move'
    }

    /**
     * The Session id a drag started on, or null.
     * @param target - the dragstart target.
     * @returns the Session id, or null outside a Session row.
     */
    function sessionRowOf(target) {
      if (typeof Element === 'undefined' || !(target instanceof Element)) return null
      const row = target.closest('[data-row-key]')
      if (row === null || row === undefined) return null
      const key = row.getAttribute('data-row-key')
      if (typeof key !== 'string' || !key.startsWith('session:')) return null
      const sessionId = key.slice('session:'.length)
      return sessionId === '' ? null : sessionId
    }

    /**
     * The conversation surface one composer card belongs to.
     *
     * The composer is sticky inside the transcript's scrollport, so the nearest
     * scrollable ancestor of the card is the chat area the user sees — the
     * transcript and the composer together. That makes the whole conversation a
     * drop target without naming any generated class.
     *
     * @param card - a composer card element.
     * @returns the scrollport, or null when the composer sits outside one.
     */
    function conversationSurfaceOf(card) {
      if (typeof getComputedStyle !== 'function') return null
      let node = card.parentElement
      while (node !== null && node !== undefined) {
        let overflowY = ''
        try {
          overflowY = getComputedStyle(node).overflowY
        } catch {
          overflowY = ''
        }
        if (overflowY === 'auto' || overflowY === 'scroll') return node
        node = node.parentElement
      }
      return null
    }

    /**
     * The mounted composer a drag target belongs to, with its Session.
     *
     * A target counts when it is inside that composer's card or anywhere in its
     * conversation surface, so dropping on the transcript references the same
     * conversation instead of requiring a precise hit on the input box.
     *
     * @param target - the drag target.
     * @returns `{sessionId, seat, card}`, or undefined when no composer owns it.
     */
    function seatForTarget(target) {
      for (const [sessionId, seat] of seats) {
        const anchor = seat.anchor
        if (anchor === null || anchor === undefined || anchor.isConnected !== true) continue
        const card = anchor.closest('[data-composer-card]')
        if (card === null || card === undefined) continue
        if (typeof card.contains === 'function' && card.contains(target)) return { sessionId, seat, card }
        if (seat.surfaceCard !== card) {
          seat.surfaceCard = card
          seat.surface = conversationSurfaceOf(card)
        }
        const surface = seat.surface
        if (surface !== null && surface !== undefined && surface.isConnected === true
          && typeof surface.contains === 'function' && surface.contains(target)) {
          return { sessionId, seat, card }
        }
      }
      return undefined
    }

    /**
     * Install the drag gesture: dragging a Session out of the sidebar and
     * dropping it on a conversation references that Session there.
     *
     * The shell publishes no drop seat on the composer, so the gesture is claimed
     * at the window's capture phase. Nothing is cancelled unless the pointer is
     * over a conversation that belongs to a different Session: the sidebar's own
     * reorder keeps every other drop, and a plain text drag is never touched —
     * only a transfer carrying this plugin's own type is considered.
     *
     * @param ctx - client root context.
     */
    function useComposerDrop(ctx) {
      ctx.effect(() => {
        if (typeof window === 'undefined' || typeof document === 'undefined') return undefined
        const style = document.createElement('style')
        style.dataset.plugin = '@v3887023/dsh-session-reference'
        style.dataset.pluginCss = STYLE_ID
        style.textContent = DROP_CSS
        document.head.append(style)

        /** Session id of the row drag in flight, or null. */
        let dragged = null
        /** Card currently carrying the highlight attribute. */
        let highlighted = null
        /** Resolved sidebar column, kept until it leaves the document. */
        let column = null
        /** Whether this exit already pinned the sidebar's pending marker. */
        let settled = false
        /** True while this plugin is the one dispatching the settling event. */
        let settling = false

        const unhighlight = () => {
          if (highlighted !== null) {
            highlighted.removeAttribute(DROP_ATTRIBUTE)
            highlighted = null
          }
        }

        /**
         * Whether an element declares the sidebar column's inherited marker.
         * @param node - candidate element.
         * @returns true when the node is (or is inside) the sidebar column.
         */
        const declaresColumn = (node) => {
          if (typeof getComputedStyle !== 'function') return false
          try {
            return getComputedStyle(node).getPropertyValue(SIDEBAR_MARKER).trim() !== ''
          } catch {
            return false
          }
        }

        /**
         * Whether a drag target sits inside the sidebar column.
         *
         * A row is inside by definition, which also covers a collapsed rail where
         * the column's marker may not be inherited. Getting this wrong towards
         * "outside" is harmless — the row's own hover still wins in the same
         * event — but a false "inside" would let a stale marker through, so the
         * structural signal is checked first.
         *
         * @param target - the event target.
         * @returns true inside the sidebar.
         */
        const inSidebar = (target) => {
          if (typeof Element !== 'undefined' && target instanceof Element) {
            if (target.closest('[data-row-key]') !== null) return true
          }
          if (column !== null && column.isConnected === true && typeof column.contains === 'function') {
            return column.contains(target)
          }
          let found = null
          for (let node = target; node !== null && node !== undefined; node = node.parentElement) {
            if (declaresColumn(node)) found = node
          }
          column = found
          return found !== null
        }

        /**
         * The rendered sidebar row of one Session, if any.
         * @param sessionId - Session id.
         * @returns the row element, or null.
         */
        const rowForSession = (sessionId) => {
          if (typeof document.querySelectorAll !== 'function') return null
          const key = `session:${sessionId}`
          for (const row of document.querySelectorAll('[data-row-key]')) {
            if (typeof row.getAttribute === 'function' && row.getAttribute('data-row-key') === key) return row
          }
          return null
        }

        /**
         * Pin the sidebar's pending insertion marker to the dragged row itself.
         *
         * The sidebar answers `dragend` by committing whatever row was last
         * hovered — that is how it lets a release outside the list keep the last
         * marker. Once this gesture leaves the sidebar, that commit is no longer
         * what the user is doing, and `commitSessionDrag` already treats "drop on
         * the dragged row" as a no-op, so re-hovering the source row in the same
         * drag leaves the order untouched. The row's own `onDragOver` is what
         * records the hover, so a synthetic event on that row is the only way in
         * without touching shell state.
         *
         * @param sessionId - Session being dragged.
         * @param transfer - the live drag transfer.
         */
        const settleSidebarHover = (sessionId, transfer) => {
          if (typeof DragEvent === 'undefined') return
          const row = rowForSession(sessionId)
          if (row === null || typeof row.dispatchEvent !== 'function') return
          let event
          try {
            const rect = typeof row.getBoundingClientRect === 'function'
              ? row.getBoundingClientRect()
              : { left: 0, top: 0, width: 0, height: 0 }
            event = new DragEvent('dragover', {
              bubbles: true,
              cancelable: true,
              clientX: rect.left + rect.width / 2,
              clientY: rect.top + rect.height / 2,
              dataTransfer: transfer,
            })
          } catch (error) {
            return
          }
          try {
            row.dispatchEvent(event)
          } catch (error) {
            /* an engine that refuses the synthetic event keeps the shell behavior */
          }
        }

        const highlight = (card) => {
          if (highlighted === card) return
          unhighlight()
          highlighted = card
          card.setAttribute(DROP_ATTRIBUTE, '')
        }

        const onDragStart = (event) => {
          settled = false
          dragged = sessionRowOf(event.target)
          if (dragged === null) return
          const transfer = event.dataTransfer
          if (transfer === null || transfer === undefined) return
          try {
            transfer.setData(SESSION_DRAG_TYPE, dragged)
          } catch (error) {
            console.warn('[session-reference] could not tag the drag:', error)
          }
        }

        // The row's own handler pins `effectAllowed` to `move`; widening it in
        // the same dispatch (this listener is on the bubble path, after React's)
        // is what lets the composer ask for a copy cursor.
        const onDragStartSettle = (event) => {
          if (dragged === null) return
          const transfer = event.dataTransfer
          if (transfer === null || transfer === undefined) return
          try {
            transfer.effectAllowed = 'copyMove'
          } catch {
            /* a host that refuses the wider effect keeps `move` */
          }
        }

        const onDragOver = (event) => {
          const transfer = event.dataTransfer
          if (!isSessionDrag(transfer)) {
            unhighlight()
            if (!settling) settled = false
            return
          }
          if (!settling) {
            if (inSidebar(event.target)) {
              settled = false
            } else if (!settled && dragged !== null) {
              // The drag has left the sidebar: from here on the gesture is a
              // reference drop, not a reorder, so the pending marker is reset
              // once per exit.
              settled = true
              settling = true
              try {
                settleSidebarHover(dragged, transfer)
              } finally {
                settling = false
              }
            }
          }
          const target = seatForTarget(event.target)
          if (target === undefined || target.sessionId === dragged) {
            // No claim: the browser shows the no-drop cursor and fires no drop,
            // which is the right answer over the sidebar or on the same Session.
            unhighlight()
            return
          }
          event.preventDefault()
          transfer.dropEffect = dropEffectFor(transfer)
          highlight(target.card)
        }

        const onDrop = (event) => {
          const transfer = event.dataTransfer
          if (!isSessionDrag(transfer)) return
          const target = seatForTarget(event.target)
          const sessionId = dragged
          dragged = null
          settled = false
          unhighlight()
          if (target === undefined || sessionId === null) return
          event.preventDefault()
          event.stopPropagation()
          // The sidebar commits its last hovered row on dragend; pin that marker
          // to the dragged row so this drop references without reordering.
          settleSidebarHover(sessionId, transfer)
          insertReference(ctx, sessionId, undefined, target)
        }

        const onDragEnd = () => {
          dragged = null
          settled = false
          unhighlight()
        }

        window.addEventListener('dragstart', onDragStart, true)
        window.addEventListener('dragstart', onDragStartSettle)
        window.addEventListener('dragover', onDragOver, true)
        window.addEventListener('drop', onDrop, true)
        window.addEventListener('dragend', onDragEnd, true)
        return () => {
          window.removeEventListener('dragstart', onDragStart, true)
          window.removeEventListener('dragstart', onDragStartSettle)
          window.removeEventListener('dragover', onDragOver, true)
          window.removeEventListener('drop', onDrop, true)
          window.removeEventListener('dragend', onDragEnd, true)
          style.remove()
          unhighlight()
          dragged = null
          column = null
          settled = false
        }
      }, 'session-reference: composer drop target')
    }

    /** A small chat glyph for the menu row. */
    function SessionGlyph() {
      return h('svg', {
        width: 16,
        height: 16,
        viewBox: '0 0 16 16',
        'aria-hidden': 'true',
        focusable: 'false',
      }, [
        h('path', {
          key: 'body',
          d: 'M2.5 4.3A1.8 1.8 0 0 1 4.3 2.5h7.4a1.8 1.8 0 0 1 1.8 1.8v4.9a1.8 1.8 0 0 1-1.8 1.8H7.2l-2.6 2.2a.55.55 0 0 1-.9-.42V11H4.3a1.8 1.8 0 0 1-1.8-1.8V4.3Z',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinejoin: 'round',
        }),
        h('path', {
          key: 'lines',
          d: 'M5.3 6.2h5.4M5.3 8.4h3.4',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round',
        }),
      ])
    }

    /**
     * Inert seat: records the mounted composer's action face, the draft
     * projection the reference limit is checked against, and one anchor node
     * inside the composer card so the pick can focus its editor.
     *
     * The anchor renders nothing — it is display:none — but it keeps the seat
     * attached to the right card when several composers are mounted (the main
     * conversation plus a subagent panel).
     *
     * `useInput` is a standard Session prop; when a host omits it the seat still
     * registers, and the limit check simply sees an empty draft.
     *
     * @param props - slot props: Session identity, `inputActions`, and the
     * standard `useInput` selector hook.
     * @returns an inert anchor node.
     */
    function ComposerSeat(props) {
      const { sessionId, inputActions } = props
      const useInput = typeof props.useInput === 'function' ? props.useInput : null
      const anchorRef = React.useRef(null)
      const draftRef = React.useRef('')
      const phaseRef = React.useRef('plain')

      if (useInput !== null) {
        // The prop's presence is fixed for a given slot, so hook order is stable.
        const draft = useInput((state) => state.draft)
        const phase = useInput((state) => state.phase)
        draftRef.current = draft
        phaseRef.current = phase
      }

      React.useEffect(() => {
        if (sessionId === undefined || inputActions === undefined) return undefined
        const seat = {
          actions: inputActions,
          anchor: anchorRef.current,
          draft: () => draftRef.current,
          phase: () => phaseRef.current,
        }
        seats.set(sessionId, seat)
        return () => {
          if (seats.get(sessionId) === seat) seats.delete(sessionId)
        }
      }, [sessionId, inputActions])

      return h('span', { ref: anchorRef, 'aria-hidden': 'true', style: { display: 'none' } })
    }

    /**
     * Give the keyboard to the composer that is about to receive the reference,
     * so the edit lands with the editor focused and the caret ends up after the
     * new chip.
     *
     * The shell's own `SessionInput.focus()` is not part of the public
     * `inputActions` face, so this focuses the card's contenteditable directly.
     * It runs *before* the edit on purpose: Lexical writes the post-insert caret
     * into the DOM only while its editor owns the selection, and focusing after
     * the edit instead left the browser's own caret before the chip.
     *
     * @param seat - the composer that will receive the edit.
     */
    function focusComposer(seat) {
      try {
        if (typeof document === 'undefined') return
        let card = null
        const anchor = seat.anchor
        if (anchor !== null && anchor !== undefined && anchor.isConnected === true) card = anchor.closest('[data-composer-card]')
        if (card === null || card === undefined) {
          card = typeof document.querySelector === 'function' ? document.querySelector('[data-composer-card]') : null
        }
        if (card === null || card === undefined || typeof card.querySelector !== 'function') return
        const host = card.querySelector('[contenteditable="true"]')
        if (host === null || host === undefined || typeof host.focus !== 'function') return
        host.focus()
      } catch (error) {
        console.warn('[session-reference] could not focus the composer:', error)
      }
    }

    /**
     * The sidebar Session-menu row.
     *
     * The row is offered only when a composer is mounted and the row is not the
     * conversation that composer belongs to: the Host rejects a self-reference,
     * so offering one there would only produce a dead item. A pick still resolves
     * its target again, because a menu can outlive the conversation it was opened
     * over.
     *
     * @param props - row props: the Session, its title, and the menu's dismissal hook.
     * @returns the menu row, or null when there is nothing to reference it into.
     */
    function SessionReferenceRow(props) {
      const { sessionId, displayTitle, useMenuOpenState } = props
      const [, setMenuOpen] = useMenuOpenState()
      if (seats.size === 0) return null
      const current = currentSessionId(ctxRef.current)
      if (current !== undefined && current === sessionId) return null
      const t = typeof props.t === 'function' ? props.t : (key, params) => translate(ctxRef.current, key, params)
      const label = t('row.insert')
      const select = () => {
        setMenuOpen(false)
        insertReference(ctxRef.current, sessionId, displayTitle)
      }
      if (MenuItemButton !== null) {
        return h(MenuItemButton, { icon: h(SessionGlyph, null), onSelect: select }, label)
      }
      return h('button', {
        type: 'button',
        role: 'menuitem',
        onClick: select,
        style: { display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 0, background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer' },
      }, label)
    }

    return {
      name: 'session-reference',
      inject: ['slots', 'sessions', 'locale'],
      apply(ctx) {
        ctxRef.current = ctx

        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-reference: dictionaries')

        ctx.effect(() => () => {
          seats.clear()
        }, 'session-reference: seats')

        useComposerDrop(ctx)

        ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
          name: 'conversation.input.overlay',
          id: 'session-reference-seat',
          order: 0,
        }, ComposerSeat))

        ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
          name: 'sidebar.workspaces.session.menu.item',
          id: 'session-reference-row',
          // Ahead of the destructive Archive row that closes the menu.
          order: 300,
          locale: NS,
        }, SessionReferenceRow))
      },
      /** Pure helpers, exposed for the offline behaviour test only. */
      __internals: { escapeLabel, encodeSessionUri, formatMention, countReferences, MAX_REFERENCES },
    }
  },
})
