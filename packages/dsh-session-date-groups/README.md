# Group the session list by date

> **Superseded.** This plugin is now part of
> [`@v3887023/dsh-sidebar-plus`](../dsh-sidebar-plus/README.md), which owns the
> whole sidebar — date groups included — and adds a Settings switch for each
> feature. Disable this plugin **before** installing that one.

`@v3887023/dsh-session-date-groups` turns the sidebar's **single-list** Session
view into dated sections: **Pinned**, **Today**, **Yesterday**, and then one
section per calendar day for everything older (for example **11月18日（星期三）**).
Every section header collapses its rows, and only Today (and Pinned) start open.
Older Sessions are not aggregated into "previous 7 days" style buckets, so each
day stays its own section.

## Behavior

- In **Group by → In one list** ("单列表"), the flat run of Sessions gains a
  header before each date section, with the number of Sessions in it. A list
  whose Sessions all fall on one date is not a grouping, so it keeps the plain
  rows without a header.
- Clicking a header (or reaching it with the keyboard and pressing Enter/Space)
  collapses or expands that section. The choice is remembered per browser, so a
  collapsed day stays collapsed after a reload.
- The default is exactly one open section: **Today** (plus **Pinned**, when
  there are pinned Sessions). Every other day starts closed, and the only thing
  that changes that is a click on a header.
- An unused **New Session** draft always sits under **Today**, whatever day it
  was first created. DSH keeps one blank Session per workspace and reuses it for
  every New Session, so a draft opened today can have been minted days ago; it
  is the work in progress, and dating it by its creation would file it under
  Yesterday or an older day.
- Sections are cut on calendar days in the browser's time zone, so a Session
  from 23:50 belongs to **Yesterday** at 00:05 rather than to a rolling 24-hour
  window.
- A day's header is the date in the app's language followed by its weekday, so a
  day reads as `11月18日（星期三）` in Chinese and `Nov 18 (Wednesday)` in English;
  the year (`2025年11月18日（星期二）`, `Nov 18, 2025 (Tuesday)`) appears only when
  the day is not in the current year. **Today** and **Yesterday** need no
  weekday, so they stay as named.
- Pinned Sessions get their own **Pinned** section at the top. A pinned Session
  keeps leading the list whatever its date, so bucketing it by date would put
  an old pinned row above today's rows and read as a mistake.
- Opening a Session whose section is closed (for example from search results)
  shows that section for the current session, so the row you are reading is
  never hidden. That is a view convenience, not a stored choice: it never
  overwrites what you clicked, and the next page load is back to your own
  record.
- The other two groupings (**WorkSpace**, **Workspace Tree**) and the search
  results tree are untouched: the headers exist only in the single-list body.

## Requirements and limits

- **Single-list view only.** Date sections are a flat-list idea; the Workspace
  groupings already have their own sections.
- **Needs the Session store.** While the Client Session list is unavailable the
  plain rows are left alone, so the list never shows a wrong "Today" grouping
  that would reshuffle a moment later.
- **Decorates the built-in list.** DSH publishes no seat inside the browser's
  row list, so this plugin inserts header elements beside the rows the built-in
  browser renders, instead of replacing it. It depends on the product's own row
  contract — a Session row carrying `data-row-key="session:<id>"` somewhere
  inside the `role="tree"` element whose class marks the flat list — and on two
  Client stores: the same `updatedAt` each row's time label is printed from, and
  the registry-global pin set. It reads no generated class name and no menu
  label, so a restyled shell keeps working; a browser rebuilt to drop those
  attributes would stop it.
- **One plugin, no configuration.** Collapse state is browser-local; there is
  no per-profile setting. Disable the plugin in **Plugins** to return to the
  plain flat list.
