import Phaser from 'phaser'

import {
  createPlayer,
  ensurePlayerWalkAnimations,
  getPlayerWalkAnimationKey,
  PLAYER_TEXTURE_KEY,
  type PlayerSprite,
} from '@/game/entities/player'

import { emitEmoteBubble } from './emoteBubble'
import type {
  PlayerDirection,
  SnapshotMember,
  VillageEmoteEvent,
  VillageEvent,
  VillageJoinEvent,
  VillageLeaveEvent,
  VillageMoveEvent,
  VillageSnapshot,
} from './types'

/** 같은 패킷이 반복 도착해도 tween 을 매번 새로 띄우지 않도록 위치 변화 임계값 (pixel). */
const POSITION_CHANGE_THRESHOLD_PX = 1
/** publishPosition 기준 빈도 (5Hz) 에 맞춰 tween 도 같은 길이 — 다음 패킷이 도착할 때까지 부드럽게 채움. */
const MOVE_TWEEN_DURATION_MS = 200
/** 원격 sprite depth 는 VillageScene 의 local player 와 동일하게 두어 자연스러운 레이어링. */
const REMOTE_SPRITE_DEPTH = 5
/** 닉네임 텍스트는 sprite 보다 약간 위에 배치. */
export const VILLAGE_PLAYER_NAME_VERTICAL_GAP_PX = 8

export const VILLAGE_PLAYER_NAME_TEXT_STYLE = {
  fontSize: '16px',
  color: '#ffffff',
  stroke: '#000000',
  strokeThickness: 3,
  fontFamily: 'sans-serif',
  resolution: 2,
} as const

export interface RemotePlayersGroupOptions {
  scene: Phaser.Scene
  /** 자기 자신을 원격 sprite 로 렌더하지 않도록 필터링하는 기준. */
  localUserId: number
  /** ratio → pixel 변환에 쓰일 월드 폭/높이 (VillageScene 의 mapScale 적용 결과). */
  worldWidth: number
  worldHeight: number
}

interface RemoteMember {
  userId: number
  sprite: PlayerSprite
  nameText: Phaser.GameObjects.Text | null
  textureKey: string
  dir: PlayerDirection
  currentTween: Phaser.Tweens.Tween | null
}

/**
 * Phaser 씬에 부착되는 원격 플레이어 매니저.
 *
 * <p>S14P31E103-720: 다른 환자의 아바타를 그리고 tween 으로 위치 동기화. 닉네임 표시·보간 미세조정은 S14P31E103-721 에서 추가.
 */
export class RemotePlayersGroup {
  private readonly members = new Map<number, RemoteMember>()

  constructor(private readonly options: RemotePlayersGroupOptions) {}

  applySnapshot(snapshot: VillageSnapshot): void {
    for (const member of snapshot.members) {
      this.applyJoinLike(member)
    }
  }

  applyEvent(event: VillageEvent): void {
    switch (event.type) {
      case 'join':
        this.onJoin(event)
        break
      case 'move':
        this.onMove(event)
        break
      case 'leave':
        this.onLeave(event)
        break
      case 'emote':
        this.onEmote(event)
        break
    }
  }

  destroy(): void {
    for (const member of this.members.values()) {
      member.currentTween?.stop()
      member.nameText?.destroy()
      member.sprite.destroy()
    }
    this.members.clear()
  }

  // ---------- 내부 ----------

  private onJoin(event: VillageJoinEvent): void {
    this.applyJoinLike(event)
  }

  private applyJoinLike(payload: VillageJoinEvent | SnapshotMember): void {
    if (payload.userId === this.options.localUserId) {
      // 자기 자신은 VillageScene 의 local player 가 이미 렌더. 원격 sprite 중복 방지.
      return
    }
    if (this.members.has(payload.userId)) {
      // 멱등: snapshot/join 이 중복 도착해도 sprite 를 새로 만들지 않는다 (latest-wins 재접속 시 동일 userId 가
      // 새 join 으로 다시 들어오는 경우 대비).
      const member = this.members.get(payload.userId)
      if (member) {
        this.updateTexture(member, payload.textureKey)
      }
      return
    }
    const pixelX = payload.x * this.options.worldWidth
    const pixelY = payload.y * this.options.worldHeight
    const textureKey = this.resolveTextureKey(payload.textureKey)
    const sprite = createPlayer(this.options.scene, pixelX, pixelY, {
      textureKey,
      depth: REMOTE_SPRITE_DEPTH,
    })
    // 빈 닉네임 (lazy spawn 경로) 은 텍스트를 만들지 않는다 — 빈 텍스트로 시야를 가리지 않게.
    const nameText = payload.nickname
      ? this.options.scene.add
          .text(
            sprite.x,
            sprite.y - sprite.displayHeight / 2 - VILLAGE_PLAYER_NAME_VERTICAL_GAP_PX,
            payload.nickname,
            VILLAGE_PLAYER_NAME_TEXT_STYLE,
          )
          .setOrigin(0.5, 1)
          .setDepth(REMOTE_SPRITE_DEPTH + 1)
      : null
    this.members.set(payload.userId, {
      userId: payload.userId,
      sprite,
      nameText,
      textureKey,
      dir: payload.dir,
      currentTween: null,
    })
  }

