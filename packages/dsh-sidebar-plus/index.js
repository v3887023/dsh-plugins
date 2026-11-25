/**
 * Host half of the sidebar-plus bundle.
 *
 * Every feature is browser-side: the Client half decorates the sidebar's row
 * list, claims Session and folder drags at the window's capture phase, and adds
 * the Settings page that switches each feature on or off. The switches are
 * browser-local, so the Host serves nothing, schedules nothing, and stores
 * nothing. The entry exists only because a package's browser half is mounted
 * through an active Loader row.
 */

export const name = 'sidebar-plus'

/** No Host work: the Client half owns the sidebar and its preferences. */
export function apply() {}
