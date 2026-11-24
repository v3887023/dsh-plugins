/**
 * Host half of the sidebar workspace-drop bundle.
 *
 * The whole feature is browser-side: the Client half listens for a folder drop
 * on the sidebar and calls the existing Workspace and Session services. The
 * Host entry exists only because a package's browser half is mounted through an
 * active Loader entry, so there is nothing for the Host to serve or schedule.
 */

export const name = 'workspace-drop'

/** No Host work: the Client half owns the gesture. */
export function apply() {}
