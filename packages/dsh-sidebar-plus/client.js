/**
 * Client half of the sidebar-plus bundle.
 *
 * One bundle owns four sidebar behaviours that used to be four plugins, and one
 * Settings page switches each of them on its own:
 *
 * 1. **Date groups.** In the sidebar's single-list grouping the Session list is
 *    one flat run of rows ordered by recency, so a long history reads as an
 *    undifferentiated column. Headers are inserted into that run — Pinned,
 *    Today, Yesterday, then one collapsible section per calendar day.
 * 2. **Reference by drag.** Dragging a Session row onto a conversation inserts
 *    the same atomic `@[label](dsh-session:…)` mention the composer's `@` menu
 *    inserts; a sidebar context-menu row offers the same reference. The chip
 *    still resolves through the Host's Session-reference service when sent.
 * 3. **Order lock.** With **Order by → Last updated** selected, dropping a
 *    Session back on the list is refused, so one drag can no longer silently
 *    replace the chosen order with a manual layout.
 * 4. **Folder drop.** Dropping a folder on the sidebar registers it as a
 *    Workspace and opens a Session in it, instead of handing the folder to the
 *    composer.
 *
 * Two facts shape the merger. First, items 2, 3, and 4 all claim `window`'s
 * capture phase for the same `dragstart`/`dragenter`/`dragover`/`dragleave`/
 * `drop`/`dragend` events: as separate plugins they stayed out of each other's
 * way only because one answered Session drags and another answered `Files`
 * drags. One pipeline now decides each event once, dispatching on the transfer
 * it actually carries, so listener order stops being a correctness mechanism.
 * Second, every feature is a *decoration* of the shell's own DOM: the bundle
 * adds nodes and attributes, never replaces a row, and removes everything on
 * unload or when a switch turns its feature off.
 *
 * The switches are browser-local. They live under one `localStorage` record and
 * apply immediately; the Settings page is the `settings.section` contribution
 * this package registers, so a user never edits a patch file to change them.
 */

