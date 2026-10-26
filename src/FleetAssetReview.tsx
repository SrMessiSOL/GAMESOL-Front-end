import { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FleetVessel } from './FleetVessel';
import type { ShipClass } from './fleet-identity';
import { SHIP_CATALOG, SHIP_BACKDROPS } from './ship-catalog';
import { resolveGameArt } from './ui-art';
import ShipArtwork from './ShipArtwork';
import { Hammer } from 'lucide-react';
import { CommandActionButton } from './design-system/command-controls';
import './design-system/tokens.css';
import './planet-world-local.css';
import './command-workspace.css';
import './fleet-asset-review.css';

function Turntable({ compact, rotate, shipClass }: { compact: boolean; rotate: boolean; shipClass: ShipClass }) {
  const models = useRef<THREE.Group>(null);
  const time = useRef(0);
  useFrame((_, delta) => {
    if (rotate) time.current += Math.min(delta, .05) * .4;
    if (models.current) models.current.rotation.y = Math.sin(time.current) * .3;
  });
  return <group ref={models} rotation={[.2,-.35,-.35]} scale={1.5}><FleetVessel kind="attack" shipClass={shipClass} compact={compact} /></group>;
}
export default function FleetAssetReview() {
  const [compact, setCompact] = useState(false);
  const [rotate, setRotate] = useState(true);
  const [mode, setMode] = useState<'artwork'|'models'|'shipyard'>('artwork');
  const [scene, setScene] = useState<'hangar'|'space'>('hangar');
  const [selected, setSelected] = useState<ShipClass>('battlecruiser');
  return <main className="fleet-asset-review">
    <header><a href="/">GAMESOL</a><h1>Fleet asset review</h1><nav aria-label="Review mode">{(['artwork','models','shipyard'] as const).map(value=><button key={value} aria-pressed={mode===value} onClick={()=>setMode(value)}>{value}</button>)}</nav></header>
    <div className="fleet-review-body">
      <div className="fleet-review-tools"><label>Environment<select disabled={mode==='shipyard'} value={mode==='shipyard'?'hangar':scene} onChange={e=>setScene(e.target.value as 'hangar'|'space')}><option value="hangar">Orbital hangar</option><option value="space">Deep space</option></select></label>{mode==='models'&&<><label>Ship class<select value={selected} onChange={e=>setSelected(e.target.value as ShipClass)}>{SHIP_CATALOG.map(ship=><option key={ship.key} value={ship.key}>{ship.name}</option>)}</select></label><label><input type="checkbox" checked={compact} onChange={e=>setCompact(e.target.checked)} /> Distant silhouette</label><label><input type="checkbox" checked={rotate} onChange={e=>setRotate(e.target.checked)} /> Rotate</label></>}</div>
      {mode==='artwork'&&<div className="fleet-review-catalog">{SHIP_CATALOG.map(ship=><article key={ship.key}><ShipArtwork shipKey={ship.key} label={ship.name} scene={scene}/><h2>{ship.name}</h2><p>{ship.role}</p></article>)}</div>}
      {mode==='models'&&<div className="fleet-review-scene" style={{backgroundImage:`url("${SHIP_BACKDROPS[scene]}")`}}><Canvas dpr={[1,1.5]} camera={{position:[0,0,6.5],fov:48}}>
        <ambientLight intensity={1.2} /><directionalLight position={[-3,5,6]} intensity={3} /><directionalLight position={[5,-2,3]} intensity={1.7} color="#68b9dc" />
        <Turntable compact={compact} rotate={rotate} shipClass={selected} />
      </Canvas></div>}
      {mode==='shipyard'&&<div className="planet-world fleet-review-shipyard"><section className="pw-command-modal"><div className="pw-command-list pw-ship-list">{SHIP_CATALOG.map(ship=><article key={ship.key}><div className="pw-row-art" style={{backgroundImage:resolveGameArt(ship.key,'none')}}/><div><h3>{ship.name}</h3><p>{ship.role}</p></div><CommandActionButton icon={<Hammer/>} tone="primary" disabled>Build 1</CommandActionButton></article>)}</div></section></div>}
    </div>
    <footer>GAMESOL / 14 ship classes / local asset review</footer>
  </main>;
}
