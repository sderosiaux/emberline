/**
 * World (playfield) size in simulation units. The screen is 1280×720: the
 * playfield fills the left 1040×720 at ZOOM 1.25, the HUD takes the right 240.
 * A wide, Tyrian-like field with big sprites; the shorter height makes threats
 * arrive faster.
 */
export const PW = 832
export const PH = 576
export const ZOOM = 1.25
export const SCREEN_W = 1280
export const SCREEN_H = 720
/** Screen-space position/size of the playfield. */
export const FIELD_X = 0
export const FIELD_W = PW * ZOOM
export const HUD_X = FIELD_W
export const HUD_W = SCREEN_W - FIELD_W
/** Content authored for the original 560-wide field: converts a design x to the current field. */
export const sx = (x: number) => (x * PW) / 560
