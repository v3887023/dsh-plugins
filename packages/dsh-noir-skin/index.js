/**
 * Host half of the Noir Skin bundle.
 *
 * The whole feature is a Client-side token layer: `ctx.theme.overrideTokens`
 * repoints the shipped alias palette, and the Settings section reads/writes a
 * browser preference. The Host has nothing to serve, schedule or configure —
 * this entry exists only because the browser half of a plugin package is
 * mounted through an active Loader entry.
 */

export const name = 'noir-skin'

/** No Host work: the Client half owns the overlay and its UI. */
export function apply() {}
