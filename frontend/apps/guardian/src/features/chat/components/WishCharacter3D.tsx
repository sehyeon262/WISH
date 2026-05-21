import { memo, Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { SkeletonUtils } from 'three-stdlib'
import wishGlbUrl from '@/assets/wish.glb?url'
import styles from './WishCharacter3D.module.css'

useGLTF.preload(wishGlbUrl)

function Model() {
  const { scene } = useGLTF(wishGlbUrl)
  // useGLTF 의 scene 이 다른 페이지(대시보드/ROM)와 공유되어 mutation 누수가 생김.
  // SkeletonUtils.clone 으로 본/스킨 포함 깊은 복사해서 인스턴스별로 격리.
  const cloned = useMemo(() => SkeletonUtils.clone(scene), [scene])
  return (
    <group position={[0, -1.5, 0]} rotation={[0, Math.PI / 3.6, 0]} scale={[1, 1, 1]}>
      <primitive object={cloned} />
    </group>
  )
}

export const WishCharacter3D = memo(function WishCharacter3D() {
  return (
    <div className={styles.wrap}>
      <Canvas
        flat
        frameloop="demand"
        camera={{ position: [0, 0.3, 2.3], fov: 28 }}
        gl={{ alpha: true, antialias: true }}
      >
        <ambientLight intensity={1.5} />
        <hemisphereLight args={['#fefdfb', '#f6f3ff', 0.4]} />
        <directionalLight position={[2, 4, 3]} intensity={1.1} color="#fefdfa" />
        <directionalLight position={[-3, 2, -2]} intensity={0.25} color="#ebe5ff" />
        <directionalLight position={[0, 2, 5]} intensity={0.15} color="#fefaf2" />
        <Suspense fallback={null}>
          <Model />
        </Suspense>
      </Canvas>
    </div>
  )
})
