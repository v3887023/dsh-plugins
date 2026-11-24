/**
 * Host half of the transcript bold-color bundle.
 *
 * The whole feature is one stylesheet on the Client half, so the Host has
 * nothing to serve, schedule or configure: this entry exists only because the
 * browser half of a plugin package is mounted through an active Loader entry.
 */

export const name = 'bold-color'

/** No Host work: the Client half injects the stylesheet by itself. */
export function apply() {}
