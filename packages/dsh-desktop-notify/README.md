# Custom desktop notifications for finished turns and waiting requests

`@local/dsh-desktop-notify` draws its own notification card in the bottom-right
corner of the desktop — an always-on-top WPF window, not a Windows toast — and
plays a short synthesized chime when a Session needs you back:

- **Turn finished** — the Agent went from running to idle.
- **Approval needed** — a permission decision is waiting.
- **Answer needed** — the agent asked a question (a plan review counts as one).

The card shows the Session name and one line of context, and clicking it opens
that Session: the window comes forward and the conversation that asked for
attention is selected.

## Behavior

- **One card per Session.** A newer event for the same Session replaces its
  older card instead of stacking a tower of duplicates; cards from different
  Sessions stack upward from the bottom-right corner, at most six.
- **Completion cards leave on their own** after 10 seconds. Cards that need an
  answer stay until you dismiss them.
- **Clicking a card** records the click, raises the Harness window and closes
  the card. `×` dismisses without navigating.
- **The cards stay quiet about themselves.** A failing card is logged and
  skipped; a stale exception can no longer take the notifier down. Only one
  notifier process may run (named mutex), so two can never double-draw.
- Subagent Sessions are skipped — their work reports through the parent Session,
  which notifies on its own. Approvals and questions are observed *before* the
  composed answerers and then delegated with `next()`, so the real decision path
  is untouched.

## How it works

The Host plugin watches three Host events (`agent/status`, `approval/request`,
`user-questions/request`) and writes a JSON payload to a spool directory. A
helper process — `notifier/desktop-notify.ps1`, started lazily with
`pwsh -Sta` — polls that directory and renders each payload as its own card:

- bottom-right of the primary screen, stacked upward, 12 px rounded corners,
  drop shadow, a coloured accent bar and icon per kind, dark card matching the
  app's palette; hovering lifts the card's background;
- green `✓` for a finished turn, amber `!` for something waiting;
- click to open that Session and dismiss, `×` to dismiss;
- a synthesized chime: two rising notes for `done`, three notes for `wait`
  (generated once as WAV under `%TEMP%\dsh-desktop-notify`).

Clicking a card hides it, restores the Harness window (also from the tray) and
raises it to the foreground. Windows refuses `SetForegroundWindow` from a
background process, so the notifier attaches to the target thread, releases the
foreground lock with a synthetic Alt press, retries three times, and falls back
to `SwitchToThisWindow`.

### Opening the clicked Session

The notifier cannot navigate the app, so a click records the Session id in
`click.json` next to the spool *before* raising the window. The browser half
then reads it over the Host's same-origin `GET /desktop-notify/click` route —
on the window's next `focus` event, plus a two-second fallback poll — and calls
`uiWorkspace.openSession`. The route returns one click per request and never
blocks the page.

The notifier exits after 20 idle minutes (with no cards on screen) and respawns
on the next card. Its own log is `notifier.log`, and a crash before the WPF app
comes up lands in `notifier.err.log` — both next to the spool.

## Requirements and limits

- **Windows only.** The card is a WPF window driven over Windows window APIs.
- **PowerShell 7 (`pwsh`) must be on `PATH`.** Set `DSH_DESKTOP_NOTIFY_PWSH` to
  an absolute path if it is installed elsewhere.
- **Card positions come from the primary screen's work area.** On a
  multi-monitor setup the cards stay on the primary display.
- **The card is a normal layered top-level window.** Screen capture tools that
  ignore layered windows will not see it, but the desktop does.

## Environment overrides

| Variable | Default | Effect |
| --- | --- | --- |
| `DSH_DESKTOP_NOTIFY_QUEUE` | `%TEMP%\dsh-desktop-notify` | Spool root (the notifier's queue and chimes live here). |
| `DSH_DESKTOP_NOTIFY_PWSH` | `pwsh` | PowerShell executable used for the notifier. |
| `DSH_DESKTOP_NOTIFY_NO_SPAWN` | unset | `1` writes payloads without starting a notifier (tests). |
| `DSH_DESKTOP_NOTIFY_DONE_DELAY_MS` | `1500` | Settle delay before a completion card. |
| `DSH_DESKTOP_NOTIFY_DONE_SECONDS` | `10` | How long a completion card stays; `0` keeps it until dismissed. |
| `DSH_DESKTOP_NOTIFY_MUTE` | unset | `1` shows cards without the chime. |

## Test and demo

`npm test` (or `node test/host.test.mjs`) drives the Host half against a fake
context: approval delegation, question excerpting, plan-review copy, the
completion edge, the follow-up cancel, subagent suppression, the prepended
observers, the one-shot click route, and unload cleanup.

To see the card without waiting for a turn:

```powershell
$root = Join-Path $env:TEMP 'dsh-desktop-notify'
New-Item -ItemType Directory -Path (Join-Path $root 'queue') -Force | Out-Null
@{ kind = 'wait'; title = '自定义桌面通知'; body = '需要你的批准：Bash' } |
  ConvertTo-Json -Compress |
  Set-Content -LiteralPath (Join-Path $root 'queue\n-demo.json') -Encoding utf8
pwsh -Sta -File .\notifier\desktop-notify.ps1 -QueueDir (Join-Path $root 'queue')
```

To check the click behavior without a card, run the notifier with `-FocusTest`:
it raises the Harness window and exits, with `0` when the window took the
foreground and `1` when Windows refused.

```powershell
pwsh -Sta -File .\notifier\desktop-notify.ps1 -QueueDir (Join-Path $env:TEMP 'dsh-desktop-notify\queue') -FocusTest
```

`-ClickTest` exercises the whole click path without a mouse: it records a click
for `click-test`, raises the Harness window, and exits with `0` on success. The
recorded click is then served once by `GET /desktop-notify/click`.

```powershell
pwsh -Sta -File .\notifier\desktop-notify.ps1 -QueueDir (Join-Path $env:TEMP 'dsh-desktop-notify\queue') -ClickTest
```
