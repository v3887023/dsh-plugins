# Reference a session in the current chat

`@v3887023/dsh-session-reference` adds one row, **引用到当前对话**, to a Session's
sidebar context menu. Picking it inserts the same Session reference the
composer's `@` menu inserts: an atomic chip in the current draft carrying the
canonical `@[title](dsh-session:…)` mention.

Sending carries that mention through `session.prompt`; the Host's
`session-reference` service validates it and captures a bounded, read-only
snapshot of the referenced Session as untrusted context for the model. Nothing
about the reference is this plugin's own format — it is the shell's.

## Behavior

- Right-click a Session in the sidebar → **引用到当前对话** → the reference
  lands in the composer of the conversation you are looking at, at the caret
  (or at the end of the draft when the composer has no selection), and the
  composer takes the keyboard: focus and the blinking caret land right after the
  new chip, so the message can be finished without reaching for the mouse.
- Or drag the Session row out of the sidebar and drop it anywhere on the
  conversation — the transcript or the input box. The composer that will receive
  it outlines while the row hovers, and the drop inserts the same chip at the
  caret. Dropping anywhere else keeps the sidebar's own reorder behavior.
- The row is offered only when there is a composer to insert into, and never on
  the conversation that composer belongs to: a Session cannot reference itself,
  so the menu simply omits it there. A menu opened before the conversation
  changed re-resolves on the pick and refuses with a notice instead, and a drag
  over that same conversation is refused with the no-drop cursor.
- One message may reference at most three distinct Sessions. Further references
  would make the send fail, so the fourth is refused with a notice instead of
  silently breaking the message.
- Insertion is the shell's own chip path. If a Host build does not answer that
  path, the plugin falls back to the plain-text mention: the reference still
  resolves when sent, it just renders as text inside the draft.

## Requirements and limits

- **Web/Desktop, Client only.** It uses the composer's public `inputActions`
  face plus the shell's scoped input events; there is no Host half and no
  configuration.
- **The drop target is a conversation.** A drag references the conversation
  whose transcript or composer is under the pointer; everywhere else — the
  sidebar, the right panels, the frame chrome — keeps the sidebar's reorder
  gesture untouched.
- **Breakable internal contract.** The chip path dispatches
  `slash/input-insert-reference` on the current Session scope — the event the
  `@` pick uses. Its bail answer decides whether the chip applied, so an
  upstream rename degrades to the plain-text fallback rather than a silent
  failure.
- **Current conversation only, for the menu.** Its target is the Session the
  main column shows (`retainedBy.mainView`); a Session opened solely in a side
  panel is not a target there. A drag can target any mounted composer.

## Implementation notes

`inputActions` is a Session-scoped *standard prop*, not a service, and the
sidebar menu is root-scoped, so the row cannot receive it directly. An inert
seat (a `display:none` anchor) registered into `conversation.input.overlay`
records each mounted composer's action face, its draft projection, and its
anchor node, keyed by Session; the menu row resolves the current conversation
from that registry, and the anchor is what the pick focuses.

The mention is assembled locally: `@[label](dsh-session:…)` is the Host's own
canonical spelling, built from the base64url of the JSON string id with the
label escaped. The Host parses it back when the message is sent, so no Host
lookup sits in front of the gesture — an early version asked
`sessionReferenceResolver` for the authoritative label first, and because that
Remote call requires a retained Session it never settled, leaving the pick with
no edit and no notice.

The pick is therefore fully synchronous: resolve the target, build the mention,
capture the insertion span, focus the composer, then dispatch the chip (or the
text fallback). The span is captured while the composer is still unfocused — so
an unfocused draft inserts at its end — and the focus happens *before* the edit,
because Lexical writes the post-insert caret into the DOM only while its editor
owns the selection; focusing afterwards left the browser's caret before the new
chip. The public `inputActions` face has no focus verb, so the plugin focuses
the card's contenteditable directly.

Everything the plugin adds — the seat, the menu row, the dictionaries, the
notice, the drag listeners and their stylesheet — is removed by its `ctx.effect`
cleanups on unload.

The drag gesture is claimed at the window's capture phase because the shell
publishes no drop seat on the composer. Three rules keep it out of the way of
everything else: only a drag from a Session row is tagged (a custom
`application/x-dsh-session-ref` type — a `dragover` may read `types` but not the
payload, so `text/plain` alone cannot be told apart from dragged prose); nothing
is cancelled unless the pointer is over a conversation belonging to a different
Session, so the sidebar's own reorder keeps every other drop; and only the final
`drop` is claimed, with `stopPropagation` so the editor never also pastes the
row's `text/plain`. The row's own `dragover` pins `effectAllowed` to `move`, so
the plugin widens it to `copyMove` on the dragstart bubble — and still answers
with `move` whenever a host kept the narrower effect, because an incompatible
drop effect cancels the drop outright.

A conversation is recognized from its composer: the composer is sticky inside
the transcript's scrollport, so the nearest scrollable ancestor of the card is
the chat area, and a drop anywhere in it is accepted. That keeps the whole
transcript usable as a target without naming a generated class, and it works the
same for a side panel's composer, which owns its own scrollport.

The bundle patch uses the row id `session-ref-menu` on purpose: `session-reference`
is already the shipped `@deepseek-ai/dsh-session-reference` row, and the
composition drops a duplicate insert silently — the Host reports the package as
applied while the client bundle never reaches the boot graph. Any local bundle
row id must stay unique against the shipped ones.

## Test

`npm test` runs two offline suites, both loading the real browser bundle under a
stub module loader:

- `test/mention.test.mjs` — canonical URI spelling, label escaping, and the
  reference counting the per-message limit depends on.
- `test/registration.test.mjs` — the contributed slots, the row's visibility
  rules, the chip dispatch (and its text fallback), the label fallbacks, the
  three-reference limit, the drag gesture (tag, highlight, drop on the composer
  and on the transcript, self-refusal, untouched prose drags, and the
  once-per-exit reorder cancellation), and unload cleanup.
