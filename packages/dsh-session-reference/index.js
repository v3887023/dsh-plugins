/**
 * Host half of the session-reference bundle.
 *
 * The feature is browser-side: the Client half adds one sidebar Session-menu
 * row and inserts a reference into the composer the main conversation already
 * owns. Every service it touches — sessions, the reference resolver, the input
 * events — belongs to the shell and is resolved on the Client, so there is
 * nothing for the Host to serve or schedule. The entry exists only because a
 * package's browser half is mounted through an active Loader row.
 */

export const name = 'session-reference'

/** No Host work: the Client half owns the gesture. */
export function apply() {}
