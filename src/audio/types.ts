export type SfxName =
  | 'shot_pulse' | 'shot_scatter' | 'shot_arc' | 'shot_missile' | 'shot_bloom' | 'shot_helix' | 'shot_rail' | 'shot_mine' | 'shot_drone'
  | 'enemy_shot' | 'enemy_shot_heavy' | 'enemy_missile' | 'enemy_laser_charge' | 'enemy_laser_fire'
  | 'hit_small' | 'hit_armor' | 'expl_small' | 'expl_medium' | 'expl_large' | 'expl_huge'
  | 'shield_hit' | 'hull_hit' | 'shield_down' | 'shield_restored' | 'low_hull'
  | 'pickup_credit' | 'pickup_big' | 'pickup_repair' | 'pickup_special' | 'pickup_core'
  | 'special_ready' | 'special_nova' | 'special_overclock' | 'special_phase' | 'special_singularity' | 'special_swarm'
  | 'energy_empty' | 'boss_warning' | 'boss_phase' | 'boss_part' | 'secret'
  | 'ui_move' | 'ui_select' | 'ui_back' | 'ui_buy' | 'ui_sell' | 'ui_deny' | 'ui_upgrade'
  | 'mission_complete' | 'game_over' | 'radio' | 'player_death' | 'chain_reaction' | 'shield_gen_down'
  | ArcadeSfx

/** Arcade-mode sounds: sample-only, they reuse a nearby synth recipe as fallback. */
export type ArcadeSfx = 'graze' | 'rift_enter' | 'rift_exit' | 'rift_ready' | 'bomb' | 'spell_declare' | 'spell_capture' | 'item_power' | 'item_point'

export type LoopName = 'beam' | 'charge' | 'alarm'

export type TrackId =
  | 'title' | 'hangar' | 'm1' | 'm2' | 'm3' | 'm4' | 'm5' | 'm6' | 'm7'
  | 'secret' | 'boss' | 'final_boss' | 'ending' | 'rift'

export type Intensity = 0 | 1 | 2 | 3

export interface LoopHandle {
  set(params: { vol?: number; pitch?: number }): void
  stop(): void
}

export interface SfxOpts {
  pan?: number
  vol?: number
  pitch?: number
}
