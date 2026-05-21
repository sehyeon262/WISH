import Phaser from 'phaser'
import { PLAYER_WALK_SPEED } from '@/game/entities/player'

const GAME_SETTINGS_STORAGE_KEY = 'wish_game_settings'

export type MoveSpeedMultiplier = 1 | 1.5 | 2

export type GameSettings = {
  masterVolume: number
  effectVolume: number
  bgmEnabled: boolean
  moveSpeedMultiplier: MoveSpeedMultiplier
}

const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.8,
  effectVolume: 0.8,
  bgmEnabled: true,
  moveSpeedMultiplier: 1,
}

let settings = loadSettings()

export function getGameSettings() {
  return settings
}

export function updateGameSettings(next: Partial<GameSettings>) {
  settings = { ...settings, ...next }
  localStorage.setItem(GAME_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  return settings
}

export function getPlayerMoveSpeed() {
  return PLAYER_WALK_SPEED * settings.moveSpeedMultiplier
}

function loadSettings(): GameSettings {
  const stored = localStorage.getItem(GAME_SETTINGS_STORAGE_KEY)
  if (!stored) return DEFAULT_SETTINGS

  try {
    const parsed = JSON.parse(stored) as Partial<GameSettings>
    return {
      masterVolume: normalizeVolume(parsed.masterVolume, DEFAULT_SETTINGS.masterVolume),
      effectVolume: normalizeVolume(parsed.effectVolume, DEFAULT_SETTINGS.effectVolume),
      bgmEnabled: normalizeBoolean(parsed.bgmEnabled, DEFAULT_SETTINGS.bgmEnabled),
      moveSpeedMultiplier: normalizeSpeed(parsed.moveSpeedMultiplier),
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function normalizeVolume(value: unknown, fallback: number) {
  return typeof value === 'number' ? Phaser.Math.Clamp(value, 0, 1) : fallback
}

function normalizeSpeed(value: unknown): MoveSpeedMultiplier {
  return value === 1.5 || value === 2 ? value : 1
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}
