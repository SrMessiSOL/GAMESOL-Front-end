import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars, useTexture } from '@react-three/drei';
import { ArrowDown, ArrowRight, Pause, Play } from 'lucide-react';
import * as THREE from 'three';
import galaxyArt from './assets/universe-lab/spiral-galaxy.png';
import planetArt from './assets/universe-lab/ocean-world-albedo.png';
import spaceArt from './assets/universe-lab/cinematic-nebula-panorama-v2.webp';
import mineArt from './assets/ui/crystalMine.webp';
import fleetArt from './assets/fleet/gamesol-battlecruiser-v1.webp';
import { SHIP_CATALOG } from './ship-catalog';
import ShipArtwork from './ShipArtwork';
import { FleetVessel } from './FleetVessel';
import './public-world.css';

const chapters = [
  { id: 'universe', label: 'The universe', title: 'GAMESOL', copy: 'A persistent universe. A human commander. An autonomous agent. Your next move changes the map.' },
  { id: 'galaxy', label: 'Find your place', title: 'One world is only the beginning.', copy: 'Build your homeworld. Find new systems. Send colony ships beyond familiar space.' },
  { id: 'system', label: 'Make your move', title: 'Every flight has a destination.', copy: 'Trade resources, scout another planet or commit your fleet. Distance and timing are part of every decision.' },
  { id: 'planet', label: 'Build your empire', title: 'Small beginnings. Lasting consequences.', copy: 'Grow production, unlock technology and build a fleet. Join an alliance, or make your own way.' },
];

class SceneFallback extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

function Flight({ progress, moving }: { progress: React.MutableRefObject<number>; moving: boolean }) {
  const galaxy = useRef<THREE.Mesh>(null);
  const planet = useRef<THREE.Mesh>(null);
  const fleet = useRef<THREE.Group>(null);
  const time = useRef(0);
  const goal = useRef(new THREE.Vector3());
  const [galaxyMap, surface] = useTexture([galaxyArt, planetArt]);
  useFrame(({ camera }, delta) => {
    const p = progress.current;
    if (moving) time.current += Math.min(delta, 0.05);
    const t = time.current;
    goal.current.set(0, 0, THREE.MathUtils.lerp(28, 8, p));
    camera.position.lerp(goal.current, 1 - Math.exp(-delta * 5));
    camera.lookAt(0, 0, 0);
    if (galaxy.current) {
      galaxy.current.position.set(3 - p * 8, 0.5 + p * 3, -9 - p * 10);
      galaxy.current.rotation.z = -0.25 + t * 0.008;
      galaxy.current.scale.setScalar(13 + p * 6);
    }
    if (planet.current) {
      planet.current.position.set(8 - p * 6, -3 + p * 2, -2);
      planet.current.scale.setScalar(1.2 + p * 3.3);
      planet.current.rotation.y = t * 0.035 + p * 0.9;
    }
    if (fleet.current) {
      fleet.current.position.set(3 - p * 8, -2 + p * 2, 3);
      fleet.current.rotation.set(0.15, -0.45, -0.18);
    }
  });
  return <>
    <ambientLight intensity={0.45} />
    <directionalLight position={[-6, 5, 8]} intensity={3} color="#ffedc9" />
    <pointLight position={[6, -2, 3]} intensity={30} color="#68b9dc" />
    <Stars radius={75} depth={35} count={1800} factor={3} saturation={0.1} fade speed={moving ? 0.15 : 0} />
    <mesh ref={galaxy}><planeGeometry args={[1, 1]} /><shaderMaterial transparent depthWrite={false}
      uniforms={{ image: { value: galaxyMap } }}
      vertexShader={'varying vec2 uvPoint; void main(){uvPoint=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}'}
      fragmentShader={'uniform sampler2D image; varying vec2 uvPoint; void main(){vec3 color=texture2D(image,uvPoint).rgb;float light=max(color.r,max(color.g,color.b));float edge=1.0-smoothstep(0.38,0.5,length(uvPoint-0.5));gl_FragColor=vec4(color,smoothstep(0.02,0.2,light)*edge);}'}/></mesh>
    <mesh ref={planet}><sphereGeometry args={[1, 64, 48]} /><meshStandardMaterial map={surface} roughness={0.85} metalness={0.05} /></mesh>
    <group ref={fleet}>
      {[-1, 0, 1].map((n) => <group key={n} position={[n * 0.75, Math.abs(n) * -0.35, Math.abs(n) * -0.8]}>
        <group rotation={[.5, -.2, -.7]} scale={n === 0 ? .7 : .4}><FleetVessel kind="attack" shipClass={n === 0 ? 'battlecruiser' : 'lightFighter'} /></group>
      </group>)}
    </group>
  </>;
}

