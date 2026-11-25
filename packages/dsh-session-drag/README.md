# Drag a Session: reference it, or refuse a reorder

> **Superseded.** This plugin is now part of
> [`@v3887023/dsh-sidebar-plus`](../dsh-sidebar-plus/README.md), which merges it
> with the date groups and the folder-drop Workspace into one sidebar bundle with
> one switch per feature. Disable this plugin **before** installing that one.

`@v3887023/dsh-session-drag` claims one sidebar Session drag and answers it by
where it is released.

- **Dropped on a conversation** — its transcript or its input box — the Session
  is *referenced* there: the composer receives the same atomic chip the `@`
  mention menu inserts, carrying `@[title](dsh-session:…)`, and the Host turns
  that mention into a bounded, read-only snapshot of the referenced Session when
  the message is sent. The composer that will receive it outlines while the row
  hovers it. The same reference is one sidebar context-menu row,
  **引用到当前对话**, for pointer-free use.
- **Dropped back on the Session list** while **Order by → Last updated** is
  selected, the drop is *refused*: a Session drag can no longer silently flip the
  list to manual ordering and reshuffle every row. The drag itself still starts,
  so dragging a Session onto a conversation keeps working; only a release over
  the Session list is refused.

## Behavior

- Right-click a Session → **引用到当前对话** → the reference lands in the
  composer of the conversation you are looking at, at the caret (or at the end
  of the draft), and the composer takes the keyboard: focus and the caret land
  right after the new chip.
- Or drag the Session row out of the sidebar and drop it on the conversation.
- The row is offered only when there is a composer to insert into, and never on
  the conversation that composer belongs to: a Session cannot reference itself.
  A menu opened before the conversation changed re-resolves on the pick and
  refuses with a notice instead; a drag over that same conversation is refused
  with the no-drop cursor.
- One message may reference at most three distinct Sessions. A fourth is refused
  with a notice instead of silently breaking the send.
- With **Order by → Last updated**, hovering a Session row with a dragged
  Session shows no insertion marker and the pointer reports a refused drop. The
  refusal is silent: releasing there changes nothing.
- Choosing **Order by → Manual** restores ordinary drag reordering, with no
  interception. The lock works in every grouping (by Workspace, by Workspace
  tree, one list) and for every account.
- Insertion is the shell's own chip path. If a Host build does not answer that
  path, the reference falls back to the plain-text mention: it still resolves
  when sent, it just renders as text inside the draft.

## Why one plugin

These were two plugins, `dsh-session-reference` and `dsh-session-sort-lock`,
that both claimed `window`'s capture phase for the same `dragstart` /
`dragover` / `drop` / `dragend` events. They only worked together by
coincidence: the lock refused a row hover with `stopPropagation`, while the
reference relied on delivering a synthetic row hover to pin the sidebar's
pending insertion marker. Whether that stayed safe depended on the profile's
Loader row order and on each plugin's listener stage.

One shared drag record now carries both facts — the Session the drag started on
and whether the list is locked — so one handler per event decides in one place
whether the gesture is a reference or a refused reorder. Dropping the refusal
branch, or the tag branch, cannot silently break the other half.

## Migrating from the two older plugins

Install this one and disable **both** older bundles in **Plugins**:

- `@v3887023/dsh-session-reference`
- `@v3887023/dsh-session-sort-lock`

Leaving one of them enabled mounts its half twice: the menu row appears twice,
and two drag handlers fight over the same events. Nothing else has to be
migrated — the plugin stores no per-profile state, and the sidebar's own view
record and collapse choices are untouched.

## Requirements and limits

- **Web/Desktop, Client only.** It uses the composer's public `inputActions`
  face plus the shell's scoped input events; there is no Host half and no
  configuration.
- **Decorates, never replaces.** Rows keep their own drag, menu, hover card, and
  keyboard behavior; the plugin adds a menu row, one highlight attribute, and
  the refusals described above, and removes all of them on unload.
- **Depends on product contracts, not styling.** A Session row is recognized by
  `data-row-key="session:<id>"`; the order mode is read from the sidebar's own
  browser record (`dsh.workspace.view.v<generation>` in `localStorage`), with an
  absent or unreadable record falling back to the product default, **Last
  updated**. A shell rebuilt to drop those attributes or that record would stop
  it.
- **Not a permission gate.** Row-level access still decides whether a drag may
  start at all; the lock only refuses the reorder drop.
- **Pin and archive are untouched.** They are explicit row actions, not drags.
- **The drop target is a conversation.** A drag references the conversation
  whose transcript or composer is under the pointer; everywhere else — the
  sidebar, the right panels, the frame chrome — keeps its own gesture.
- **Breakable internal contract.** The chip path dispatches a shell-owned event
  (`slash/input-insert-reference`); the fallback keeps the feature usable if a
  build stops answering it.

## Implementation notes

One effect owns the whole gesture. `dragstart` records the Session row it began
on, the order mode (read once per gesture from the newest persisted view
record), and the marker bookkeeping the reference needs. `dragover` and `drop`
then answer in this order:

1. **Locked list, Session-row target** — the event is claimed with
   `stopPropagation` and `dropEffect = 'none'`, so the row's own handler never
   arms an insertion marker and the browser fires no drop there; the row's order
   write cannot run. A captured `drop` stays as a backstop for a drop another
   ancestor accepted.
2. **Conversation target** — only a transfer carrying this plugin's own type is
   considered, so dragged prose and file drags keep their behavior. The drop is
   accepted, the composer is highlighted, and the reference is inserted through
   the shell's scoped chip event (plain-text fallback otherwise).
3. **Every other target** — no claim: the shell keeps its own feedback.

Leaving the sidebar pins the shell's pending insertion marker to the dragged row
once per exit, by dispatching the row hover the sidebar itself listens for;
`commitSessionDrag` already treats "drop on the dragged row" as a no-op, so a
reference drop cannot reorder the list. That bookkeeping is skipped entirely on a
locked list: the lock already refuses every row hover, so no marker exists to
pin, and the synthetic hover would only be refused in turn.

`effectAllowed` is widened to `copyMove` on the `dragstart` bubble path (after
the row's own handler pinned it to `move`), which is what lets the composer ask
for a copy cursor; a host that keeps `move` is still answered with `move`.
