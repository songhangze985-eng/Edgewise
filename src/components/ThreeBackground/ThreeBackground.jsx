import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

function WireframeCube({ size = 8, opacity = 0.15, speed = 0.1 }) {
  const ref = useRef()
  useFrame((_, delta) => {
    ref.current.rotation.x += delta * speed
    ref.current.rotation.y += delta * speed * 1.5
  })
  return (
    <lineSegments ref={ref}>
      <edgesGeometry args={[new THREE.BoxGeometry(size, size, size)]} />
      <lineBasicMaterial color={0xe2e0e5} transparent opacity={opacity} />
    </lineSegments>
  )
}

function WireframeOctahedron({ radius = 5, position = [10, -3, -4] }) {
  const ref = useRef()
  useFrame((_, delta) => {
    ref.current.rotation.y -= delta * 0.2
  })
  return (
    <lineSegments ref={ref} position={position}>
      <edgesGeometry args={[new THREE.OctahedronGeometry(radius)]} />
      <lineBasicMaterial color={0x9b6fc7} transparent opacity={0.25} />
    </lineSegments>
  )
}

function ConcentricCircles({ position = [-9, 4, 0] }) {
  const groupRef = useRef()
  useFrame((_, delta) => {
    groupRef.current.rotation.z += delta * 0.05
  })
  const circles = useMemo(() => {
    return [1, 2, 3, 4, 5].map((i) => {
      const geo = new THREE.CircleGeometry(i * 1.1, 64)
      return { geo, color: i % 2 === 0 ? 0x9b6fc7 : 0xe2e0e5 }
    })
  }, [])

  return (
    <group ref={groupRef} position={position} rotation={[Math.PI / 3, 0, 0]}>
      {circles.map((c, idx) => (
        <lineSegments key={idx}>
          <edgesGeometry args={[c.geo]} />
          <lineBasicMaterial color={c.color} transparent opacity={0.3} />
        </lineSegments>
      ))}
    </group>
  )
}

function HelixWave({ color, phaseOffset = 0 }) {
  const ref = useRef()
  const geo = useMemo(() => {
    const points = []
    for (let i = -15; i <= 15; i += 0.2) {
      points.push(new THREE.Vector3(
        i,
        Math.sin(i * 0.5 + phaseOffset) * 3,
        Math.cos(i * 0.5 + phaseOffset) * 3
      ))
    }
    return new THREE.BufferGeometry().setFromPoints(points)
  }, [phaseOffset])

  useFrame((state) => {
    const t = state.clock.getElapsedTime()
    ref.current.rotation.x = t * 0.4
  })

  return (
    <line ref={ref} geometry={geo} rotation={[0, 0, Math.PI / 4]}>
      <lineBasicMaterial color={color} transparent opacity={0.45} />
    </line>
  )
}

function SceneContent() {
  const groupRef = useRef()
  useFrame((state) => {
    const t = state.clock.getElapsedTime()
    groupRef.current.rotation.y = Math.sin(t * 0.04) * 0.15
    groupRef.current.rotation.x = Math.cos(t * 0.04) * 0.08
  })

  return (
    <group ref={groupRef}>
      <WireframeCube />
      <WireframeCube size={12} opacity={0.07} speed={0.03} />
      <WireframeOctahedron />
      <ConcentricCircles />
      <HelixWave color={0xd45c5c} phaseOffset={0} />
      <HelixWave color={0x5a8ac4} phaseOffset={Math.PI} />
    </group>
  )
}

export default function ThreeBackground({ mode = 'active', opacity = 0.25 }) {
  if (mode === 'off') return null

  const effectiveOpacity = mode === 'static' ? opacity * 0.5 : opacity

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
        opacity: effectiveOpacity,
      }}
      aria-hidden="true"
    >
      {mode === 'active' ? (
        <Canvas
          orthographic
          camera={{ zoom: 40, position: [20, 20, 20], near: 1, far: 1000 }}
          style={{ background: 'transparent' }}
          gl={{ antialias: true, alpha: true }}
        >
          <SceneContent />
        </Canvas>
      ) : null}
    </div>
  )
}
