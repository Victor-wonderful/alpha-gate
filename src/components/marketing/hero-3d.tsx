"use client";

import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float } from "@react-three/drei";
import * as THREE from "three";

/* ────────────────────────────────────────────────────────────
   Hero 3D scene — falling coins into hexagon portal
   - Top mesh platform (tilted)
   - Hexagon receiving portal (glowing purple)
   - Falling coins ($/◆/●) with continuous loop
   - Bottom ring portal
   - Bottom mesh platform
──────────────────────────────────────────────────────────── */

export function Hero3D({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Canvas
        camera={{ position: [0, 0.5, 8], fov: 38 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
    </div>
  );
}

function Scene() {
  return (
    <>
      {/* Lights */}
      <ambientLight intensity={0.25} />
      <pointLight position={[3, 4, 4]} intensity={1.2} color="#d946ef" />
      <pointLight position={[-3, -2, 3]} intensity={0.8} color="#a855f7" />
      <pointLight position={[0, 0, 2]} intensity={0.6} color="#ec4899" />
      <directionalLight position={[2, 3, 5]} intensity={0.35} color="#ffffff" />

      {/* Top mesh platform (tilted to the back-left) */}
      <Float speed={1.2} rotationIntensity={0.15} floatIntensity={0.25}>
        <MeshPlatform position={[-1.6, 2.0, -0.5]} rotation={[-0.55, 0.3, -0.15]} scale={[1, 1, 1]} />
      </Float>

      {/* Bottom mesh platform (tilted to the front-right) */}
      <Float speed={1.0} rotationIntensity={0.12} floatIntensity={0.2}>
        <MeshPlatform position={[1.5, -1.9, 0.3]} rotation={[-0.6, -0.25, 0.18]} scale={[0.95, 0.95, 0.95]} />
      </Float>

      {/* Falling coins — continuous loop */}
      <FallingCoin offset={0} delay={0.0} text="$" hue={0.85} />
      <FallingCoin offset={-0.15} delay={1.0} text="◆" hue={0.78} />
      <FallingCoin offset={0.12} delay={2.0} text="●" hue={0.82} />

      {/* Center hexagon receiving portal */}
      <HexPortal position={[0, 0, 0]} />

      {/* Bottom ring portal */}
      <Float speed={1.4} rotationIntensity={0.1} floatIntensity={0.2}>
        <RingPortal position={[1.1, -1.5, 0.5]} />
      </Float>
    </>
  );
}

/* ────────────────────────────────────────────────────────────
   Hexagonal receiving portal
──────────────────────────────────────────────────────────── */
function HexPortal({ position }: { position: [number, number, number] }) {
  const innerRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.PointLight>(null);

  // Hex disc shape
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    const r = 1.15;
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      i === 0 ? s.moveTo(x, y) : s.lineTo(x, y);
    }
    s.closePath();
    return s;
  }, []);

  const extrudeSettings = useMemo(
    () => ({ depth: 0.08, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 4 }),
    [],
  );

  // Pulse with coin landing rhythm (3s loop matches coin fall)
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    // Coin hits roughly every 1.0s (3 coins, 3s loop)
    const phase = (t % 3) / 3;
    const pulse = 0.7 + 0.3 * Math.exp(-((phase - 0.0) % 0.33) * 8);
    if (innerRef.current) {
      const mat = innerRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 1.5 + pulse * 2;
    }
    if (glowRef.current) {
      glowRef.current.intensity = 2.5 + pulse * 3;
    }
  });

  return (
    <group position={position} rotation={[-Math.PI / 2.4, 0, 0]}>
      {/* Outer hex ring (thin metallic frame) */}
      <mesh>
        <extrudeGeometry args={[shape, extrudeSettings]} />
        <meshStandardMaterial color="#1a0f25" metalness={0.95} roughness={0.18} />
      </mesh>

      {/* Inner glowing hex (sits inside, emissive) */}
      <mesh ref={innerRef} position={[0, 0, 0.05]} scale={[0.78, 0.78, 1]}>
        <extrudeGeometry args={[shape, { ...extrudeSettings, depth: 0.04 }]} />
        <meshStandardMaterial
          color="#fce7f3"
          emissive="#e879f9"
          emissiveIntensity={2.5}
          roughness={0.15}
          metalness={0.1}
        />
      </mesh>

      {/* Surrounding glow light */}
      <pointLight ref={glowRef} position={[0, 0, 0.6]} intensity={3} color="#e879f9" distance={6} decay={1.6} />
    </group>
  );
}

