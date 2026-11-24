/**
 * Host half of the Session sort-lock bundle.
 *
 * The feature is browser-side: the Client half watches the sidebar's Session
 * drag gestures and refuses a drop that would write a manual layout. Nothing
 * needs to be served, scheduled, or configured, so the Host entry exists only
 * because a package's browser half is mounted through an active Loader entry.
 */

export const name = 'session-sort-lock'

/** No Host work: the Client half owns the gesture. */
export function apply() {}