export default function PublicWorld() {
  const progress = useRef(0);
  const [chapter, setChapter] = useState(0);
  const [inJourney, setInJourney] = useState(true);
  const [moving, setMoving] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [webgl, setWebgl] = useState(true);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const sections = [...document.querySelectorAll<HTMLElement>('.public-chapter')];
        const last = sections[sections.length - 1];
        const end = last ? last.offsetTop : window.innerHeight * 3;
        progress.current = THREE.MathUtils.clamp(window.scrollY / Math.max(1, end), 0, 1);
        let active = 0;
        sections.forEach((section, index) => { if (section.getBoundingClientRect().top < window.innerHeight * 0.55) active = index; });
        setChapter(active);
        setInJourney(!last || last.getBoundingClientRect().bottom > window.innerHeight * 0.35);
      });
    };
    update(); window.addEventListener('scroll', update, { passive: true }); window.addEventListener('resize', update);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, []);
  return <main className="public-world">
    <div className="public-backdrop" aria-hidden="true" style={{ backgroundImage: `url(${spaceArt})` }}>
      {webgl && <SceneFallback><Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 28], fov: 48 }} gl={{ antialias: true, powerPreference: 'low-power' }} onCreated={({ gl }) => gl.domElement.addEventListener('webglcontextlost', () => setWebgl(false))}>
        <Suspense fallback={null}><Flight progress={progress} moving={moving} /></Suspense>
      </Canvas></SceneFallback>}
    </div>
    <header className="public-header">
      <a className="public-brand" href="/" aria-label="GAMESOL home">GAMESOL<span>SPACE STRATEGY</span></a>
      <nav aria-label="Public navigation"><a href="#experience">Explore</a><a href="#fleet" className="public-fleet-link">Fleet</a><a href="/marketplace" className="public-market">Market</a><a className="public-enter" href="/app">Enter devnet <ArrowRight size={16} /></a></nav>
    </header>
    <nav className="public-chapter-nav" aria-label="Journey chapters" hidden={!inJourney}>{chapters.map((item, i) => <a key={item.id} href={`#${item.id}`} aria-label={item.label} aria-current={chapter === i ? 'step' : undefined}><span>0{i + 1}</span><span className="public-chapter-name">{item.label}</span></a>)}</nav>
    <div className="public-journey">
      {chapters.map((item, i) => <section className={`public-chapter public-chapter-${i}`} id={item.id} key={item.id} aria-labelledby={`heading-${item.id}`}>
        <div className="public-copy"><p className="public-eyebrow">{i === 0 ? 'ON SOLANA / DEVNET OPEN' : `0${i + 1} / ${item.label}`}</p>
          {i === 0 ? <h1 id={`heading-${item.id}`}>{item.title}</h1> : <h2 id={`heading-${item.id}`}>{item.title}</h2>}
          <p className="public-description">{item.copy}</p>
          {i === 0 && <><a className="public-primary" href="/app">Enter the universe <ArrowRight size={19} /></a><p className="public-caption">Humans and agents. The same game rules.</p></>}
          {i === 3 && <a className="public-primary" href="/app">Start on devnet <ArrowRight size={19} /></a>}
        </div>
        <div className="public-scene-coordinate" aria-hidden="true">{['OBSERVATION / DEEP SPACE', 'GALAXY / EXPANSION', 'SYSTEM / FLEET IN TRANSIT', 'ORBIT / HOMEWORLD'][i]}</div>
        {i === 0 && <a className="public-scroll" href="#galaxy">Explore the universe <ArrowDown size={16} /></a>}
      </section>)}
    </div>
    <section className="public-experience" id="experience" aria-labelledby="experience-title">
      <div className="public-section-heading"><p className="public-eyebrow">YOUR NEXT MOVE</p><h2 id="experience-title">An empire is built,<br />not given.</h2><p>Play through the browser or command through the agent API. Production, research, fleets and markets share the same on-chain world.</p></div>
      <div className="public-features">
        <article><img src={mineArt} alt="GAMESOL crystal production facility" loading="lazy" /><div><span>01 / ECONOMY</span><h3>Build the foundation.</h3><p>Turn production into research, stronger ships and new colonies. Every resource has a purpose.</p></div></article>
        <article><img className="public-ship-art" src={fleetArt} alt="GAMESOL combat cruiser" loading="lazy" /><div><span>02 / STRATEGY</span><h3>Choose your horizon.</h3><p>Transport, scout and compete. Coordinate with an alliance or expand on your own terms.</p></div></article>
      </div>
      <section className="public-fleet-showcase" id="fleet" aria-labelledby="fleet-title">
        <p className="public-eyebrow">PURPOSE-BUILT FOR DEEP SPACE</p><h2 id="fleet-title">A fleet for every frontier.</h2>
        <div className="public-fleet-grid">{SHIP_CATALOG.map(ship=><article key={ship.key}><ShipArtwork shipKey={ship.key} label={ship.name} scene={ship.key === 'solarSatellite' ? 'space' : 'hangar'} /><h3>{ship.name}</h3><p>{ship.role}</p></article>)}</div>
      </section>
      <div className="public-closing"><div><p className="public-eyebrow">DEVNET / TEST ENVIRONMENT</p><h2>Your homeworld awaits.</h2><p>GAMESOL is in testing. Devnet assets have no monetary value.</p></div><a className="public-primary" href="/app">Play GAMESOL <ArrowRight size={19} /></a></div>
      <footer><a href="/">GAMESOL</a><span>On-chain space strategy on Solana</span><a href="/marketplace">Planet market</a><a href="/app">Open game <ArrowRight size={14} /></a></footer>
    </section>
    <button className="public-motion" onClick={() => setMoving(v => !v)} aria-label={moving ? 'Pause ambient animation' : 'Resume ambient animation'} title={moving ? 'Pause ambient animation' : 'Resume ambient animation'}>{moving ? <Pause size={16} /> : <Play size={16} />}</button>
  </main>;
}
