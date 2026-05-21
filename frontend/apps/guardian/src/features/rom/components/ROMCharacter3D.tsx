import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html, useGLTF } from '@react-three/drei'
import { Vector3, type Group } from 'three'
import wishGlbUrl from '@/assets/wish.glb?url'
import type { RomJointId } from '../data/model'
import styles from './ROMCharacter3D.module.css'

useGLTF.preload(wishGlbUrl)

/**
 * 모델 위치(월드 좌표).
 * Y: 작을수록(더 음수) 모델이 화면에서 아래로 내려감 → 머리 윗 여백 확보
 * X: 캐릭터 좌우가 잘리지 않도록 가운데 정렬
 */
const MODEL_OFFSET_Y = -1.05
const MODEL_OFFSET_X = 0

/**
 * 관절별 줌 프리셋 — 캐릭터 그룹 로컬 Y(=마커 Y) 기준.
 * targetY: OrbitControls.target.y (월드)
 * distance: 카메라 거리 (작을수록 줌인)
 */
/**
 * 관절별 줌 프리셋
 * - distance 작게 = 캐릭터 크게 보임 (카드 가장자리까지 채우게)
 * - targetY는 해당 관절 ± 가시 영역의 중앙. 머리/발 잘림 안 되게 약간 보정.
 */
const JOINT_FOCUS: Record<RomJointId, { targetY: number; distance: number }> = {
  elbow: { targetY: 0.35, distance: 1.85 },
  shoulder: { targetY: 0.5, distance: 1.85 },
  hip: { targetY: -0.05, distance: 1.85 },
  knee: { targetY: -0.5, distance: 1.85 },
}

/**
 * 관절별 좌/우 마커 위치 — 캐릭터 그룹 로컬 좌표.
 * GLB 모델 실제 관절 위치에 맞춰 시각적으로 보정.
 *  - 어깨: 어깨 캡(소매 시작점)
 *  - 엉덩이: 고관절(반바지 시작점, 셔츠 밑단보다 아래)
 *  - 무릎: 무릎 캡
 *  - 발목: 복숭아뼈(양말 윗부분)
 */
const JOINT_MARKERS: Record<RomJointId, [[number, number, number], [number, number, number]]> = {
  elbow: [
    [-0.31, 1.03, 0.07],
    [0.31, 1.03, 0.07],
  ],
  shoulder: [
    [-0.16, 1.34, 0.06],
    [0.16, 1.34, 0.06],
  ],
  hip: [
    [-0.1, 0.78, 0.06],
    [0.1, 0.78, 0.06],
  ],
  knee: [
    [-0.13, 0.5, 0.06],
    [0.13, 0.5, 0.06],
  ],
}

function CharacterModel() {
  const groupRef = useRef<Group>(null)
  const { scene } = useGLTF(wishGlbUrl)
  return (
    <group ref={groupRef} position={[MODEL_OFFSET_X, MODEL_OFFSET_Y, 0]}>
      <primitive object={scene} />
    </group>
  )
}

function FocusMarkers({ focusJoint }: { focusJoint: RomJointId }) {
  const positions = JOINT_MARKERS[focusJoint]
  return (
    <group position={[MODEL_OFFSET_X, MODEL_OFFSET_Y, 0]}>
      {positions.map((pos, i) => (
        <group key={`${focusJoint}-${i}`} position={pos}>
          <Html center zIndexRange={[40, 0]}>
            <div className={styles.romMarker} aria-hidden />
          </Html>
        </group>
      ))}
    </group>
  )
}

type CameraRigProps = {
  focusJoint: RomJointId
}

/**
 * focusJoint가 바뀌면 카메라 위치와 lookAt 타깃이 부드럽게 보간됩니다.
 * OrbitControls 없이 직접 카메라를 제어해 충돌을 피합니다.
 */
function CameraRig({ focusJoint }: CameraRigProps) {
  const lerpedTarget = useMemo(() => new Vector3(0, JOINT_FOCUS.shoulder.targetY, 0), [])
  const desiredDistance = useRef<number>(JOINT_FOCUS.shoulder.distance)
  const tmpDir = useMemo(() => new Vector3(0, 0, 1), [])
  const tmpDesired = useMemo(() => new Vector3(), [])

  useFrame((state, delta) => {
    const focus = JOINT_FOCUS[focusJoint]
    const t = Math.min(1, delta * 4) // ~250ms 정도에 수렴
    tmpDesired.set(0, focus.targetY, 0)
    lerpedTarget.lerp(tmpDesired, t)
    desiredDistance.current += (focus.distance - desiredDistance.current) * t

    const cam = state.camera
    cam.position.copy(lerpedTarget).addScaledVector(tmpDir, desiredDistance.current)
    cam.lookAt(lerpedTarget)
  })

  return null
}

type Props = {
  focusJoint: RomJointId
}

export function ROMCharacter3D({ focusJoint }: Props) {
  return (
    <div className={styles.viewer}>
      <div className={styles.canvasWrap}>
        <Canvas
          flat
          camera={{ position: [0, 0.32, 2.0], fov: 28 }}
          gl={{ alpha: true, antialias: true }}
        >
          <ambientLight intensity={1.5} />
          <hemisphereLight args={['#fefdfb', '#f6f3ff', 0.4]} />
          <directionalLight position={[2, 4, 3]} intensity={1.1} color="#fefdfa" />
          <directionalLight position={[-3, 2, -2]} intensity={0.25} color="#ebe5ff" />
          <directionalLight position={[0, 2, 5]} intensity={0.15} color="#fefaf2" />
          <Suspense fallback={null}>
            <CharacterModel />
            <FocusMarkers focusJoint={focusJoint} />
          </Suspense>
          <CameraRig focusJoint={focusJoint} />
        </Canvas>
      </div>
    </div>
  )
}
