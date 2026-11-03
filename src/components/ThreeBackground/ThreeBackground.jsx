import { useRef, useMemo, useState, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import useSettingsStore from '../../stores/settingsStore'

function WireframeCube({ size = 8, opacity = 0.15, speed = 0.1, color = 0xe2e0e5 }) {
  const ref = useRef()
  useFrame((_, delta) => {
    ref.current.rotation.x += delta * speed
    ref.current.rotation.y += delta * speed * 1.5
  })
  return (
    <lineSegments ref={ref}>
      <edgesGeometry args={[new THREE.BoxGeometry(size, size, size)]} />
      <lineBasicMaterial color={color} transparent opacity={opacity} />
    </lineSegments>
  )
}

function WireframeOctahedron({ radius = 5, position = [10, -3, -4], color = 0x9b6fc7, opacity = 0.25 }) {
  const ref = useRef()
  useFrame((_, delta) => {
    ref.current.rotation.y -= delta * 0.2
  })
  return (
    <lineSegments ref={ref} position={position}>
      <edgesGeometry args={[new THREE.OctahedronGeometry(radius)]} />
      <lineBasicMaterial color={color} transparent opacity={opacity} />
    </lineSegments>
  )
}

function ConcentricCircles({ position = [-9, 4, 0], isLight = false }) {
  const groupRef = useRef()
  useFrame((_, delta) => {
    groupRef.current.rotation.z += delta * 0.05
  })
  const circles = useMemo(() => {
    const primary = isLight ? 0x0066ff : 0x9b6fc7
    const secondary = isLight ? 0x334155 : 0xe2e0e5
    return [1, 2, 3, 4, 5].map((i) => {
      const geo = new THREE.CircleGeometry(i * 1.1, 64)
      return { geo, color: i % 2 === 0 ? primary : secondary }
    })
  }, [isLight])

  return (
    <group ref={groupRef} position={position} rotation={[Math.PI / 3, 0, 0]}>
      {circles.map((c, idx) => (
        <lineSegments key={idx}>
          <edgesGeometry args={[c.geo]} />
          <lineBasicMaterial color={c.color} transparent opacity={isLight ? 0.36 : 0.3} />
        </lineSegments>
      ))}
    </group>
  )
}

function HelixWave({ color, phaseOffset = 0, opacity = 0.45 }) {
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
      <lineBasicMaterial color={color} transparent opacity={opacity} />
    </line>
  )
}

function CyberPixelMatrix({ isLight = false }) {
  const ref = useRef()
  const geo = useMemo(() => {
    const positions = []
    const step = 2.4
    for (let x = -18; x <= 18; x += step) {
      for (let y = -12; y <= 12; y += step) {
        if ((Math.abs(Math.round(x)) + Math.abs(Math.round(y))) % 2 === 0) {
          positions.push(x, y, -8)
        }
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return g
  }, [])

  useFrame((state) => {
    const t = state.clock.getElapsedTime()
    if (ref.current) {
      ref.current.position.y = (t * 0.35) % 2.4
    }
  })

  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial
        color={isLight ? 0x0066ff : 0x38bdf8}
        size={isLight ? 3.2 : 2.0}
        sizeAttenuation={false}
        transparent
        opacity={isLight ? 0.32 : 0.14}
      />
    </points>
  )
}

function SceneContent({ isLight = false }) {
  const groupRef = useRef()
  useFrame((state) => {
    const t = state.clock.getElapsedTime()
    groupRef.current.rotation.y = Math.sin(t * 0.04) * 0.15
    groupRef.current.rotation.x = Math.cos(t * 0.04) * 0.08
  })

  const cubeColor = isLight ? 0x1e293b : 0xe2e0e5
  const octColor = isLight ? 0x0066ff : 0x9b6fc7

  return (
    <group ref={groupRef}>
      <CyberPixelMatrix isLight={isLight} />
      <WireframeCube color={cubeColor} opacity={isLight ? 0.22 : 0.15} />
      <WireframeCube size={12} color={isLight ? 0x0066ff : 0xe2e0e5} opacity={isLight ? 0.14 : 0.07} speed={0.03} />
      <WireframeOctahedron color={octColor} opacity={isLight ? 0.34 : 0.25} />
      <ConcentricCircles isLight={isLight} />
      <HelixWave color={isLight ? 0x783594 : 0xd45c5c} phaseOffset={0} opacity={isLight ? 0.42 : 0.45} />
      <HelixWave color={isLight ? 0x0066ff : 0x5a8ac4} phaseOffset={Math.PI} opacity={isLight ? 0.46 : 0.45} />
    </group>
  )
}

export default function ThreeBackground({ mode = 'active', opacity = 0.25 }) {
  const theme = useSettingsStore((s) => s.theme || 'dark')
  const [systemLight, setSystemLight] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: light)').matches
      : false
  )

  useEffect(() => {
    if (theme !== 'system' || typeof window === 'undefined' || !window.matchMedia) return undefined
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => setSystemLight(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  if (mode === 'off') return null

  const isLight = theme === 'light' || (theme === 'system' && systemLight)
  const baseOpacity = isLight ? Math.max(opacity, 0.38) : opacity
  const effectiveOpacity = mode === 'static' ? baseOpacity * 0.5 : baseOpacity

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
          <SceneContent isLight={isLight} />
        </Canvas>
      ) : null}
    </div>
  )
}