  private onMove(event: VillageMoveEvent): void {
    if (event.userId === this.options.localUserId) {
      // 서버 broadcast 에는 자기 자신의 move 도 포함되지만, FE 가 자기 좌표를 갖고 있으니 무시.
      return
    }
    const member = this.members.get(event.userId)
    if (!member) {
      // join 이 누락된 채 move 만 도착한 경우 — 미러로 생성. 일반 경로는 snapshot/join 이 먼저 오지만 패킷 순서가
      // 뒤집힐 가능성에 대비.
      this.applyJoinLike({
        type: 'join',
        userId: event.userId,
        nickname: '',
        textureKey: event.textureKey ?? PLAYER_TEXTURE_KEY,
        x: event.x,
        y: event.y,
        dir: event.dir,
      })
      return
    }
    this.updateTexture(member, event.textureKey)

    const targetX = event.x * this.options.worldWidth
    const targetY = event.y * this.options.worldHeight
    const dx = targetX - member.sprite.x
    const dy = targetY - member.sprite.y
    const distance = Math.hypot(dx, dy)

    if (distance < POSITION_CHANGE_THRESHOLD_PX) {
      // 같은 위치 반복 패킷 — anim 만 갱신.
      this.updateAnimation(member, event.dir, event.moving)
      return
    }

    member.currentTween?.stop()
    member.currentTween = this.options.scene.tweens.add({
      targets: member.sprite,
      x: targetX,
      y: targetY,
      duration: MOVE_TWEEN_DURATION_MS,
      ease: 'Linear',
      onUpdate: () => syncNameText(member),
      onComplete: () => syncNameText(member),
    })

    member.dir = event.dir
    this.updateAnimation(member, event.dir, event.moving)
  }

  private onEmote(event: VillageEmoteEvent): void {
    if (event.userId === this.options.localUserId) {
      // 로컬 자기 자신은 publish 시점에 이미 로컬 렌더됨 (latency 가림). 서버 echo 는 중복 방지로 무시.
      return
    }
    const member = this.members.get(event.userId)
    if (!member) return
    emitEmoteBubble(this.options.scene, member.sprite, event.emoji, REMOTE_SPRITE_DEPTH + 2)
  }

  private onLeave(event: VillageLeaveEvent): void {
    const member = this.members.get(event.userId)
    if (!member) return
    member.currentTween?.stop()
    member.nameText?.destroy()
    member.sprite.destroy()
    this.members.delete(event.userId)
  }

  private updateAnimation(member: RemoteMember, dir: PlayerDirection, moving: boolean): void {
    if (moving) {
      const animKey = getPlayerWalkAnimationKey(dir, member.textureKey)
      if (member.sprite.anims.currentAnim?.key !== animKey || !member.sprite.anims.isPlaying) {
        member.sprite.anims.play(animKey)
      }
    } else {
      member.sprite.anims.stop()
    }
  }

  /** 테스트/디버그용 가시성. */
  private updateTexture(member: RemoteMember, textureKey?: string): void {
    const nextTextureKey = this.resolveTextureKey(textureKey)
    if (member.textureKey === nextTextureKey) return

    ensurePlayerWalkAnimations(this.options.scene, nextTextureKey)
    const currentFrame = Number(member.sprite.frame.name)
    member.sprite.setTexture(nextTextureKey, Number.isFinite(currentFrame) ? currentFrame : 0)
    member.textureKey = nextTextureKey
    syncNameText(member)
  }

  private resolveTextureKey(textureKey?: string): string {
    if (textureKey && this.options.scene.textures.exists(textureKey)) {
      return textureKey
    }
    return PLAYER_TEXTURE_KEY
  }

  size(): number {
    return this.members.size
  }

  has(userId: number): boolean {
    return this.members.has(userId)
  }
}

/** sprite 가 tween 으로 움직이는 동안 닉네임 텍스트가 위치를 따라오도록 동기화. */
function syncNameText(member: RemoteMember): void {
  if (!member.nameText) return
  member.nameText.setPosition(
    member.sprite.x,
    member.sprite.y - member.sprite.displayHeight / 2 - VILLAGE_PLAYER_NAME_VERTICAL_GAP_PX,
  )
}