- **Additive.** Rows keep their own drag, menu, hover card, and keyboard
  behavior; the plugin adds header buttons and three attributes of its own (the
  section on the row's slot, the hidden marker, and `inert`), and removes all of
  them on unload.
- **Keyboard.** A header is an ordinary `<button>`, so Tab reaches it and
  Enter/Space toggles the section. The list's own tree keyboard handling does
  not know about the headers.

## Implementation notes

One pass per change reads the row elements in document order, classifies each
by its Session's `updatedAt` (or as pinned, from the Workspace store's
`pinnedSessionIds`), and merges *contiguous* rows of the same bucket into one
section. Contiguity — rather than a global bucket — is what makes the result
correct in manual ordering, where dates can interleave: each run gets its own
header, and all headers of one bucket share a single expansion choice.

A bucket is either one of the three fixed names (`pinned`, `today`, `yesterday`)
or `day:YYYY-MM-DD`, built from the timestamp's local date parts. The day key is
the persistence key as well, which is why a chosen collapse is still there
tomorrow. Only fixed names have defaults; every day bucket is closed until the
operator opens it.

The timestamp is the Client Session list's `updatedAt`, which the row itself
prints no time from when the Session is blank. That matters: the Host derives
`updatedAt` as `max(createdAt, lastPromptAt ?? 0)`, so a blank Session only ever
reports the moment it was created, while DSH reuses one blank Session per
workspace for New Session and workspace switches. A draft opened today is
therefore routinely older than today, and the pass reads the summary's `blank`
flag to file it under Today instead of that creation date.

Two things can make a bucket open at runtime: the record, and the
follow-the-active-Session open described above. The second lives in a separate
in-memory set, so the record always holds exactly the choices the operator made
by clicking; a click on an auto-opened bucket clears its in-memory entry and
writes the click's own result.

The browser wraps every row in the hover card's anchor element, so a row is a
grandchild of the list rather than a child. The pass therefore walks the list's
children as *row slots* — the element a header is inserted before and a collapse
hides — and reads the row inside each slot for its identity and selected state.
A build that keeps rows as direct children works the same way.

The pass is idempotent: it fingerprints the run structure plus the expansion
state and returns early when nothing changed, which is also what stops the
MutationObserver from reacting to the plugin's own insertions. A one-second
sweep re-finds the list after the sidebar remounts and catches the midnight
boundary without a DOM change.

Cost grows with the number of rows and the number of days on screen, once per
coalesced DOM change plus the 1 Hz sweep, and an unchanged list costs only the
fingerprint comparison. On a 202-Session history spanning 11 days that is 11
headers and one linear pass — the day-per-section layout does not add a
noticeable cost; it only makes the header list longer than five buckets would.

Collapsing sets `data-dsh-session-date-hidden` on a run's rows; the plugin's own
stylesheet hides those rows with `!important`, so the host's `display: flex` row
style cannot win over the attribute. Collapsed rows are also marked `inert`, so
assistive technology and focus handling do not count them as present controls.
Everything the plugin adds — the stylesheet, the headers, the row attributes,
the observer, and the sweep — is removed by the `ctx.effect` cleanup when the
plugin unloads.

### Diagnostics

The client half keeps one record of what its last pass saw, under
`dsh.session-date-groups.diagnose` in local storage: the outcome (`grouped`,
`one-section`, `no-flat-list`, `no-session-store`, `crashed`), how many
`role="tree"` containers and Session rows the page had, the list's classes, and
— once grouping succeeded — how many headers were inserted and how many rows the
collapse hid. It is written once per outcome change, never per pass, so a
decorated list costs one small record. This is how a sidebar that gains no
headers can be diagnosed without browser control; it contains no Session titles
or ids.

## Test

`npm test` (or `node test/groups.test.mjs`) runs the client half against a
minimal DOM: bucket boundaries, per-day sections with their labels (including a
day from another year and each day's weekday), header order and counts, the
default expansion,
click-to-collapse with persistence, a stored choice outliving the page, the
blank draft row (including one whose creation date is days old, and a pinned
draft), one bucket appearing twice, a single-run list, a missing
Session store, a missing Workspace store, a non-single-list container, the
first-use fallback, opening a closed section by switching Session, row removal,
repeated sweeps, unload cleanup, and the English labels.
