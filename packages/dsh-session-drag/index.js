/**
 * Host half of the Session drag bundle.
 *
 * The feature is browser-side: the Client half claims one Session drag at the
 * window's capture phase and answers it by where it is released — a reference
 * on a conversation, a refused reorder on a "Last updated" list — and adds one
 * sidebar Session-menu row that inserts the same reference. Every service it
 * touches — sessions, the sidebar's persisted view record, the reference
 * resolver, the input events — belongs to the shell and is resolved on the
 * Client, so there is nothing for the Host to serve or schedule. The entry
 * exists only because a package's browser half is mounted through an active
 * Loader row.
 */

export const name = 'session-drag'

/** No Host work: the Client half owns the gesture. */
export function apply() {}
