/**
 * Host half of the Session date-groups bundle.
 *
 * The feature is browser-side: the Client half decorates the sidebar's
 * single-list Session rows with date headers. Nothing is served, scheduled, or
 * configured, so the Host entry exists only because a package's browser half is
 * mounted through an active Loader entry.
 */

export const name = 'session-date-groups'

/** No Host work: the Client half owns the list decoration. */
export function apply() {}
