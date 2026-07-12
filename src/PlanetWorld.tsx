import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stars, Text } from "@react-three/drei";
import { useMemo, useState } from "react";
import { Building2, ChevronLeft, Hammer, Rocket, Shield, FlaskConical } from "lucide-react";
import { BUILDINGS, type GameClient, type PlayerState } from "./game-state";
import type { PublicKey } from "@solana/web3.js";
import "./planet-world.css";

const BUILDING_COLORS = ["#9aa7b2", "#63c9ff", "#5ee0ad", "#ffd15c", "#c187ff", "#ff8c67"];

function WorldStructures({ state, onSelect }: { state: PlayerState; onSelect: (index: number) => void }) {
  const buildings = useMemo(() => BUILDINGS.map((building, index) => ({
    ...building,
    index,
    level: Number((state.planet as unknown as Record<string, number>)[building.key] ?? 0),
    angle: (index / BUILDINGS.length) * Math.PI * 2 + 0.3,
  })), [state]);
  return <>
    <ambientLight intensity={0.55} />
    <pointLight position={[5, 7, 7]} intensity={120} color="#9ce7ff" distance={35} />
    <pointLight position={[-7, 3, -4]} intensity={48} color="#ff8d62" distance={25} />
    <mesh rotation={[-0.28, 0, 0]}><sphereGeometry args={[7.2, 64, 64]} /><meshStandardMaterial color="#1d6580" roughness={0.82} metalness={0.12} /></mesh>
    <mesh rotation={[-0.28, 0, 0]}><sphereGeometry args={[7.28, 64, 64]} /><meshBasicMaterial color="#4cc9ed" transparent opacity={0.08} /></mesh>
    {buildings.map((building) => {
      const radius = 6.2;
      const x = Math.cos(building.angle) * radius;
      const z = Math.sin(building.angle) * radius;
      const height = 0.5 + Math.min(2.8, building.level * 0.16);
      return <group key={building.key} position={[x, -0.7 + height / 2, z]} onClick={(event) => { event.stopPropagation(); onSelect(building.index); }}>
        <mesh><boxGeometry args={[1.05, height, 1.05]} /><meshStandardMaterial color={BUILDING_COLORS[building.index % BUILDING_COLORS.length]} emissive={BUILDING_COLORS[building.index % BUILDING_COLORS.length]} emissiveIntensity={0.18} metalness={0.65} roughness={0.32} /></mesh>
        <mesh position={[0, height / 2 + 0.13, 0]}><cylinderGeometry args={[0.22, 0.32, 0.28, 12]} /><meshStandardMaterial color="#dff8ff" emissive="#79ddff" emissiveIntensity={0.8} /></mesh>
        <Text position={[0, height / 2 + 0.75, 0]} fontSize={0.28} color="#e8fbff" anchorX="center">{`L${building.level}`}</Text>
      </group>;
    })}
  </>;
}

export default function PlanetWorld({ state, busy, run, onExit }: { state: PlayerState; busy: boolean; run: (label: string, action: (client: GameClient, entity: PublicKey) => Promise<unknown>) => void; onExit: () => void }) {
  const [selected, setSelected] = useState(0);
  const building = BUILDINGS[selected];
  const level = Number((state.planet as unknown as Record<string, number>)[building.key] ?? 0);
  const queueBusy = state.planet.buildQueueItem !== 255;
  const resource = state.resources;
  const queues = [
    { label: "Construction", active: state.planet.buildQueueItem !== 255, finish: (client: GameClient, entity: PublicKey) => client.finishBuild(entity) },
    { label: "Research", active: state.research.queueItem !== 255, finish: (client: GameClient, entity: PublicKey) => client.finishResearch(entity) },
    { label: "Shipyard", active: state.planet.shipBuildItem !== 255, finish: (client: GameClient, entity: PublicKey) => client.finishShipBuild(entity) },
    { label: "Defense", active: state.planet.defenseBuildItem !== 255, finish: (client: GameClient, entity: PublicKey) => client.finishDefenseBuild(entity) },
  ];
  return <main className="planet-world">
    <section className="planet-world-scene"><Canvas camera={{ position: [0, 7, 19], fov: 42 }} dpr={[1, 2]} gl={{ antialias: true }}><color attach="background" args={["#020711"]} /><Stars radius={80} depth={40} count={2600} factor={2.2} saturation={0.2} fade /><WorldStructures state={state} onSelect={setSelected} /><OrbitControls enablePan={false} minDistance={12} maxDistance={28} maxPolarAngle={Math.PI * 0.7} minPolarAngle={Math.PI * 0.2} /></Canvas></section>
    <header className="pw-top"><button onClick={onExit} aria-label="Return to system"><ChevronLeft /> SYSTEM</button><div><span>ACTIVE PLANET</span><h1>{state.planet.name}</h1><small>{`G ${state.planet.galaxy} - S ${state.planet.system} - P ${state.planet.position}`}</small></div><div className="pw-resources"><b>METAL {resource.metal.toLocaleString()}</b><b>CRYSTAL {resource.crystal.toLocaleString()}</b><b>DEUTERIUM {resource.deuterium.toLocaleString()}</b></div></header>
    <aside className="pw-building"><div className="pw-kicker"><Building2 /> BUILDING COMPLEX</div><h2>{building.name}</h2><p>Level {level}</p><p className="pw-copy">Select structures on the planet to inspect and upgrade them.</p><button disabled={busy || queueBusy} onClick={() => run(`Upgrade ${building.name}`, (client, entity) => client.startBuild(entity, selected))}><Hammer /> {queueBusy ? "CONSTRUCTION ACTIVE" : "UPGRADE"}</button></aside>
    <section className="pw-queues">{queues.map((queue) => <article key={queue.label} className={queue.active ? "active" : ""}><span>{queue.label}</span><b>{queue.active ? "IN PROGRESS" : "IDLE"}</b>{queue.active && <button disabled={busy} onClick={() => run(`Finish ${queue.label.toLowerCase()}`, queue.finish)}>FINISH</button>}</article>)}</section>
    <nav className="pw-operations" aria-label="Planet operations"><button title="Buildings"><Building2 /></button><button title="Research"><FlaskConical /></button><button title="Fleet"><Rocket /></button><button title="Defenses"><Shield /></button></nav>
  </main>;
}