/* ────────────────────────────────────────────────────────────
   Falling coin — drops from top, fades out before bottom
──────────────────────────────────────────────────────────── */
function FallingCoin({
  offset,
  delay,
  text,
  hue,
}: {
  offset: number;
  delay: number;
  text: string;
  hue: number;
}) {
  const ref = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    // 3-second loop with delay
    const cycle = ((t + delay) % 3) / 3; // 0..1
    // Start at y=3.0, end at y=-3.0 (passes hexagon at y≈0)
    const y = 3.0 - cycle * 6.0;
    ref.current.position.y = y;
    ref.current.position.x = offset + Math.sin(cycle * Math.PI) * 0.05;
    ref.current.position.z = 0.05;
    // Rotate while falling (spinning coin)
    ref.current.rotation.y = cycle * Math.PI * 4;
    ref.current.rotation.z = Math.sin(cycle * Math.PI * 2) * 0.15;

    // Opacity: fade in at start, fade out as it passes through hex
    let opacity = 1;
    if (cycle < 0.1) opacity = cycle / 0.1;
    else if (cycle > 0.55) opacity = Math.max(0, 1 - (cycle - 0.55) / 0.25);
    if (matRef.current) matRef.current.opacity = opacity;
  });

  return (
    <group ref={ref}>
      {/* Coin disc */}
      <mesh>
        <cylinderGeometry args={[0.32, 0.32, 0.08, 48]} />
        <meshStandardMaterial
          ref={matRef}
          color="#16101e"
          metalness={0.85}
          roughness={0.3}
          transparent
          opacity={1}
        />
      </mesh>
      {/* Glowing rim */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.32, 0.02, 16, 64]} />
        <meshStandardMaterial
          color="#fce7f3"
          emissive={new THREE.Color().setHSL(hue, 0.9, 0.65)}
          emissiveIntensity={2}
        />
      </mesh>
      {/* Symbol "stamped" on face */}
      <mesh position={[0, 0.041, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.18, 0.21, 32]} />
        <meshStandardMaterial
          color="#fce7f3"
          emissive="#e879f9"
          emissiveIntensity={1.2}
          metalness={0.2}
          roughness={0.4}
        />
      </mesh>
      {/* Tiny inner dot for symbol detail */}
      <mesh position={[0, 0.042, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.08, 32]} />
        <meshStandardMaterial color="#fce7f3" emissive="#fbcfe8" emissiveIntensity={1.5} />
      </mesh>
      {/* Tiny rotating light for sparkle */}
      <pointLight intensity={0.5} color={new THREE.Color().setHSL(hue, 0.95, 0.7)} distance={1.5} decay={2} />
      {/* Hide unused text param to keep linter happy */}
      <group userData={{ text }} />
    </group>
  );
}

/* ────────────────────────────────────────────────────────────
   Ring portal — glowing torus
──────────────────────────────────────────────────────────── */
function RingPortal({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ref.current) ref.current.rotation.z = -t * 0.4;
    if (matRef.current) matRef.current.emissiveIntensity = 1.8 + Math.sin(t * 2) * 0.4;
  });

  return (
    <group position={position} rotation={[-Math.PI / 2.6, 0, 0]}>
      {/* Outer dark casing */}
      <mesh>
        <torusGeometry args={[0.6, 0.18, 24, 60]} />
        <meshStandardMaterial color="#1a0f25" metalness={0.9} roughness={0.2} />
      </mesh>
      {/* Inner glow torus */}
      <mesh ref={ref}>
        <torusGeometry args={[0.6, 0.08, 16, 60]} />
        <meshStandardMaterial
          ref={matRef}
          color="#fce7f3"
          emissive="#e879f9"
          emissiveIntensity={2}
        />
      </mesh>
      <pointLight position={[0, 0, 0.3]} intensity={1.5} color="#e879f9" distance={3} decay={2} />
    </group>
  );
}

/* ────────────────────────────────────────────────────────────
   Mesh platform — flat box with grid texture feel
──────────────────────────────────────────────────────────── */
function MeshPlatform({
  position,
  rotation,
  scale = [1, 1, 1],
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  scale?: [number, number, number];
}) {
  return (
    <group position={position} rotation={rotation} scale={scale}>
      {/* Base platform */}
      <mesh>
        <boxGeometry args={[1.6, 0.08, 1.0]} />
        <meshStandardMaterial color="#0d0716" metalness={0.85} roughness={0.4} />
      </mesh>
      {/* Top grid pattern — instanced cubes for mesh look */}
      <GridSurface />
      {/* Rim glow stripe */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.6, 32]} />
        <meshStandardMaterial
          color="#fce7f3"
          emissive="#a855f7"
          emissiveIntensity={1.5}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

function GridSurface() {
  // Generate a 6x4 grid of small bumps to suggest mesh pattern
  const bumps = useMemo(() => {
    const arr: Array<[number, number, number]> = [];
    for (let i = -3; i <= 3; i++) {
      for (let j = -2; j <= 2; j++) {
        arr.push([i * 0.18, 0.06, j * 0.18]);
      }
    }
    return arr;
  }, []);
  return (
    <group>
      {bumps.map((p, idx) => (
        <mesh key={idx} position={p}>
          <boxGeometry args={[0.14, 0.02, 0.14]} />
          <meshStandardMaterial color="#1a1226" metalness={0.6} roughness={0.55} />
        </mesh>
      ))}
    </group>
  );
}
