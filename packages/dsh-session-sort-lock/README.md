# Keep the sidebar's “Last updated” order

> **Superseded.** This plugin is now half of
> [`@v3887023/dsh-session-drag`](../dsh-session-drag/README.md), which owns the
> whole Session drag gesture — the reference and the "Last updated" order lock —
> in one bundle, so the refusal and the drag-to-composer tag are decided in one
> handler instead of two competing capture listeners. Disable this plugin
> **before** installing that one.

`@v3887023/dsh-session-sort-lock` stops a Session drag from silently replacing the
sidebar's **Last updated** order with a manual one.

## Behavior

- With **Order by → Last updated** selected, dropping a Session on another
  Session no longer writes a manual layout. The list keeps sorting by the latest
  prompt, so its rows stay where the times put them.
- The drag itself still starts, so dragging a Session onto the composer keeps
  inserting a reference exactly as before — only a drop over the Session list is
  refused.
- While such a drag hovers the list, the rows show no insertion marker and the
  pointer reports a refused drop. The refusal is silent: releasing there changes
  nothing and shows no notice.
- Choosing **Order by → Manual** restores ordinary drag reordering, with no
  interception.
- Works in every grouping (by Workspace, by Workspace tree, one list) and for
  every account, because it applies to the Session rows themselves.

## Requirements and limits

- **Depends on the persisted view record.** The mode is read from the sidebar's
  own browser record (`dsh.workspace.view.v<generation>` in `localStorage`). If
  no record exists yet, the product default — Last updated — is assumed.
- **Not a permission gate.** Row-level access still decides whether a drag may
  start at all; this plugin only refuses the reorder drop.
- **Pin and archive are untouched.** They are explicit row actions, not drags,
  and keep their existing behavior (pinning does not change the order mode).
- **Silent by design.** The refused pointer is the only feedback; no toast or
  notice is added, so a drag that merely crosses the list stays quiet.

## Implementation notes

The Session list publishes no seat for “this row is not reorderable right now”,
so the refusal happens at the window's capture phase. `dragstart` only records
whether the gesture began on a Session row; the drag is left alone so the shell
can keep dragging that row onto the composer. `dragover` over a Session row is
claimed but not accepted, which suppresses the row's own hover handler (no
insertion marker) and means the browser fires no `drop` there — so the row's
order write, the one that switches the store to **Manual**, never runs. A
captured `drop` remains as a backstop for a drop another ancestor accepted.

The row is recognized by its stable `data-row-key="session:<id>"` attribute, and
the mode by the store's own persistence contract: one record per browser under
`dsh.workspace.view.v<generation>`, newest generation first. Neither a generated
class name nor a localized menu label is involved, so a rebuilt shell keeps the
lock working.

Everything the plugin adds — the four capture listeners — is removed by the
`ctx.effect` cleanup when the plugin unloads.

## Test

`npm test` (or `node test/lock.test.mjs`) runs the client half against a minimal
DOM: the locked mode, a reference drag that ends on the composer, manual mode, a
browser with no record yet, a newer store generation, Workspace drags, a stale
drag, and unload cleanup.
