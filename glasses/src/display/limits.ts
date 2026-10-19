/** The G2 display and the Even Hub container limits. These play the role the color tokens play in the
 *  web app: every screen is laid out against them, and `scripts/check-limits.mjs` keeps raw numbers out
 *  of the rest of the code. */

export const DISPLAY_WIDTH = 576
export const DISPLAY_HEIGHT = 288
/** LVGL's fixed line height for the firmware font. */
export const LINE_HEIGHT = 27
/** Inner padding of the full-screen text container, on every side. */
export const PADDING = 4
export const TEXT_WIDTH = DISPLAY_WIDTH - 2 * PADDING
export const LINES = Math.floor((DISPLAY_HEIGHT - 2 * PADDING) / LINE_HEIGHT)
/** Header and footer take one line each; the rest is the body. */
export const BODY_LINES = LINES - 2
/** A text container holds at most this many UTF-8 bytes (firmware and simulator agree on 999). */
export const MAX_TEXT_BYTES = 990
/** The system (context) menu: at most this many items, each name at most this many UTF-8 bytes. */
export const MENU_ITEMS = 10
export const MENU_NAME_BYTES = 32
/** Text brightness levels a container accepts (0 = off, 4 = brightest). */
export const BRIGHTNESS_MAX = 4