window.__ModuleLoader__.load({
  id: '@v3887023/dsh-sidebar-plus',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'sidebarPlus'
    /** Browser record holding the feature switches. */
    const PREFS_KEY = 'dsh.sidebar-plus.v1'
    /** Every switch defaults on. */
    const PREF_DEFAULTS = { dateGroups: true, sessionDrag: true, sortLock: true, folderDrop: true }

    // -------------------------------------------------------------------------
    // Feature switches
    // -------------------------------------------------------------------------

    /** Last accepted switch values, so a hot event path never parses JSON. */
    let prefsCache = null
    /** Page-local listeners notified after a switch changes. */
    const prefsListeners = new Set()

    /**
     * Read the persisted switches, filling absent or invalid fields from the
     * defaults. An unreadable record means "everything on", never "everything
     * off": a broken browser record must not silently disable the bundle.
     * @returns the current switch values.
     */
    function readPrefs() {
      if (prefsCache !== null) return prefsCache
      if (typeof window === 'undefined') return { ...PREF_DEFAULTS }
      let stored = null
      try {
        stored = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? 'null')
      } catch {
        stored = null
      }
      const prefs = { ...PREF_DEFAULTS }
      if (stored !== null && typeof stored === 'object' && !Array.isArray(stored)) {
        for (const key of Object.keys(PREF_DEFAULTS)) {
          if (typeof stored[key] === 'boolean') prefs[key] = stored[key]
        }
      }
      prefsCache = prefs
      return prefs
    }

    /**
     * Persist one switch change and notify this page's subscribers.
     * @param patch - the switches to replace.
     * @returns the new values.
     */
    function updatePrefs(patch) {
      const next = { ...readPrefs(), ...patch }
      prefsCache = next
      try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(next))
      } catch {
        // A refusing storage keeps the choice for this page only.
      }
      for (const listener of [...prefsListeners]) {
        try {
          listener()
        } catch (error) {
          console.warn('[sidebar-plus] preference listener failed:', error)
        }
      }
      return next
    }

    /**
     * Observe switch changes made in this page.
     * @param listener - invoked after each change.
     * @returns the disposer removing this listener.
     */
    function subscribePrefs(listener) {
      prefsListeners.add(listener)
      return () => { prefsListeners.delete(listener) }
    }

    // -------------------------------------------------------------------------
    // Copy
    // -------------------------------------------------------------------------

    /** English UI copy, also the fallback for every other language. */
    const en = {
      pinned: 'Pinned',
      today: 'Today',
      yesterday: 'Yesterday',
      'day.sameYear': '{mon} {d}',
      'day.otherYear': '{mon} {d}, {y}',
      'label.weekday': '{label} ({weekday})',
      groupAria: '{label}, {n} sessions',
      'row.insert': 'Reference in current chat',
      'toast.self': 'The current chat cannot reference itself',
      'toast.limited': 'A message can reference at most {max} chats',
      'toast.noComposer': 'The current chat has no composer ready',
      'toast.failed': 'Could not insert the reference into the composer',
      'toast.noPath': 'The folder path is unavailable',
      'toast.workspaceFailed': 'Could not add the workspace: {message}',
      'settings.title': 'Sidebar',
      'settings.intro': 'Each switch applies immediately and is remembered in this browser.',
      'settings.dateGroups': 'Group Sessions by date',
      'settings.dateGroups.desc': 'Pinned, Today, Yesterday, then one collapsible section per day.',
      'settings.sessionDrag': 'Reference a Session by dragging it',
      'settings.sessionDrag.desc': 'Drop a Session on a conversation to reference it there; the sidebar menu offers the same.',
      'settings.sortLock': 'Lock the “Last updated” order',
      'settings.sortLock.desc': 'While ordering by last activity, a Session drag cannot switch the list to manual order.',
      'settings.folderDrop': 'Add a Workspace by dropping a folder',
      'settings.folderDrop.desc': 'Dropping a folder on the sidebar registers it and opens a Session in it.',
    }

    /** Chinese UI copy. */
    const zh = {
      pinned: '置顶',
      today: '今天',
      yesterday: '昨天',
      'day.sameYear': '{m}月{d}日',
      'day.otherYear': '{y}年{m}月{d}日',
      'label.weekday': '{label}（{weekday}）',
      groupAria: '{label}，共 {n} 个会话',
      'row.insert': '引用到当前对话',
      'toast.self': '不能引用当前对话本身',
      'toast.limited': '一条消息最多引用 {max} 个对话',
      'toast.noComposer': '当前对话的输入框还没准备好',
      'toast.failed': '没能把这个对话插入输入框',
      'toast.noPath': '无法读取该文件夹的路径',
      'toast.workspaceFailed': '添加工作区失败：{message}',
      'settings.title': '侧边栏',
      'settings.intro': '每个开关立即生效，并记录在当前浏览器里。',
      'settings.dateGroups': '会话按日期分组',
      'settings.dateGroups.desc': '置顶、今天、昨天，之后每天一个可折叠标题。',
      'settings.sessionDrag': '拖动会话即可引用',
      'settings.sessionDrag.desc': '把会话拖到对话里就引用它；侧栏右键菜单里有同样的入口。',
      'settings.sortLock': '锁定「最近更新」排序',
      'settings.sortLock.desc': '按最近活动排序时，拖动会话不会把列表切成手动排序。',
      'settings.folderDrop': '拖入文件夹新建工作区',
      'settings.folderDrop.desc': '把文件夹拖到侧栏即注册为工作区并打开一个会话。',
    }

    /** Japanese copy. */
    const ja = {
      'toast.noPath': 'フォルダーのパスを取得できません',
      'toast.workspaceFailed': 'ワークスペースを追加できませんでした: {message}',
      'settings.title': 'サイドバー',
      'settings.intro': '各スイッチはすぐに反映され、このブラウザーに保存されます。',
      'settings.dateGroups': 'セッションを日付でグループ化',
      'settings.dateGroups.desc': 'ピン留め、今日、昨日、その後は 1 日ごとに折りたたみ可能な見出し。',
      'settings.sessionDrag': 'ドラッグでセッションを参照',
      'settings.sessionDrag.desc': 'セッションを会話にドロップすると参照できます。右クリックメニューにも同じ項目があります。',
      'settings.sortLock': '「最終更新」の並び順を固定',
      'settings.sortLock.desc': '最終更新順のとき、セッションをドラッグしても手動の並び順に切り替わりません。',
      'settings.folderDrop': 'フォルダーをドロップしてワークスペースを追加',
      'settings.folderDrop.desc': 'サイドバーにフォルダーをドロップするとワークスペースとして登録され、セッションが開きます。',
    }

    /** Spanish copy. */
    const es = {
      'toast.noPath': 'La ruta de la carpeta no está disponible',
      'toast.workspaceFailed': 'No se pudo añadir el espacio de trabajo: {message}',
      'settings.title': 'Barra lateral',
      'settings.intro': 'Cada interruptor se aplica al instante y se recuerda en este navegador.',
      'settings.dateGroups': 'Agrupar sesiones por fecha',
      'settings.dateGroups.desc': 'Fijadas, Hoy, Ayer y luego una sección plegable por día.',
      'settings.sessionDrag': 'Referenciar una sesión arrastrándola',
      'settings.sessionDrag.desc': 'Suelta una sesión sobre una conversación para referenciarla; el menú lateral ofrece lo mismo.',
      'settings.sortLock': 'Bloquear el orden «Última actualización»',
      'settings.sortLock.desc': 'Con el orden por última actividad, arrastrar una sesión no cambia la lista al orden manual.',
      'settings.folderDrop': 'Añadir un espacio de trabajo soltando una carpeta',
      'settings.folderDrop.desc': 'Soltar una carpeta en la barra lateral la registra y abre una sesión en ella.',
    }

    /** French copy. */
    const fr = {
      'toast.noPath': 'Le chemin du dossier est indisponible',
      'toast.workspaceFailed': "Impossible d'ajouter l'espace de travail : {message}",
      'settings.title': 'Barre latérale',
      'settings.intro': "Chaque option s'applique immédiatement et est mémorisée dans ce navigateur.",
      'settings.dateGroups': 'Grouper les sessions par date',
      'settings.dateGroups.desc': 'Épinglées, Aujourd’hui, Hier, puis une section repliable par jour.',
      'settings.sessionDrag': 'Référencer une session en la glissant',
      'settings.sessionDrag.desc': 'Déposez une session sur une conversation pour la référencer ; le menu latéral fait de même.',
      'settings.sortLock': "Verrouiller l'ordre « Dernière mise à jour »",
      'settings.sortLock.desc': "Avec l'ordre par dernière activité, glisser une session ne bascule plus la liste en ordre manuel.",
      'settings.folderDrop': 'Ajouter un espace de travail en déposant un dossier',
      'settings.folderDrop.desc': 'Déposer un dossier sur la barre latérale l’enregistre et ouvre une session dedans.',
    }

    /** German copy. */
    const de = {
      'toast.noPath': 'Der Ordnerpfad ist nicht verfügbar',
      'toast.workspaceFailed': 'Arbeitsbereich konnte nicht hinzugefügt werden: {message}',
      'settings.title': 'Seitenleiste',
      'settings.intro': 'Jeder Schalter wirkt sofort und wird in diesem Browser gemerkt.',
      'settings.dateGroups': 'Sitzungen nach Datum gruppieren',
      'settings.dateGroups.desc': 'Angeheftet, Heute, Gestern, danach ein einklappbarer Abschnitt pro Tag.',
      'settings.sessionDrag': 'Sitzung per Ziehen referenzieren',
      'settings.sessionDrag.desc': 'Eine Sitzung auf eine Unterhaltung ziehen, um sie dort zu referenzieren; das Seitenmenü bietet dasselbe.',
      'settings.sortLock': 'Reihenfolge „Zuletzt aktualisiert“ sperren',
      'settings.sortLock.desc': 'Bei der Reihenfolge nach letzter Aktivität schaltet das Ziehen einer Sitzung nicht mehr auf manuelle Reihenfolge um.',
      'settings.folderDrop': 'Arbeitsbereich durch Ablegen eines Ordners hinzufügen',
      'settings.folderDrop.desc': 'Ein Ordner auf der Seitenleiste wird registriert und öffnet eine Sitzung darin.',
    }

    /** Russian copy. */
    const ru = {
      'toast.noPath': 'Путь к папке недоступен',
      'toast.workspaceFailed': 'Не удалось добавить рабочую область: {message}',
      'settings.title': 'Боковая панель',
      'settings.intro': 'Каждый переключатель применяется сразу и запоминается в этом браузере.',
      'settings.dateGroups': 'Группировать сессии по датам',
      'settings.dateGroups.desc': 'Закреплённые, Сегодня, Вчера, затем сворачиваемый раздел на каждый день.',
      'settings.sessionDrag': 'Ссылаться на сессию перетаскиванием',
      'settings.sessionDrag.desc': 'Перетащите сессию в беседу, чтобы сослаться на неё; в боковом меню есть тот же пункт.',
      'settings.sortLock': 'Фиксировать порядок «Последнее обновление»',
      'settings.sortLock.desc': 'При порядке по последней активности перетаскивание сессии больше не переключает список на ручной порядок.',
      'settings.folderDrop': 'Добавлять рабочую область перетаскиванием папки',
      'settings.folderDrop.desc': 'Папка, брошенная на боковую панель, регистрируется и открывает в ней сессию.',
    }

    /** Portuguese copy. */
    const pt = {
      'toast.noPath': 'O caminho da pasta não está disponível',
      'toast.workspaceFailed': 'Não foi possível adicionar a área de trabalho: {message}',
      'settings.title': 'Barra lateral',
      'settings.intro': 'Cada opção aplica-se de imediato e fica guardada neste navegador.',
      'settings.dateGroups': 'Agrupar sessões por data',
      'settings.dateGroups.desc': 'Fixadas, Hoje, Ontem e depois uma secção recolhível por dia.',
      'settings.sessionDrag': 'Referenciar uma sessão ao arrastá-la',
      'settings.sessionDrag.desc': 'Largue uma sessão numa conversa para a referenciar; o menu lateral oferece o mesmo.',
      'settings.sortLock': 'Bloquear a ordem «Última atualização»',
      'settings.sortLock.desc': 'Com a ordem por última atividade, arrastar uma sessão já não muda a lista para a ordem manual.',
      'settings.folderDrop': 'Adicionar uma área de trabalho largando uma pasta',
      'settings.folderDrop.desc': 'Largar uma pasta na barra lateral registra-a e abre uma sessão nela.',
    }

    /** Dictionaries by UI language, in the shape `locale.register` takes. */
    const DICTIONARIES = { en, zh, ja, es, fr, de, ru, pt }
    /** Every language this bundle ships copy for. */
    const LANGUAGES = ['zh', 'en', 'ja', 'es', 'fr', 'de', 'ru', 'pt']
    /** English month names, shortest unambiguous form. */
    const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    /** Weekday names indexed by `Date.getDay()`, per UI language. */
    const WEEKDAYS = {
      en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      zh: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'],
    }

    /**
     * The active UI language this bundle has copy for.
     * @param ctx - client root context.
     * @returns one of {@link LANGUAGES}, or `'en'`.
     */
    function languageOf(ctx) {
      const locale = ctx.get('locale')
      if (locale === undefined || locale === null || typeof locale.getSnapshot !== 'function') return 'en'
      let active = ''
      try {
        active = String(locale.getSnapshot().active ?? '')
      } catch {
        return 'en'
      }
      const tag = active.toLowerCase().split(/[-_]/u)[0]
      return LANGUAGES.includes(tag) ? tag : 'en'
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
      const dictionary = DICTIONARIES[languageOf(ctx)] ?? en
      let bound = null
      if (locale !== undefined && locale !== null && typeof locale.bind === 'function') {
        try {
          bound = locale.bind(NS)
        } catch {
          bound = null
        }
      }
      let template = dictionary[key] ?? en[key] ?? key
      if (bound !== null) {
        const value = bound(key, params)
        if (typeof value === 'string' && value !== '' && value !== key) template = value
      }
      if (params === undefined || params === null) return template
      return template.replace(/\{(\w+)\}/gu, (match, name) => (name in params ? String(params[name]) : match))
    }

    // -------------------------------------------------------------------------
    // Transient notice
    // -------------------------------------------------------------------------

    /** One transient notice at a time. */
    let toast = null
    let toastTimer = 0

    /** Remove the transient notice. */
    function hideToast() {
      if (typeof window !== 'undefined' && typeof window.clearTimeout === 'function') window.clearTimeout(toastTimer)
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
      toastTimer = window.setTimeout(hideToast, 4000)
    }

    // -------------------------------------------------------------------------
    // Session reference codec
    // -------------------------------------------------------------------------

    /** The Host rejects more than three distinct Session references in one message. */
    const MAX_REFERENCES = 3

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

    // -------------------------------------------------------------------------
    // The sidebar's own view record
    // -------------------------------------------------------------------------

    /** Prefix shared by every persisted generation of the sidebar viewing store. */
    const STORE_PREFIX = 'dsh.workspace.view.'
    /** Order mode that keeps no manual layout; also the product default. */
    const UPDATED = 'updated'
    /** Inherited custom property the sidebar column declares on its root. */
    const SIDEBAR_MARKER = '--dsh-sidebar-inline-padding'
    /** A Session row element; the hover-card anchor may nest it one level down. */
    const SESSION_ROW = '[data-row-key^="session:"]'
    /** Any row key the sidebar renders. */
    const ANY_ROW = '[data-row-key]'
    /** Drag type that marks a Session-row drag started in this page. */
    const SESSION_DRAG_TYPE = 'application/x-dsh-session-ref'
    /** Attribute painted on the composer card while a Session drag hovers it. */
    const DROP_ATTRIBUTE = 'data-dsh-session-ref-drop'
    /** Highlight attribute placed on the sidebar column while a folder hovers it. */
    const COLUMN_ATTRIBUTE = 'data-dsh-sidebar-plus-drop'
    /** Document flag that hides the shell's page-wide drop mask. */
    const DRAGGING_ATTRIBUTE = 'data-dsh-sidebar-plus-dragging'

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

    // -------------------------------------------------------------------------
    // Shared DOM helpers
    // -------------------------------------------------------------------------

    /**
     * The Session row element a target sits in, if any.
     * @param target - an event target.
     * @returns the row element, or null outside a Session row.
     */
    function sessionRowElementOf(target) {
      if (typeof Element === 'undefined' || !(target instanceof Element)) return null
      const row = target.closest(ANY_ROW)
      if (row === null || row === undefined) return null
      const key = row.getAttribute('data-row-key')
      return typeof key === 'string' && key.startsWith('session:') ? row : null
    }

    /**
     * The Session id a drag started on, or null.
     * @param target - the dragstart target.
     * @returns the Session id, or null outside a Session row.
     */
    function sessionRowOf(target) {
      const row = sessionRowElementOf(target)
      if (row === null) return null
      const sessionId = String(row.getAttribute('data-row-key')).slice('session:'.length)
      return sessionId === '' ? null : sessionId
    }

    /**
     * Read the Session id a row shows.
     * @param row - one Session row element.
     * @returns the id after `session:`, or null when the attribute is absent.
     */
    function rowSessionId(row) {
      const key = row.getAttribute('data-row-key')
      if (typeof key !== 'string' || !key.startsWith('session:')) return null
      const id = key.slice('session:'.length)
      return id === '' ? null : id
    }

    /**
     * Whether an element declares the sidebar column's inherited marker.
     * @param node - candidate element.
     * @returns true when the node is (or is inside) the sidebar column.
     */
    function declaresColumn(node) {
      if (typeof getComputedStyle !== 'function') return false
      try {
        return getComputedStyle(node).getPropertyValue(SIDEBAR_MARKER).trim() !== ''
      } catch {
        return false
      }
    }

    /**
     * Whether this transfer is a Session-row drag started in this page.
     *
     * A custom type is required: a `dragover` may read `types` but not the
     * payload, so `text/plain` alone cannot tell a Session row from dragged
     * prose — and prose must keep its own drop behavior.
     * @param transfer - the event's data transfer.
     * @returns true for a Session-row drag.
     */
    function isSessionDrag(transfer) {
      return transfer !== null && transfer !== undefined
        && transfer.types !== null && transfer.types !== undefined
        && Array.prototype.includes.call(transfer.types, SESSION_DRAG_TYPE)
    }

    /**
     * Whether this transfer carries external files.
     * @param transfer - the event's data transfer.
     * @returns true for a file drag.
     */
    function isFileDrag(transfer) {
      return transfer !== null && transfer !== undefined
        && transfer.types !== null && transfer.types !== undefined
        && Array.prototype.includes.call(transfer.types, 'Files')
    }

    /**
     * The drop effect this transfer permits.
     *
     * The sidebar pins `effectAllowed` to `move`; the pipeline widens it to
     * `copyMove` on the dragstart bubble so a copy cursor is legal, but a host
     * that keeps `move` must still be answered with `move` — an incompatible
     * drop effect cancels the drop entirely.
     * @param transfer - the event's data transfer.
     * @returns a permitted effect.
     */
    function dropEffectFor(transfer) {
      const allowed = typeof transfer.effectAllowed === 'string' ? transfer.effectAllowed : ''
      if (allowed === 'copy' || allowed === 'copyMove' || allowed === 'copyLink' || allowed === 'all' || allowed === 'uninitialized') return 'copy'
      return 'move'
    }

    /**
     * The conversation surface one composer card belongs to.
     *
     * The composer is sticky inside the transcript's scrollport, so the nearest
     * scrollable ancestor of the card is the chat area the user sees — the
     * transcript and the composer together.
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

    // -------------------------------------------------------------------------
    // Feature 1: date groups
    // -------------------------------------------------------------------------

    /** Marker/owning id of the stylesheet injected into the document head. */
    const STYLE_ID = '@v3887023/dsh-sidebar-plus'
    /** Browser-record key holding the operator's expansion choices. */
    const STORAGE_KEY = 'dsh.session-date-groups.v1'
    /** Browser-record key holding the last diagnostics record. */
    const DIAGNOSE_KEY = 'dsh.session-date-groups.diagnose'
    /** Marker attribute on an inserted header box. */
    const HEADER = 'data-dsh-session-date-group'
    /** Marker attribute carrying a slot's bucket. */
    const BUCKET_ATTR = 'data-dsh-session-date-bucket'
    /** Present on a slot and its row while that section is collapsed. */
    const HIDDEN_ATTR = 'data-dsh-session-date-hidden'
    /** Session row identity, as the built-in browser renders it. */
    const ROW_KEY = 'data-row-key'
    /** Prefix of a Session row key. */
    const SESSION_PREFIX = 'session:'
    /** Falls back to re-finding the list when the sidebar remounts. */
    const SWEEP_MS = 1000
    /** Buckets that are not dates. */
    const FIXED_BUCKETS = ['pinned', 'today', 'yesterday']
    /** Prefix of a per-day bucket, followed by the local `YYYY-MM-DD`. */
    const DAY_PREFIX = 'day:'
    /** A per-day bucket key, as this plugin writes it. */
    const DAY_BUCKET = /^day:(\d{4})-(\d{2})-(\d{2})$/u
    /** Buckets open on first use; every older day starts collapsed. */
    const DEFAULT_EXPANDED = { pinned: true, today: true }

    /** Stylesheet for the headers, the chevron, and the collapsed rows. */
    const GROUPS_CSS = `
.dsh-sdgroup-head{display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;overflow:hidden;
  margin:6px 0 2px;min-height:24px;
  padding:3px calc(var(--dsh-sidebar-row-padding, 8px) - var(--dsh-sidebar-paint-inset, 0px) + var(--dsh-workspace-indent, 0px));
  border:0;border-radius:var(--dsw-radius-md, 6px);background:transparent;color:var(--dsw-alias-label-tertiary, #8b8b92);
  font:inherit;font-size:12px;line-height:18px;text-align:left;cursor:pointer}
.dsh-sdgroup-head:first-child{margin-top:0}
.dsh-sdgroup-chevron{flex:none;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;
  border-top:5px solid currentColor;transition:transform 120ms ease;transform-origin:50% 40%}
.dsh-sdgroup-head[aria-expanded="false"] .dsh-sdgroup-chevron{transform:rotate(-90deg)}
.dsh-sdgroup-label{flex:0 1 auto;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dsh-sdgroup-count{flex:none;margin-left:auto;color:var(--dsw-alias-label-caption, #6b6b73);font-variant-numeric:tabular-nums}
.dsh-sdgroup-head:focus-visible{outline:var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #4d6bfe));outline-offset:-2px}
@media (hover: hover){
  .dsh-sdgroup-head:hover{color:var(--dsw-alias-label-secondary, #b4b4bb);background-color:var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.06))}
}
[${HIDDEN_ATTR}]{display:none !important}
`

    /**
     * The local calendar day a timestamp belongs to.
     * @param milliseconds - epoch milliseconds.
     * @returns the day key without the bucket prefix.
     */
    function dayOf(milliseconds) {
      const date = new Date(milliseconds)
      const pad = (value) => String(value).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    }

    /**
     * The weekday name of one local date, in the active UI language.
     * @param ctx - client root context.
     * @param date - a date whose local day is the one to name.
     * @returns the weekday name.
     */
    function weekdayName(ctx, date) {
      const names = WEEKDAYS[languageOf(ctx)] ?? WEEKDAYS.en
      return names[date.getDay()] ?? ''
    }

    /**
     * The header label for one bucket.
     * @param ctx - client root context.
     * @param bucket - bucket name, either fixed or `day:`-prefixed.
     * @returns the localized label.
     */
    function bucketLabel(ctx, bucket) {
      if (bucket === 'pinned' || bucket === 'today' || bucket === 'yesterday') return translate(ctx, bucket)
      if (!bucket.startsWith(DAY_PREFIX)) return bucket
      const parts = DAY_BUCKET.exec(bucket)
      if (parts === null) return bucket
      const year = Number(parts[1])
      const month = Number(parts[2])
      const day = Number(parts[3])
      const sameYear = new Date().getFullYear() === year
      const key = sameYear ? 'day.sameYear' : 'day.otherYear'
      const params = { y: year, m: month, d: day, mon: EN_MONTHS[month - 1] ?? String(month) }
      const label = translate(ctx, key, params)
      const date = new Date(year, month - 1, day)
      return translate(ctx, 'label.weekday', { label, weekday: weekdayName(ctx, date) })
    }

    /**
     * Read the persisted expansion choices.
     * @param storage - the page's `localStorage`, or null when unavailable.
     * @returns bucket name to `expanded` flag.
     */
    function readExpansion(storage) {
      if (storage === null) return {}
      let parsed = null
      try {
        parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null')
      } catch {
        return {}
      }
      const source = parsed !== null && typeof parsed === 'object' ? parsed.expanded : undefined
      if (source === null || typeof source !== 'object' || Array.isArray(source)) return {}
      const expansion = {}
      for (const [bucket, value] of Object.entries(source)) {
        if (typeof value !== 'boolean') continue
        if (!FIXED_BUCKETS.includes(bucket) && !DAY_BUCKET.test(bucket)) continue
        expansion[bucket] = value
      }
      return expansion
    }

    /**
     * Persist the expansion choices.
     * @param storage - the page's `localStorage`, or null when unavailable.
     * @param expansion - bucket name to `expanded` flag.
     */
    function writeExpansion(storage, expansion) {
      if (storage === null) return
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify({ expanded: expansion }))
      } catch {
        // A storage that refuses the write only costs persistence this session.
      }
    }

    /**
     * Record what the last pass saw, so a sidebar that gains no headers can be
     * diagnosed without browser control.
     * @param storage - the page's `localStorage`, or null when unavailable.
     * @param diagnosis - the outcome name and its facts.
     */
    function recordDiagnosis(storage, diagnosis) {
      if (storage === null) return
      try {
        storage.setItem(DIAGNOSE_KEY, JSON.stringify({ at: Date.now(), ...diagnosis }))
      } catch {
        // Diagnostics are best effort.
      }
    }

    /**
     * Whether a bucket is open, applying this plugin's defaults.
     * @param expansion - stored choices.
     * @param bucket - bucket name.
     * @returns true when the bucket's rows are visible.
     */
    function isExpanded(expansion, bucket) {
      const stored = expansion[bucket]
      return typeof stored === 'boolean' ? stored : DEFAULT_EXPANDED[bucket] === true
    }

    /**
     * Classify one Session timestamp into a bucket.
     * @param updatedAt - the Session's last activity, in epoch milliseconds.
     * @param now - the current time, in epoch milliseconds.
     * @returns the bucket name.
     */
    function bucketOf(updatedAt, now) {
      if (!Number.isFinite(updatedAt) || updatedAt <= 0) return 'today'
      const date = new Date(now)
      const dayStart = (offset) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset).getTime()
      if (updatedAt >= dayStart(0)) return 'today'
      if (updatedAt >= dayStart(-1)) return 'yesterday'
      return `${DAY_PREFIX}${dayOf(updatedAt)}`
    }

    /**
     * Classify one Session row into a bucket.
     * @param summary - the row's Session summary, or undefined when absent.
     * @param now - the current time, in epoch milliseconds.
     * @returns the bucket name.
     */
    function bucketFor(summary, now) {
      if (summary === undefined || summary === null) return 'today'
      if (summary.blank === true) return 'today'
      return bucketOf(summary.updatedAt, now)
    }

    /**
     * Read the list's Session rows in display order.
     *
     * The browser wraps each row in the hover card's anchor element, so a row
     * is usually a grandchild of the list rather than a child. This returns,
     * for each row, the direct child of the list that carries it — the slot a
     * header is inserted before and a collapse hides — together with the row
     * element that holds the identity and the selected state.
     * @param list - the flat-list container.
     * @returns one entry per Session row, in order.
     */
    function rowSlots(list) {
      const slots = []
      for (const child of list.children) {
        if (child.nodeType !== 1) continue
        const row = child.matches(SESSION_ROW) ? child : child.querySelector(SESSION_ROW)
        if (row === null) continue
        const id = rowSessionId(row)
        if (id === null) continue
        slots.push({ slot: child, row, id })
      }
      return slots
    }

    /**
     * Mount the date headers for the plugin lifetime.
     *
     * The decoration only runs while the `dateGroups` switch is on; turning it
     * off removes every header and attribute this feature added on the next
     * pass, which the one-second sweep guarantees even when no DOM event fires.
     * @param ctx - client root context carrying the Session store.
     */
    function useDateGroups(ctx) {
      ctx.effect(() => {
        if (typeof window === 'undefined' || typeof document === 'undefined') return undefined
        const doc = document
        let storage = null
        try {
          storage = window.localStorage ?? null
        } catch {
          storage = null
        }

        /** The operator's expansion choices, exactly as persisted. */
        let expansion = readExpansion(storage)
        /** Buckets opened only to keep the Session the operator just moved to visible. */
        const opened = new Set()

        /**
         * Whether a bucket is open right now.
         * @param bucket - bucket name.
         * @returns true when the bucket's rows are shown.
         */
        const expandedOf = (bucket) => opened.has(bucket) || isExpanded(expansion, bucket)

        /** The flat-list container currently decorated. */
        let container = null
        /** The watched ancestor of {@link container}, kept to detect remounts. */
        let watched = null
        /** Group key to its rendered header parts. */
        const headers = new Map()
        /** The Session row that was active at the previous pass. */
        let activeSeen = null
        /** Cheap fingerprint of the last applied grouping. */
        let signature = ''
        let observer = null
        let timer = 0
        let frame = 0
        let disposed = false

        /**
         * The list element this plugin decorates, if it is on screen.
         * @returns the flat-list `role="tree"` container, or null.
         */
        const findContainer = () => {
          for (const candidate of doc.querySelectorAll('[role="tree"]')) {
            if (!candidate.isConnected) continue
            const className = candidate.getAttribute('class') ?? ''
            if (!className.includes('flatList')) continue
            return candidate
          }
          return null
        }

        /** Remove every header this plugin inserted, leaving the rows untouched. */
        const clearHeaders = () => {
          for (const parts of headers.values()) parts.box.remove()
          headers.clear()
        }

        /** Strip the plugin's attributes from a set of row slots. */
        const forgetSlots = (slots) => {
          for (const item of slots) {
            for (const node of [item.slot, item.row]) {
              if (node.hasAttribute(HIDDEN_ATTR)) node.removeAttribute(HIDDEN_ATTR)
              if (node.hasAttribute('inert')) node.removeAttribute('inert')
            }
            if (item.slot.hasAttribute(BUCKET_ATTR)) item.slot.removeAttribute(BUCKET_ATTR)
          }
        }

        /** Remove everything the plugin added to the page. */
        const clear = () => {
          if (container !== null) forgetSlots(rowSlots(container))
          clearHeaders()
          container = null
          signature = ''
        }

        /**
         * Read the Session store's current summaries.
         * @returns Session id to summary, or null when the store is absent.
         */
        const summaries = () => {
          const sessions = ctx.get('sessions')
          if (sessions === undefined || sessions === null || typeof sessions !== 'object') return null
          const list = sessions.list
          if (list === undefined || list === null || typeof list.getSnapshot !== 'function') return null
          const state = list.getSnapshot()
          return state !== null && typeof state === 'object' && state.byId !== null && typeof state.byId === 'object'
            ? state.byId
            : null
        }

        /**
         * Read the registry-global pin set.
         * @returns the pinned Session ids, or null when the Workspace service is absent.
         */
        const pinnedIds = () => {
          const workspaces = ctx.get('workspaces')
          if (workspaces === undefined || workspaces === null || typeof workspaces !== 'object') return null
          const list = workspaces.list
          if (list === undefined || list === null || typeof list.getSnapshot !== 'function') return null
          const state = list.getSnapshot()
          const ids = state !== null && typeof state === 'object' ? state.pinnedSessionIds : undefined
          return Array.isArray(ids) ? new Set(ids) : null
        }

        /**
         * Build or update one header.
         * @param key - the run's key.
         * @param bucket - bucket name.
         * @param count - rows in this run.
         * @param expanded - whether the run's rows are visible.
         * @returns the header parts.
         */
        const headerFor = (key, bucket, count, expanded) => {
          const cached = headers.get(key)
          const parts = cached ?? (() => {
            const button = doc.createElement('button')
            button.setAttribute('type', 'button')
            button.setAttribute(HEADER, key)
            button.className = 'dsh-sdgroup-head'
            const chevron = doc.createElement('span')
            chevron.className = 'dsh-sdgroup-chevron'
            chevron.setAttribute('aria-hidden', 'true')
            const label = doc.createElement('span')
            label.className = 'dsh-sdgroup-label'
            const tally = doc.createElement('span')
            tally.className = 'dsh-sdgroup-count'
            tally.setAttribute('aria-hidden', 'true')
            button.append(chevron, label, tally)
            button.addEventListener('click', (event) => {
              event.preventDefault()
              event.stopPropagation()
              const next = !expandedOf(bucket)
              opened.delete(bucket)
              expansion = { ...expansion, [bucket]: next }
              writeExpansion(storage, expansion)
              signature = ''
              sync()
            })
            const created = { box: button, button, label, tally }
            headers.set(key, created)
            return created
          })()
          const name = bucketLabel(ctx, bucket)
          const text = translate(ctx, 'groupAria', { label: name, n: count })
          if (parts.label.textContent !== name) parts.label.textContent = name
          if (parts.tally.textContent !== String(count)) parts.tally.textContent = String(count)
          if (parts.button.getAttribute('aria-label') !== text) parts.button.setAttribute('aria-label', text)
          const state = expanded ? 'true' : 'false'
          if (parts.button.getAttribute('aria-expanded') !== state) parts.button.setAttribute('aria-expanded', state)
          return parts
        }

        /** The active locale tag, so switching language re-labels the headers. */
        const localeTag = () => {
          const locale = ctx.get('locale')
          if (locale === undefined || locale === null || typeof locale.getSnapshot !== 'function') return ''
          try {
            return String(locale.getSnapshot().active ?? '')
          } catch {
            return ''
          }
        }

        /** The outcome already written to the diagnostics record. */
        let diagnosed = ''

        /**
         * Record why this pass did or did not decorate the list, once per outcome.
         * @param outcome - the short outcome name.
         * @param facts - called only when the outcome changed.
         */
        const diagnose = (outcome, facts) => {
          if (outcome === diagnosed) return
          diagnosed = outcome
          recordDiagnosis(storage, { outcome, ...facts() })
        }

        /** What the page holds right now, for a diagnostics record. */
        const pageFacts = (list) => {
          const trees = [...doc.querySelectorAll('[role="tree"]')]
          const rows = [...doc.querySelectorAll(SESSION_ROW)]
          const first = rows[0]
          const ancestry = []
          let node = first ?? null
          while (node !== null && ancestry.length < 5) {
            ancestry.push(`${node.tagName}.${String(node.getAttribute('class') ?? '').slice(0, 36)}`)
            node = node.parentElement
          }
          return {
            trees: trees.length,
            classes: trees.map(tree => String(tree.getAttribute('class') ?? '')).slice(0, 3),
            children: trees.map(tree => tree.children.length).slice(0, 3),
            kids: trees.map(tree => [...tree.children].slice(0, 3).map(
              kid => `${kid.tagName}.${String(kid.getAttribute('class') ?? '').slice(0, 26)}`,
            )).slice(0, 3),
            rows: rows.length,
            ancestry,
            inside: list !== null && first !== undefined ? list.contains(first) : null,
            section: doc.querySelector('[data-sidebar-workspace-header]') !== null,
            sessions: ctx.get('sessions') !== undefined,
            workspaces: ctx.get('workspaces') !== undefined,
          }
        }

        /** Monotonic milliseconds where available. */
        const nowMs = () => (typeof performance === 'object' && performance !== null
          && typeof performance.now === 'function'
          ? performance.now()
          : Date.now())

        /** Apply one pass: read the rows, group them, and reconcile the DOM. */
        const sync = () => {
          if (disposed) return
          if (!readPrefs().dateGroups) {
            diagnose('disabled', () => pageFacts(container))
            if (container !== null) clear()
            signature = ''
            return
          }
          const started = nowMs()
          const next = findContainer()
          if (next === null) {
            diagnose('no-flat-list', () => pageFacts(container))
            if (container !== null) clear()
            return
          }
          if (next !== container) {
            clearHeaders()
            if (container !== null) forgetSlots(rowSlots(container))
            container = next
            watch(next)
          }

          const items = rowSlots(container)
          const store = summaries()
          if (store === null) {
            diagnose('no-session-store', () => pageFacts(container))
            clearHeaders()
            forgetSlots(items)
            signature = ''
            return
          }
          const now = Date.now()
          const pinned = pinnedIds()
          const entries = items.map((item) => {
            if (pinned !== null && pinned.has(item.id)) return { ...item, bucket: 'pinned' }
            return { ...item, bucket: bucketFor(store[item.id], now) }
          })

          const groups = []
          const runs = new Map()
          for (const entry of entries) {
            const last = groups[groups.length - 1]
            if (last !== undefined && last.bucket === entry.bucket) {
              last.entries.push(entry)
              continue
            }
            const ordinal = runs.get(entry.bucket) ?? 0
            runs.set(entry.bucket, ordinal + 1)
            groups.push({ bucket: entry.bucket, key: `${entry.bucket}#${ordinal}`, entries: [entry] })
          }

          if (groups.length < 2) {
            diagnose('one-section', () => ({ ...pageFacts(container), sections: groups.length }))
            clearHeaders()
            forgetSlots(items)
            signature = ''
            return
          }

          const active = entries.find(entry => entry.row.getAttribute('aria-selected') === 'true')
          if (active !== undefined) {
            if (activeSeen === null) {
              activeSeen = active
            } else if (active.row !== activeSeen.row) {
              activeSeen = active
              if (!expandedOf(active.bucket)) opened.add(active.bucket)
            }
          }

          const fingerprint = [
            groups.map(group => `${group.key}:${group.entries.length}`).join(','),
            entries.length,
            groups.map(group => (expandedOf(group.bucket) ? '1' : '0')).join(''),
            localeTag(),
          ].join('/')
          const intact = [...headers.values()].every(parts => parts.box.isConnected)
          const placed = groups.every((group) => {
            const parts = headers.get(group.key)
            if (parts === undefined) return false
            if (!parts.box.isConnected) return false
            const first = group.entries[0]
            return first === undefined || parts.box.nextElementSibling === first.slot
          })
          if (fingerprint === signature && intact && placed) {
            applyCollapse(groups)
            return
          }

          const used = new Set()
          for (const group of groups) {
            const expanded = expandedOf(group.bucket)
            const parts = headerFor(group.key, group.bucket, group.entries.length, expanded)
            used.add(group.key)
            const first = group.entries[0]
            if (first !== undefined && first.slot.parentElement === container && parts.box.nextElementSibling !== first.slot) {
              container.insertBefore(parts.box, first.slot)
            }
          }
          for (const [key, parts] of headers) {
            if (used.has(key)) continue
            parts.box.remove()
            headers.delete(key)
          }
          applyCollapse(groups)
          signature = fingerprint

          diagnose('grouped', () => ({
            ...pageFacts(container),
            sections: groups.length,
            headers: container.querySelectorAll(`[${HEADER}]`).length,
            hidden: container.querySelectorAll(`[${HIDDEN_ATTR}]`).length,
            ms: Math.round(nowMs() - started),
          }))
        }

        /**
         * Show or hide each run's rows.
         * @param groups - the runs the last pass produced.
         */
        const applyCollapse = (groups) => {
          const collapsed = new Set()
          for (const group of groups) {
            if (expandedOf(group.bucket)) continue
            for (const entry of group.entries) collapsed.add(entry)
          }
          for (const group of groups) {
            for (const entry of group.entries) {
              const hide = collapsed.has(entry)
              for (const node of [entry.slot, entry.row]) {
                const marked = node.hasAttribute(HIDDEN_ATTR)
                if (hide && !marked) node.setAttribute(HIDDEN_ATTR, '')
                else if (!hide && marked) node.removeAttribute(HIDDEN_ATTR)
              }
              if (hide && !entry.slot.hasAttribute('inert')) entry.slot.setAttribute('inert', '')
              else if (!hide && entry.slot.hasAttribute('inert')) entry.slot.removeAttribute('inert')
              if (entry.slot.getAttribute(BUCKET_ATTR) !== group.bucket) {
                entry.slot.setAttribute(BUCKET_ATTR, group.bucket)
              }
            }
          }
        }

        /**
         * Observe the list's ancestor so row changes refresh the grouping.
         * @param node - the container to watch.
         */
        const watch = (node) => {
          const root = node.parentElement ?? node
          if (watched !== null && watched !== root && observer !== null) observer.disconnect()
          watched = root
          if (typeof MutationObserver !== 'function') return
          if (observer === null) observer = new MutationObserver(schedule)
          observer.observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['aria-selected', 'class', ROW_KEY],
          })
        }

        /** Coalesce a burst of DOM changes into one pass. */
        const schedule = () => {
          if (disposed) return
          if (frame !== 0) return
          if (typeof window.requestAnimationFrame === 'function') {
            frame = window.requestAnimationFrame(() => {
              frame = 0
              sync()
            })
            return
          }
          frame = window.setTimeout(() => {
            frame = 0
            sync()
          }, 16)
        }

        const style = doc.createElement('style')
        style.dataset.plugin = STYLE_ID
        style.dataset.pluginCss = 'sidebar-plus/groups'
        style.textContent = GROUPS_CSS
        doc.head.append(style)

        // A switch flip is a page-local preference change, so the next pass runs
        // now instead of waiting for the sweep: turning grouping off must remove
        // the headers while the operator is looking at them.
        const offPrefs = subscribePrefs(() => {
          signature = ''
          schedule()
        })

        sync()
        timer = window.setInterval(sync, SWEEP_MS)

        return () => {
          disposed = true
          offPrefs()
          window.clearInterval(timer)
          timer = 0
          if (frame !== 0 && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frame)
          frame = 0
          if (observer !== null) observer.disconnect()
          observer = null
          watched = null
          clear()
          style.remove()
          expansion = {}
          activeSeen = null
        }
      }, 'sidebar-plus: date headers')
    }

    // -------------------------------------------------------------------------
    // Features 2-4: one drag pipeline
    // -------------------------------------------------------------------------

    /** Stylesheet for the drop highlights and the page-wide mask suppression. */
    const DRAG_CSS = [
      `[${DROP_ATTRIBUTE}]{outline:2px dashed var(--dsw-alias-state-business-primary,#4d6bfe);`,
      'outline-offset:-3px;border-radius:var(--dsw-radius-panel,12px)}',
      `[${COLUMN_ATTRIBUTE}]{outline:2px dashed var(--dsw-alias-state-business-primary,#4d6bfe);`,
      'outline-offset:-3px;border-radius:10px}',
      `html[${DRAGGING_ATTRIBUTE}] body > div[role="status"][class*="_mask"]{display:none!important}`,
    ].join('')

    /** Composer seats mounted by the shell, keyed by their Session. */
    const seats = new Map()
    /** Live client root context, published by `apply` for the slot components. */
    const ctxRef = { current: null }

    /**
     * Claim every Session and folder drag for the plugin lifetime.
     *
     * One capture-phase listener per event, one record for the Session drag, and
     * one for the folder drag; each handler dispatches on what the transfer
     * actually carries:
     *
     * - a `Files` drag over the sidebar becomes a Workspace drop (`folderDrop`);
     * - a Session drag over the list is refused while `Last updated` locks the
     *   order (`sortLock`), and over a conversation it becomes a reference
     *   (`sessionDrag`);
     * - every other transfer keeps the shell's own behavior untouched.
     *
     * @param ctx - client root context.
     */
    function useDragPipeline(ctx) {
      ctx.effect(() => {
        if (typeof window === 'undefined') return undefined
        const hasDocument = typeof document !== 'undefined'
        let style = null
        if (hasDocument) {
          style = document.createElement('style')
          style.dataset.plugin = STYLE_ID
          style.dataset.pluginCss = 'sidebar-plus/drag'
          style.textContent = DRAG_CSS
          document.head.append(style)
        }

        /**
         * The Session drag in flight, or null when no Session row started one.
         * @type {{ session: string, locked: boolean, settled: boolean, settling: boolean } | null}
         */
        let drag = null
        /** Card currently carrying the reference highlight. */
        let highlightedCard = null
        /** Column currently carrying the folder highlight. */
        let highlightedColumn = null
        /** Resolved sidebar column, kept until it leaves the document. */
        let column = null
        /** Last region a folder drag was seen over, for transition-only tracing. */
        let fileZone = null
        /** One workspace registration at a time. */
        let busy = false

        /** Read the persisted mode, tolerating a storage that refuses access. */
        const modeNow = () => {
          try {
            return orderModeOf(window.localStorage)
          } catch {
            return UPDATED
          }
        }

        /** The Desktop bridge that maps a dropped File to its absolute path. */
        const hostPaths = () => {
          const bridge = globalThis.__DSH_HOST_PATHS__
          if (bridge === null || typeof bridge !== 'object') return undefined
          return typeof bridge.pathFor === 'function' ? bridge : undefined
        }

        /**
         * Resolve the sidebar column containing an event target.
         * @param target - the event's deepest target.
         * @returns the column root, or null outside the sidebar.
         */
        const columnOf = (target) => {
          if (typeof Element === 'undefined' || !(target instanceof Element)) return null
          if (column !== null && column.isConnected) {
            return column.contains(target) ? column : null
          }
          let found = null
          for (let node = target; node !== null && node !== undefined; node = node.parentElement) {
            if (declaresColumn(node)) found = node
          }
          column = found
          return found
        }

        /** The document root, when the page has one. */
        const rootElement = () => (hasDocument && document.documentElement !== undefined && document.documentElement !== null
          ? document.documentElement
          : null)

        /** Drop the folder-drag decorations this plugin added. */
        const clearColumnHighlight = () => {
          if (highlightedColumn !== null) {
            highlightedColumn.removeAttribute(COLUMN_ATTRIBUTE)
            highlightedColumn = null
          }
          const root = rootElement()
          if (root !== null) root.removeAttribute(DRAGGING_ATTRIBUTE)
        }

        /** Drop the reference highlight. */
        const clearCardHighlight = () => {
          if (highlightedCard !== null) {
            highlightedCard.removeAttribute(DROP_ATTRIBUTE)
            highlightedCard = null
          }
        }

        /** Drop both highlights. */
        const clearHighlights = () => {
          clearColumnHighlight()
          clearCardHighlight()
        }

        /** Mark the column as the folder drop target and suppress the page mask. */
        const highlightColumn = (node) => {
          if (highlightedColumn === node) return
          clearColumnHighlight()
          highlightedColumn = node
          node.setAttribute(COLUMN_ATTRIBUTE, '')
          const root = rootElement()
          if (root !== null) root.setAttribute(DRAGGING_ATTRIBUTE, '')
        }

        /** Mark the composer card a Session drop will reference into. */
        const highlightCard = (card) => {
          if (highlightedCard === card) return
          clearCardHighlight()
          highlightedCard = card
          card.setAttribute(DROP_ATTRIBUTE, '')
        }

        /**
         * Directory members of a folder drop.
         * @returns the dropped directories, in transfer order.
         */
        const directoriesOf = (transfer, files) => {
          const directories = []
          let index = 0
          for (const item of transfer.items) {
            if (item.kind !== 'file') continue
            const file = files[index]
            index += 1
            if (file === undefined) continue
            let entry = null
            try {
              entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null
            } catch {
              entry = null
            }
            if (entry !== null && entry.isDirectory === true) directories.push(file)
          }
          return directories
        }

        /**
         * Register the folder as a Workspace and open a new Session in it.
         * @param path - absolute directory path from the drop.
         */
        const adopt = async (path) => {
          const workspaces = ctx.get('workspaces')
          const uiWorkspace = ctx.get('uiWorkspace')
          if (workspaces === undefined || workspaces === null || typeof workspaces.create !== 'function') {
            notify(translate(ctx, 'toast.workspaceFailed', { message: 'workspaces service unavailable' }))
            return
          }
          if (busy) return
          busy = true
          try {
            const workspace = await workspaces.create({ path })
            if (uiWorkspace !== undefined && uiWorkspace !== null && typeof uiWorkspace.startSession === 'function') {
              uiWorkspace.startSession(workspace.workspaceId)
            }
          } catch (error) {
            console.warn('[sidebar-plus] could not add the workspace:', error)
            notify(translate(ctx, 'toast.workspaceFailed', { message: error instanceof Error ? error.message : String(error) }))
          } finally {
            busy = false
          }
        }

        /** Optional tracing, enabled with localStorage `dsh.sidebar-plus.debug = 1`. */
        const trace = (...parts) => {
          try {
            if (window.localStorage.getItem('dsh.sidebar-plus.debug') !== '1') return
          } catch {
            return
          }
          console.debug('[sidebar-plus]', ...parts)
        }

        /**
         * Whether this hover is a reorder attempt on a locked list.
         * @param event - a drag event.
         * @returns true when the drop must be refused.
         */
        const locksReorder = (event) => drag !== null && drag.locked && sessionRowElementOf(event.target) !== null

        const onDragStart = (event) => {
          const prefs = readPrefs()
          drag = null
          const sessionId = sessionRowOf(event.target)
          if (sessionId === null) return
          // The lock needs the drag's origin and the mode; the reference needs
          // its own tag. Either feature alone is enough to track the gesture.
          if (!prefs.sessionDrag && !prefs.sortLock) return
          // The mode is read once per gesture: a drag cannot change the order it
          // is judged against.
          drag = {
            session: sessionId,
            locked: prefs.sortLock && modeNow() === UPDATED,
            settled: false,
            settling: false,
          }
          if (!prefs.sessionDrag) return
          const transfer = event.dataTransfer
          if (transfer === null || transfer === undefined || typeof transfer.setData !== 'function') return
          try {
            transfer.setData(SESSION_DRAG_TYPE, sessionId)
          } catch (error) {
            console.warn('[sidebar-plus] could not tag the drag:', error)
          }
        }

        // The row's own handler pins `effectAllowed` to `move`; widening it in
        // the same dispatch (this listener is on the bubble path, after React's)
        // is what lets the composer ask for a copy cursor.
        const onDragStartSettle = (event) => {
          if (drag === null || !readPrefs().sessionDrag) return
          const transfer = event.dataTransfer
          if (transfer === null || transfer === undefined) return
          try {
            transfer.effectAllowed = 'copyMove'
          } catch {
            /* a host that refuses the wider effect keeps `move` */
          }
        }

        const onDragEnter = (event) => {
          if (!readPrefs().folderDrop) return
          const transfer = event.dataTransfer
          if (!isFileDrag(transfer)) return
          const target = columnOf(event.target)
          if (target === null || hostPaths() === undefined) return
          event.preventDefault()
        }

        const onDragOver = (event) => {
          const prefs = readPrefs()
          const transfer = event.dataTransfer

          if (isFileDrag(transfer)) {
            if (!prefs.folderDrop) {
              clearColumnHighlight()
              return
            }
            const target = columnOf(event.target)
            if (target === null) {
              clearColumnHighlight()
              if (fileZone !== 'outside') trace('folder drag outside the sidebar')
              fileZone = 'outside'
              return
            }
            if (hostPaths() === undefined) return
            if (fileZone !== 'sidebar') trace('folder drag over the sidebar')
            fileZone = 'sidebar'
            // Claim the drop without stopping the event: the shell keeps its own
            // drag lifecycle, and an ordinary file drop stays its own.
            event.preventDefault()
            transfer.dropEffect = 'copy'
            highlightColumn(target)
            return
          }

          fileZone = null
          if (prefs.sortLock && locksReorder(event)) {
            // Claiming the hover without accepting it means the row's own handler
            // never arms an insertion marker, and an unaccepted dragover fires no
            // drop here — so the row's order write cannot run.
            event.stopPropagation()
            if (transfer !== null && transfer !== undefined) transfer.dropEffect = 'none'
            clearCardHighlight()
            return
          }

          if (!isSessionDrag(transfer)) {
            clearCardHighlight()
            if (drag !== null && !drag.settling) drag.settled = false
            return
          }
          const active = drag
          if (active === null) return
          if (!active.settling) {
            if (inSidebar(event.target)) {
              active.settled = false
            } else if (!active.settled && !active.locked) {
              // A locked list never records a pending marker, so there is
              // nothing to pin; otherwise the drag has left the sidebar and the
              // pending reorder is reset once per exit.
              active.settled = true
              active.settling = true
              try {
                settleSidebarHover(active.session, transfer)
              } finally {
                active.settling = false
              }
            }
          }
          const target = seatForTarget(event.target)
          if (target === undefined || target.sessionId === active.session) {
            clearCardHighlight()
            return
          }
          event.preventDefault()
          transfer.dropEffect = dropEffectFor(transfer)
          highlightCard(target.card)
        }

        const onDragLeave = (event) => {
          if (!isFileDrag(event.dataTransfer)) return
          const related = event.relatedTarget
          if (column !== null && typeof Element !== 'undefined' && related instanceof Element
            && related.isConnected && column.contains(related)) return
          fileZone = null
          clearColumnHighlight()
        }

        const onDrop = (event) => {
          const prefs = readPrefs()
          const transfer = event.dataTransfer

          if (isFileDrag(transfer)) {
            clearHighlights()
            fileZone = null
            if (!prefs.folderDrop) return
            const target = columnOf(event.target)
            if (target === null) return
            const bridge = hostPaths()
            if (bridge === undefined) return
            const directories = directoriesOf(transfer, transfer.files)
            trace('folder drop over the sidebar', { directories: directories.length })
            if (directories.length === 0) return
            event.preventDefault()
            event.stopPropagation()
            // The shell's own drop handler is stopped here, so release the drag
            // state it would otherwise clear by itself.
            queueMicrotask(() => {
              window.dispatchEvent(new Event('dragend'))
            })
            const path = bridge.pathFor(directories[0])
            if (typeof path !== 'string' || path === '') {
              notify(translate(ctx, 'toast.noPath'))
              return
            }
            void adopt(path)
            return
          }

          if (prefs.sortLock && locksReorder(event)) {
            // Backstop for a drop another ancestor accepted.
            event.preventDefault()
            event.stopPropagation()
            clearHighlights()
            return
          }

          if (!isSessionDrag(transfer)) {
            clearHighlights()
            return
          }
          const target = seatForTarget(event.target)
          const locked = drag !== null && drag.locked
          const sessionId = drag === null ? null : drag.session
          drag = null
          clearHighlights()
          if (target === undefined || sessionId === null) return
          event.preventDefault()
          event.stopPropagation()
          if (!locked) settleSidebarHover(sessionId, transfer)
          insertReference(ctx, sessionId, undefined, target)
        }

        const onDragEnd = () => {
          drag = null
          fileZone = null
          clearHighlights()
        }

        /**
         * Whether a drag target sits inside the sidebar column.
         * @param target - the event target.
         * @returns true inside the sidebar.
         */
        const inSidebar = (target) => {
          if (typeof Element !== 'undefined' && target instanceof Element) {
            if (target.closest(ANY_ROW) !== null) return true
          }
          if (column !== null && column.isConnected === true && typeof column.contains === 'function') {
            return column.contains(target)
          }
          return columnOf(target) !== null
        }

        /**
         * Pin the sidebar's pending insertion marker to the dragged row itself.
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

        /**
         * The rendered sidebar row of one Session, if any.
         * @param sessionId - Session id.
         * @returns the row element, or null.
         */
        const rowForSession = (sessionId) => {
          if (!hasDocument || typeof document.querySelectorAll !== 'function') return null
          const key = `session:${sessionId}`
          for (const row of document.querySelectorAll(ANY_ROW)) {
            if (typeof row.getAttribute === 'function' && row.getAttribute('data-row-key') === key) return row
          }
          return null
        }

        window.addEventListener('dragstart', onDragStart, true)
        window.addEventListener('dragstart', onDragStartSettle)
        window.addEventListener('dragenter', onDragEnter, true)
        window.addEventListener('dragover', onDragOver, true)
        window.addEventListener('dragleave', onDragLeave, true)
        window.addEventListener('drop', onDrop, true)
        window.addEventListener('dragend', onDragEnd, true)
        return () => {
          window.removeEventListener('dragstart', onDragStart, true)
          window.removeEventListener('dragstart', onDragStartSettle)
          window.removeEventListener('dragenter', onDragEnter, true)
          window.removeEventListener('dragover', onDragOver, true)
          window.removeEventListener('dragleave', onDragLeave, true)
          window.removeEventListener('drop', onDrop, true)
          window.removeEventListener('dragend', onDragEnd, true)
          if (style !== null && typeof style.remove === 'function') style.remove()
          clearHighlights()
          drag = null
          fileZone = null
          column = null
        }
      }, 'sidebar-plus: drag pipeline')
    }

    /** Mock-tested seam: the suite drives these directly too. */

    /**
     * The mounted composer a drag target belongs to, with its Session.
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
     * The Session the main conversation column is showing.
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
     * The conversation the main column is showing.
     * @param ctx - client root context.
     * @returns the current Session id, or undefined when nothing is open.
     */
    function currentSessionId(ctx) {
      const id = mainSessionId(ctx)
      if (id !== undefined) return id
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
     * The title a mention should carry.
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
          console.warn('[sidebar-plus] scoped insert failed:', error)
        }
      }
      try {
        if (seat.actions.insertText(`${reference.ref} `, span) === true) return 'text'
      } catch (error) {
        console.warn('[sidebar-plus] text insert failed:', error)
      }
      return 'failed'
    }

    /**
     * Give the keyboard to the composer that is about to receive the reference.
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
        console.warn('[sidebar-plus] could not focus the composer:', error)
      }
    }

    /**
     * Insert the referenced Session into the current conversation.
     * @param ctx - client root context.
     * @param sessionId - Session being referenced.
     * @param label - that Session's row title, when the gesture had one.
     * @param explicitTarget - the composer a drop landed on.
     */
    function insertReference(ctx, sessionId, label, explicitTarget) {
      if (!readPrefs().sessionDrag) return
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
        const location = target.seat.actions.captureInsertion()
        focusComposer(target.seat)
        const revision = target.seat.actions.captureInsertion()
        const span = { start: location.start, end: location.end, draftRev: revision.draftRev }
        const outcome = applyReference(ctx, target.sessionId, target.seat, reference, span)
        if (outcome === 'failed') notify(translate(ctx, 'toast.failed'))
      } catch (error) {
        console.warn('[sidebar-plus] insert failed:', error)
        notify(translate(ctx, 'toast.failed'))
      }
    }

    // -------------------------------------------------------------------------
    // Slot components
    // -------------------------------------------------------------------------

    /**
     * Inert seat: records the mounted composer's action face, the draft
     * projection the reference limit is checked against, and one anchor node
     * inside the composer card so the pick can focus its editor.
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
     * The sidebar Session-menu row. Offered only while the reference feature is
     * on, when a composer is mounted, and never on the conversation that
     * composer belongs to.
     * @param props - row props: the Session, its title, and the menu's dismissal hook.
     * @returns the menu row, or null when there is nothing to reference it into.
     */
    function ReferenceMenuRow(props) {
      const { sessionId, displayTitle, useMenuOpenState } = props
      const [, setMenuOpen] = useMenuOpenState()
      if (!readPrefs().sessionDrag) return null
      if (seats.size === 0) return null
      const current = currentSessionId(ctxRef.current)
      if (current !== undefined && current === sessionId) return null
      const t = typeof props.t === 'function' ? props.t : (key, params) => translate(ctxRef.current, key, params)
      const label = t('row.insert')
      const select = () => {
        setMenuOpen(false)
        insertReference(ctxRef.current, sessionId, displayTitle)
      }
      return h('button', {
        type: 'button',
        role: 'menuitem',
        onClick: select,
        style: { display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 0, background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer' },
      }, label)
    }

    /** One switch row. */
    function PreferenceRow(key, title, description, checked, onToggle) {
      return h('div', { key, className: 'dsh-sbp-row' }, [
        h('span', { key: 'text', className: 'dsh-sbp-text' }, [
          h('span', { key: 'title', className: 'dsh-sbp-title' }, title),
          h('span', { key: 'desc', className: 'dsh-sbp-desc' }, description),
        ]),
        h('button', {
          key: 'switch',
          type: 'button',
          role: 'switch',
          'aria-checked': checked ? 'true' : 'false',
          'aria-label': title,
          className: 'dsh-sbp-switch',
          onClick: () => { onToggle(!checked) },
        }, h('span', { key: 'knob', className: 'dsh-sbp-knob' })),
      ])
    }

    /**
     * The Settings section this bundle owns: one switch per feature.
     *
     * The switches are browser-local, so the page writes straight to the
     * preference record and every consumer re-reads it on its next event; no
     * Host round trip sits between the click and the effect.
     */
    function PreferencesSection() {
      const [, setTick] = React.useState(0)
      React.useEffect(() => subscribePrefs(() => { setTick((n) => n + 1) }), [])
      const ctx = ctxRef.current
      const prefs = readPrefs()
      const t = (key) => translate(ctx, key)
      return h('div', { className: 'dsh-sbp-page' }, [
        h('p', { key: 'intro', className: 'dsh-sbp-intro' }, t('settings.intro')),
        PreferenceRow('dateGroups', t('settings.dateGroups'), t('settings.dateGroups.desc'), prefs.dateGroups, (value) => { updatePrefs({ dateGroups: value }) }),
        PreferenceRow('sessionDrag', t('settings.sessionDrag'), t('settings.sessionDrag.desc'), prefs.sessionDrag, (value) => { updatePrefs({ sessionDrag: value }) }),
        PreferenceRow('sortLock', t('settings.sortLock'), t('settings.sortLock.desc'), prefs.sortLock, (value) => { updatePrefs({ sortLock: value }) }),
        PreferenceRow('folderDrop', t('settings.folderDrop'), t('settings.folderDrop.desc'), prefs.folderDrop, (value) => { updatePrefs({ folderDrop: value }) }),
      ])
    }

    /** Stylesheet for the Settings section. */
    const SETTINGS_CSS = `
.dsh-sbp-page{display:flex;flex-direction:column;gap:2px;padding:4px 0}
.dsh-sbp-intro{margin:0 0 8px;color:var(--dsw-alias-label-tertiary,#8b8b92);font-size:12px;line-height:18px}
.dsh-sbp-row{display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--dsw-alias-border-subtle,rgba(255,255,255,.08))}
.dsh-sbp-row:last-child{border-bottom:0}
.dsh-sbp-text{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}
.dsh-sbp-title{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,#f5f5f7)}
.dsh-sbp-desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#8b8b92)}
.dsh-sbp-switch{flex:none;position:relative;width:36px;height:20px;border-radius:999px;border:0;padding:0;margin-top:1px;
  background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.14));cursor:pointer;transition:background 120ms ease}
.dsh-sbp-switch[aria-checked="true"]{background:var(--dsw-alias-state-business-primary,#4d6bfe)}
.dsh-sbp-knob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform 120ms ease}
.dsh-sbp-switch[aria-checked="true"] .dsh-sbp-knob{transform:translateX(16px)}
.dsh-sbp-switch:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4d6bfe));outline-offset:2px}
`

    // -------------------------------------------------------------------------
    // Activation
    // -------------------------------------------------------------------------

    /**
     * Activate the bundle, recording a fault instead of letting it disappear.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      try {
        ctxRef.current = ctx

        ctx.effect(() => ctx.locale.register(NS, DICTIONARIES), 'sidebar-plus: dictionaries')

        // Another tab's switch change reaches this page through `storage`; the
        // cache is dropped so the next event path reads the new value, and the
        // page-local listeners re-run so the Settings page and date groups agree.
        ctx.effect(() => {
          if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined
          const onStorage = (event) => {
            if (event !== null && event !== undefined && typeof event.key === 'string' && event.key !== PREFS_KEY) return
            prefsCache = null
            for (const listener of [...prefsListeners]) {
              try {
                listener()
              } catch (error) {
                console.warn('[sidebar-plus] preference listener failed:', error)
              }
            }
          }
          window.addEventListener('storage', onStorage)
          return () => window.removeEventListener('storage', onStorage)
        }, 'sidebar-plus: cross-tab preferences')

        ctx.effect(() => () => {
          seats.clear()
          hideToast()
        }, 'sidebar-plus: seats')

        useDateGroups(ctx)
        useDragPipeline(ctx)

        ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
          name: 'conversation.input.overlay',
          id: 'sidebar-plus-seat',
          order: 0,
        }, ComposerSeat))

        // The Settings page needs a stylesheet of its own; it renders only when
        // the settings shell mounts the section.
        ctx.effect(() => {
          if (typeof document === 'undefined') return undefined
          const style = document.createElement('style')
          style.dataset.plugin = STYLE_ID
          style.dataset.pluginCss = 'sidebar-plus/settings'
          style.textContent = SETTINGS_CSS
          document.head.append(style)
          return () => style.remove()
        }, 'sidebar-plus: settings stylesheet')

        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'sidebar-plus',
          order: 200,
          // A thunk, not a string: the shell re-reads it on every projection, so
          // switching the UI language renames the nav entry without a reload.
          label: () => translate(ctx, 'settings.title'),
        }, PreferencesSection))

        ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
          name: 'sidebar.workspaces.session.menu.item',
          id: 'sidebar-plus-row',
          order: 300,
          locale: NS,
        }, ReferenceMenuRow))
      } catch (error) {
        let storage = null
        try {
          storage = window.localStorage ?? null
        } catch {
          storage = null
        }
        const message = error === null || error === undefined ? String(error) : String(error.message ?? error)
        recordDiagnosis(storage, { outcome: 'crashed', message: message.slice(0, 180) })
        throw error
      }
    }

    return {
      name: 'sidebar-plus',
      inject: ['slots', 'locale', 'sessions'],
      apply,
      /** Pure helpers, exposed for the offline behaviour tests only. */
      __internals: {
        escapeLabel,
        encodeSessionUri,
        formatMention,
        countReferences,
        MAX_REFERENCES,
        orderModeOf,
        readPrefs,
        updatePrefs,
        subscribePrefs,
        PREF_DEFAULTS,
        PREFS_KEY,
      },
    }
  },
})
