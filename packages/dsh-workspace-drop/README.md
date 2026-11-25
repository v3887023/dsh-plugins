# Drag a folder onto the sidebar to add a Workspace

`@v3887023/dsh-workspace-drop` turns a folder dropped on the Harness sidebar into a
Workspace, and opens a new Session in it.

## Behavior

- Drag one folder from Explorer (or Finder) and release it over the sidebar —
  expanded column or collapsed rail, including any part of the Workspace list.
- If no Workspace holds that folder yet, it is registered and appears in the
  sidebar in the position the Workspace registry chooses.
- If a Workspace already holds that folder, that Workspace is reused unchanged —
  nothing is duplicated.
- Either way a new Session is opened in that Workspace through the same
  navigation the **New Session** button uses, so an existing unsent blank draft
  in that Workspace is reused instead of creating a second blank.

While a file drag hovers the sidebar it is outlined with the theme's business
color, and the shell's page-wide file-drop mask is hidden so it does not cover
the column. A browser reports a dragged folder and a dragged file identically
until the drop, so the outline appears for either; only a folder is taken over.
Dropping an ordinary file on the sidebar keeps the shell's behavior: the file
still becomes a composer attachment.

## Requirements and limits

- **Desktop only.** The absolute path of a dropped folder comes from the Desktop
  preload bridge (`__DSH_HOST_PATHS__.pathFor`). In a plain browser the same
  drag shows no sidebar outline and keeps the shell's own behavior, because a
  browser exposes no absolute path for a dropped directory.
- **One folder per drop.** Dropping several directories registers the first one
  only.
- **Exact path only.** The folder is matched against registered Workspaces by
  canonical path; its parent or a child Workspace is never reused.
- **No file-type filtering.** The drop handler uses the drag entry API, so a
  directory is recognized even when the folder is empty.
- **Registration can fail.** A missing path, a file instead of a folder, or a
  Host refusal shows a transient notice with the Host's message; nothing in the
  sidebar changes.

## Implementation notes

The sidebar publishes no drop seat, so the gesture is claimed at the window's
capture phase. Over the sidebar a `Files` drag is cancelled (so the drop is
guaranteed) without stopping the event: the shell still sees the whole drag
lifecycle, which is what keeps every other drop region — the conversation, the
composer — working as before. Only the `drop` of a directory over the sidebar is
stopped, which keeps the folder out of the composer; an ordinary file drop is
never stopped. The column is recognized through the CSS contract its owner
documents (`--dsh-sidebar-inline-padding` is declared on the column root and
inherited by its contents), not through a generated class name, so rebuilding
the shell keeps the gesture working.

Everything the plugin adds — listeners, the stylesheet, the highlight attribute,
the notice — is removed by the `ctx.effect` cleanup when the plugin unloads.

## Test

`npm test` (or `node test/drop.test.mjs`) runs the client half against a minimal
DOM: folders, ordinary files, drops outside the sidebar, a missing Desktop
bridge, a Host refusal, and unload cleanup. Enable gesture tracing in the running
page with `localStorage.setItem('dsh.workspace-drop.debug', '1')`; every zone
change and drop is then logged as `[workspace-drop] …` in the console.
