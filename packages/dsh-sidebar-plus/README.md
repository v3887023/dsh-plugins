# Sidebar enhancements

`@v3887023/dsh-sidebar-plus` is one bundle for the sidebar. It groups Sessions
by date, references a Session by dragging it, keeps the "Last updated" order
honest, and turns a dropped folder into a Workspace — and **Settings → Sidebar**
has one switch per feature.

## The four features

1. **Date groups.** In the single-list grouping, the flat run of Sessions gains
   headers: **Pinned**, **Today**, **Yesterday**, then one collapsible section
   per calendar day. Only Today (and Pinned) start open, the choice is remembered
   per browser, and an unused New Session draft always sits under Today.
2. **Reference by drag.** Drop a Session row on a conversation — its transcript
   or its input box — and the composer receives the same atomic
   `@[title](dsh-session:…)` chip the `@` menu inserts. Right-clicking a Session
   and picking **引用到当前对话** does the same from the menu.
3. **Order lock.** With **Order by → Last updated** selected, dropping a Session
   back on the list is refused, so one drag can no longer silently replace the
   chosen order with a manual layout. **Order by → Manual** keeps the normal
   gesture.
4. **Folder drop.** Drop a folder on the sidebar — expanded column or collapsed
   rail — and it is registered as a Workspace with a new Session opened in it.
   Dropping an ordinary file keeps the shell's behavior.

## The switches

Open **Settings → Sidebar**. Each switch applies immediately and is stored in
this browser, under `dsh.sidebar-plus.v1` in `localStorage`; no patch file is
edited and no page reload is needed.

- **Group Sessions by date** — off leaves the flat list exactly as the shell
  renders it.
- **Reference a Session by dragging it** — off removes the menu row and the drop
  target; the order lock keeps working on its own.
- **Lock the "Last updated" order** — off restores ordinary drag reordering in
  every grouping.
- **Add a Workspace by dropping a folder** — off leaves folder drops to the
  shell.

Turning a feature off cannot leave debris behind: each one removes its own nodes,
attributes, and stylesheet, and the date-groups pass and the drag pipeline check
their switch on every event, so a change lands on the next gesture or the next
one-second sweep.

## Why one bundle

These were four plugins: `dsh-session-date-groups`, `dsh-session-reference`,
`dsh-session-sort-lock`, and `dsh-workspace-drop`. The last three all claimed
`window`'s capture phase for the same `dragstart` / `dragenter` / `dragover` /
`dragleave` / `drop` / `dragend` events, and stayed out of each other's way only
because one answered Session drags and another answered `Files` drags — the
reference relied on delivering a synthetic row hover to pin the sidebar's
pending marker, while the lock refused that same hover with
`stopPropagation`. Which behaviour won depended on Loader row order.

One pipeline now decides each event once, dispatching on the transfer it
actually carries. Everything else is a DOM decoration, so the bundle adds nodes
and attributes, never replaces a row, and removes everything on unload.

## Migrating from the four older plugins

Install this bundle and disable **all four**:

- `@v3887023/dsh-session-date-groups`
- `@v3887023/dsh-session-reference`
- `@v3887023/dsh-session-sort-lock`
- `@v3887023/dsh-workspace-drop`

Leaving any of them enabled mounts its feature twice: two sets of date headers,
a duplicated menu row, or two drag handlers racing over the same events. The
older ones are out of the index, but their released tags stay in git.

The switches are new, so the bundle starts with everything on — the same
behaviour the four plugins gave together. The date-group collapse record
(`dsh.session-date-groups.v1`) is the same key the old plugin used, so an
existing set of collapsed days survives the move.

## Requirements and limits

- **Web/Desktop, Client only.** No Host half and no configuration; the switches
  are browser-local, so they do not follow the account across browsers.
- **Depends on product contracts, not generated class names.** A Session row is
  `data-row-key="session:<id>"`; the flat list is the `role="tree"` element whose
  class marks it; the sidebar column declares `--dsh-sidebar-inline-padding`; the
  order mode is read from the sidebar's own record
  (`dsh.workspace.view.v<generation>` in `localStorage`). A shell rebuilt to drop
  those attributes or that record would stop the matching feature.
- **Folder drop is Desktop-only.** The absolute path comes from the Desktop
  preload bridge (`__DSH_HOST_PATHS__.pathFor`); a plain browser shows no
  highlight and keeps its own behavior. One folder per drop, matched by exact
  canonical path.
- **Reference chip path is a shell contract.** It dispatches
  `slash/input-insert-reference`; if a build stops answering it, the reference
  falls back to the plain-text mention, which still resolves when sent.
- **One message may reference at most three distinct Sessions.** A fourth is
  refused with a notice.
- **The lock is not a permission gate.** Row-level access still decides whether
  a drag starts at all; the lock only refuses the reorder drop.
- **Debug tracing.** Set `localStorage['dsh.sidebar-plus.debug'] = 1` to log the
  folder-drag zone changes and drops; the older `dsh.workspace-drop.debug` key is
  no longer read.

## Implementation notes

**Date groups** decorate the built-in list. One pass reads the row elements in
document order, classifies each by its Session's `updatedAt` (or as pinned, from
the Workspace store's `pinnedSessionIds`), and merges *contiguous* rows of the
same bucket into one section — contiguity, not a global bucket, is what keeps
manual ordering correct where dates interleave. A bucket is a fixed name
(`pinned`, `today`, `yesterday`) or `day:YYYY-MM-DD` built from local date
parts; the day key is also the persistence key. The pass is idempotent (it
fingerprints the run structure and expansion state), and a one-second sweep
re-finds the list after a remount and catches the midnight boundary.

**The drag pipeline** keeps two records — the Session drag (origin, whether the
list locks it, marker bookkeeping) and the folder-drag zone — and answers in one
place:

1. `Files` over the sidebar → claimed for a Workspace drop (the event is not
   stopped, so the shell's drag lifecycle stays intact); a directory at drop
   time stops the shell's handler and releases its drag state.
2. A Session hover over the list of a locked order → claimed with
   `stopPropagation` and `dropEffect='none'`, so no insertion marker is armed
   and the order write cannot run.
3. A Session hover/drop over a conversation → accepted, highlighted, and
   inserted through the shell's scoped chip event (plain-text fallback
   otherwise). Leaving the sidebar pins the shell's pending marker to the
   dragged row, so a reference drop cannot reorder the list.
4. Everything else → untouched.

`effectAllowed` is widened to `copyMove` on the `dragstart` bubble path so the
composer can ask for a copy cursor; a host that keeps `move` is still answered
with `move`.

**The Settings page** is a `settings.section` contribution. It reads and writes
the switch record directly and subscribes page-local listeners, so the click and
the behaviour change are in the same tick.
