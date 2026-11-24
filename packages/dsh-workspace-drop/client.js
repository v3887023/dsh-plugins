/**
 * Client half of the sidebar workspace-drop bundle.
 *
 * Dropping a folder on the sidebar registers it as a Workspace and opens a new
 * Session in it, instead of the shell's own page-wide file drop (which would
 * hand the folder to the composer).
 *
 * The sidebar publishes no drop seat, so the gesture is claimed at the window's
 * capture phase. Over the sidebar a `Files` drag is cancelled so the drop is
 * guaranteed, but the event still reaches the shell: its drag lifecycle stays
 * intact, so every other drop region keeps behaving exactly as before. Only the
 * final `drop` of a directory over the sidebar is stopped, which is what keeps
 * the folder out of the composer; an ordinary file drop is never stopped.
 *
 * The column is recognized through the CSS contract its owner documents
 * (`--dsh-sidebar-inline-padding`), not through a generated class name, so a
 * rebuilt shell keeps working.
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-workspace-drop',
  factory(require) {
    /** Locale namespace owned by this plugin. */
    const NS = 'workspaceDrop'

    /** Chinese copy. */
    const zh = {
      failed: '添加工作区失败：{message}',
      noPath: '无法读取该文件夹的路径',
    }
    /** English copy. */
    const en = {
      failed: 'Could not add the workspace: {message}',
      noPath: 'The folder path is unavailable',
    }
    /** Japanese copy. */
    const ja = {
      failed: 'ワークスペースを追加できませんでした: {message}',
      noPath: 'フォルダーのパスを取得できません',
    }
    /** Spanish copy. */
    const es = {
      failed: 'No se pudo añadir el espacio de trabajo: {message}',
      noPath: 'La ruta de la carpeta no está disponible',
    }
    /** French copy. */
    const fr = {
      failed: "Impossible d'ajouter l'espace de travail : {message}",
      noPath: 'Le chemin du dossier est indisponible',
    }
    /** German copy. */
    const de = {
      failed: 'Arbeitsbereich konnte nicht hinzugefügt werden: {message}',
      noPath: 'Der Ordnerpfad ist nicht verfügbar',
    }
    /** Russian copy. */
    const ru = {
      failed: 'Не удалось добавить рабочую область: {message}',
      noPath: 'Путь к папке недоступен',
    }
    /** Portuguese copy. */
    const pt = {
      failed: 'Não foi possível adicionar a área de trabalho: {message}',
      noPath: 'O caminho da pasta não está disponível',
    }

    /** Inherited custom property the sidebar column declares on its root. */
    const SIDEBAR_MARKER = '--dsh-sidebar-inline-padding'
    /** Highlight attribute placed on the column while a folder hovers it. */
    const DROP_ATTRIBUTE = 'data-dsh-workspace-drop'
    /** Document flag that hides the shell's page-wide drop mask. */
    const DRAGGING_ATTRIBUTE = 'data-dsh-workspace-dragging'
    /** Stylesheet identity used for the plugin's own <style> element. */
    const STYLE_ID = '@local/dsh-workspace-drop/sidebar-drop.css'

    const CSS = [
      `[${DROP_ATTRIBUTE}]{outline:2px dashed var(--dsw-alias-state-business-primary,#4d6bfe);`,
      'outline-offset:-3px;border-radius:10px}',
      `html[${DRAGGING_ATTRIBUTE}] body > div[role="status"][class*="_mask"]{display:none!important}`,
    ].join('')

    /**
     * Mount the drop target for the whole plugin lifetime.
     * @param ctx - client root context carrying locale, workspaces, uiWorkspace.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'workspace-drop: dictionaries')
      const t = ctx.locale.bind(NS)

      /** The Desktop bridge that maps a dropped File to its absolute path. */
      const hostPaths = () => {
        const bridge = globalThis.__DSH_HOST_PATHS__
        if (bridge === null || typeof bridge !== 'object') return undefined
        return typeof bridge.pathFor === 'function' ? bridge : undefined
      }

      /** Resolved sidebar column, kept until it leaves the document. */
      let column = null
      /** Last region a file drag was seen over, for transition-only tracing. */
      let lastZone = null
      /** Element currently carrying the highlight attribute. */
      let highlighted = null
      /** One toast at a time, so repeated failures do not stack. */
      let toast = null
      let toastTimer = 0
      let busy = false

      /**
       * Resolve the sidebar column containing an event target.
       * @param target - the event's deepest target.
       * @returns the column root, or null outside the sidebar.
       */
      const columnOf = (target) => {
        if (!(target instanceof Element)) return null
        if (column !== null && column.isConnected) {
          return column.contains(target) ? column : null
        }
        let found = null
        for (let node = target; node !== null; node = node.parentElement) {
          if (getComputedStyle(node).getPropertyValue(SIDEBAR_MARKER).trim() !== '') found = node
        }
        if (found === null) column = null
        else column = found
        return found
      }

      /** Whether this transfer carries external files. */
      const isFileDrag = (transfer) => transfer !== null && Array.prototype.includes.call(transfer.types, 'Files')

      /**
       * Directory members of a drop. A directory arrives as a File that is
       * indistinguishable from an empty one, so the entry API decides it.
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

      /** Mark the column as the active drop target and suppress the page mask. */
      const highlight = (node) => {
        if (highlighted === node) return
        unhighlight()
        highlighted = node
        node.setAttribute(DROP_ATTRIBUTE, '')
        document.documentElement.setAttribute(DRAGGING_ATTRIBUTE, '')
      }

      /** Drop every drag decoration this plugin added. */
      const unhighlight = () => {
        if (highlighted !== null) {
          highlighted.removeAttribute(DROP_ATTRIBUTE)
          highlighted = null
        }
        document.documentElement.removeAttribute(DRAGGING_ATTRIBUTE)
      }

      /** Remove the transient failure notice. */
      const hideToast = () => {
        window.clearTimeout(toastTimer)
        toastTimer = 0
        toast?.remove()
        toast = null
      }

      /**
       * Show a transient notice over the page.
       * @param message - already-localized text.
       */
      const notify = (message) => {
        hideToast()
        if (typeof document.body === 'undefined') return
        const element = document.createElement('div')
        element.setAttribute('role', 'status')
        element.textContent = message
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

      /**
       * Register the folder as a Workspace and open a new Session in it.
       * Creating a Workspace that already holds that path returns the existing
       * one unchanged, so both cases end in the same place.
       * @param path - absolute directory path from the drop.
       */
      const adopt = async (path) => {
        if (busy) return
        busy = true
        try {
          const workspace = await ctx.workspaces.create({ path })
          ctx.uiWorkspace.startSession(workspace.workspaceId)
        } catch (error) {
          console.warn('[workspace-drop] could not add the workspace:', error)
          notify(t('failed', { message: error instanceof Error ? error.message : String(error) }))
        } finally {
          busy = false
        }
      }

      /** Optional tracing, enabled with localStorage `dsh.workspace-drop.debug = 1`. */
      const trace = (...parts) => {
        try {
          if (window.localStorage.getItem('dsh.workspace-drop.debug') !== '1') return
        } catch {
          return
        }
        console.debug('[workspace-drop]', ...parts)
      }

      const onDragOver = (event) => {
        const transfer = event.dataTransfer
        if (!isFileDrag(transfer)) {
          unhighlight()
          return
        }
        const target = columnOf(event.target)
        if (target === null) {
          unhighlight()
          if (lastZone !== 'outside') trace('dragover outside the sidebar', { types: [...transfer.types] })
          lastZone = 'outside'
          return
        }
        if (hostPaths() === undefined) return
        if (lastZone !== 'sidebar') trace('dragover over the sidebar', { types: [...transfer.types] })
        lastZone = 'sidebar'
        // Claim the drop without stopping the event: the shell keeps its own
        // drag lifecycle (and so every other drop region keeps working), while
        // the page is guaranteed to receive a drop here even when the composer
        // refuses files right now.
        event.preventDefault()
        transfer.dropEffect = 'copy'
        highlight(target)
      }

      const onDragEnter = (event) => {
        const transfer = event.dataTransfer
        if (!isFileDrag(transfer)) return
        const target = columnOf(event.target)
        if (target === null || hostPaths() === undefined) return
        event.preventDefault()
      }

      const onDragLeave = (event) => {
        if (!isFileDrag(event.dataTransfer)) return
        const related = event.relatedTarget
        if (column !== null && related instanceof Element && related.isConnected && column.contains(related)) return
        lastZone = null
        unhighlight()
      }

      const onDrop = (event) => {
        const transfer = event.dataTransfer
        if (!isFileDrag(transfer)) {
          unhighlight()
          return
        }
        const target = columnOf(event.target)
        lastZone = null
        unhighlight()
        if (target === null) return
        const bridge = hostPaths()
        if (bridge === undefined) return
        const directories = directoriesOf(transfer, transfer.files)
        trace('drop over the sidebar', { directories: directories.length, types: [...transfer.types] })
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
          notify(t('noPath'))
          return
        }
        void adopt(path)
      }

      const onDragEnd = () => {
        lastZone = null
        unhighlight()
      }

      ctx.effect(() => {
        const style = document.createElement('style')
        style.dataset.plugin = '@local/dsh-workspace-drop'
        style.dataset.pluginCss = STYLE_ID
        style.textContent = CSS
        document.head.append(style)
        window.addEventListener('dragenter', onDragEnter, true)
        window.addEventListener('dragover', onDragOver, true)
        window.addEventListener('dragleave', onDragLeave, true)
        window.addEventListener('drop', onDrop, true)
        window.addEventListener('dragend', onDragEnd, true)
        return () => {
          window.removeEventListener('dragenter', onDragEnter, true)
          window.removeEventListener('dragover', onDragOver, true)
          window.removeEventListener('dragleave', onDragLeave, true)
          window.removeEventListener('drop', onDrop, true)
          window.removeEventListener('dragend', onDragEnd, true)
          style.remove()
          unhighlight()
          hideToast()
          column = null
        }
      }, 'workspace-drop: sidebar drag target')
    }

    return {
      name: 'workspace-drop',
      inject: ['locale', 'workspaces', 'uiWorkspace'],
      apply,
    }
  },
})
