import * as THREE from 'three';
import type { ShipClass } from './fleet-identity';

export type FleetHull = 'attack' | 'transport' | 'colonize' | 'espionage';

export function strategicFleetScale(distance: number, verticalFov: number, height: number, minimum: number) {
  if (![distance, verticalFov, height, minimum].every(Number.isFinite)) return 1;
  const unitsPerPixel = 2 * Math.tan(verticalFov * Math.PI / 360) * Math.max(0, distance) / Math.max(1, height);
  return Math.min(128, Math.max(1, minimum, unitsPerPixel * 9));
}

function hull(points: number[][], depth: number) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], index) => index ? shape.lineTo(x, y) : shape.moveTo(x, y));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 1, steps: 1 });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

// Shared geometry keeps dense route groups inexpensive. The bow is always +Y.
export const FLEET_HULLS = {
  attack: hull([[0,1.12],[.2,.72],[.24,-.12],[.4,-.55],[.3,-.78],[-.3,-.78],[-.4,-.55],[-.24,-.12],[-.2,.72]], .2),
  transport: hull([[-.22,.8],[.22,.8],[.32,.5],[.32,-.7],[-.32,-.7],[-.32,.5]], .26),
  colonize: hull([[0,1.02],[.32,.48],[.38,-.45],[.2,-.82],[-.2,-.82],[-.38,-.45],[-.32,.48]], .3),
  espionage: hull([[0,.82],[.16,.16],[.42,-.38],[.12,-.26],[0,-.62],[-.12,-.26],[-.42,-.38],[-.16,.16]], .09),
};
export const FLEET_CLASS_HULLS: Record<ShipClass, THREE.BufferGeometry> = {
  smallCargo: hull([[-.2,.65],[.2,.65],[.2,.4],[.4,.35],[.4,-.5],[.2,-.55],[.2,-.72],[-.2,-.72],[-.2,-.55],[-.4,-.5],[-.4,.35],[-.2,.4]], .24),
  largeCargo: FLEET_HULLS.transport,
  lightFighter: hull([[0,1.02],[.13,.25],[.65,-.42],[.6,-.58],[.16,-.4],[.12,-.74],[-.12,-.74],[-.16,-.4],[-.6,-.58],[-.65,-.42],[-.13,.25]], .12),
  heavyFighter: hull([[0,.95],[.22,.38],[.7,-.18],[.58,-.63],[.24,-.51],[.18,-.76],[-.18,-.76],[-.24,-.51],[-.58,-.63],[-.7,-.18],[-.22,.38]], .2),
  cruiser: hull([[0,1.2],[.17,.62],[.2,-.26],[.36,-.52],[.22,-.85],[-.22,-.85],[-.36,-.52],[-.2,-.26],[-.17,.62]], .18),
  battleship: hull([[0,1.05],[.38,.58],[.48,-.48],[.32,-.87],[-.32,-.87],[-.48,-.48],[-.38,.58]], .3),
  battlecruiser: FLEET_HULLS.attack,
  bomber: hull([[0,.83],[.28,.43],[.82,-.12],[.72,-.49],[.28,-.56],[.2,-.8],[-.2,-.8],[-.28,-.56],[-.72,-.49],[-.82,-.12],[-.28,.43]], .28),
  destroyer: hull([[.07,.55],[.16,1.15],[.38,1.02],[.46,-.55],[.3,-.9],[-.3,-.9],[-.46,-.55],[-.38,1.02],[-.16,1.15],[-.07,.55]], .3),
  deathstar: hull([[0,1.06],[.73,.73],[1.03,0],[.73,-.73],[0,-1.03],[-.73,-.73],[-1.03,0],[-.73,.73]], .33),
  recycler: hull([[.16,.42],[.31,.9],[.5,.82],[.45,.42],[.32,.35],[.36,-.6],[.2,-.83],[-.2,-.83],[-.36,-.6],[-.32,.35],[-.45,.42],[-.5,.82],[-.31,.9],[-.16,.42]], .22),
  espionageProbe: FLEET_HULLS.espionage,
  colonyShip: FLEET_HULLS.colonize,
  solarSatellite: hull([[-.16,1.05],[.16,1.05],[.16,.2],[1.02,.2],[1.02,-.2],[.16,-.2],[.16,-1.05],[-.16,-1.05],[-.16,-.2],[-1.02,-.2],[-1.02,.2],[-.16,.2]], .08),
};
const box = new THREE.BoxGeometry(1, 1, 1);
const nozzle = new THREE.CylinderGeometry(0.1, 0.12, 0.16, 10);
const light = new THREE.CylinderGeometry(0.072, 0.072, 0.012, 10);
const tank = new THREE.CylinderGeometry(0.15, 0.15, 0.75, 12);
const fortressRing = new THREE.TorusGeometry(.53,.1,6,12);
function armorPanels() {
  const data = new Uint8Array(128 * 128 * 4);
  for (let y=0;y<128;y++) for (let x=0;x<128;x++) {
    const i=(y*128+x)*4;
    const seam=x%32<1||y%24<1;
    const wear=((x*13+y*29)%17)-8;
    const base=seam?100:218+wear;
    data[i]=base;data[i+1]=Math.min(255,base+4);data[i+2]=Math.min(255,base+7);data[i+3]=255;
  }
  const map=new THREE.DataTexture(data,128,128);
  map.wrapS=map.wrapT=THREE.RepeatWrapping;
  map.colorSpace=THREE.SRGBColorSpace;
  map.needsUpdate=true;
  return map;
}
const armor = new THREE.MeshStandardMaterial({ color: '#e1e5e2', map: armorPanels(), metalness: .58, roughness: .4, emissive: '#6b8791', emissiveIntensity: .12 });
const frame = new THREE.MeshStandardMaterial({ color: '#26333e', metalness: .72, roughness: .36, emissive: '#405261', emissiveIntensity: .22 });
const gold = new THREE.MeshStandardMaterial({ color: '#e8b94f', metalness: .45, roughness: .44, emissive: '#74551a', emissiveIntensity: .25 });
const canopy = new THREE.MeshStandardMaterial({ color: '#123c50', metalness: .8, roughness: .16, emissive: '#3d8b9d', emissiveIntensity: .55 });
const distant = new THREE.MeshBasicMaterial({ color: '#dce7e6' });
const engines = Object.fromEntries(['#70dcff','#ff586d','#d998ff','#ffc866','#45f4c1','#6fdbd1','#d5fff4'].map(color => [color, new THREE.MeshBasicMaterial({ color, toneMapped: false })]));

function Plate({ position, scale, dark = false, trim = false }: { position: [number, number, number]; scale: [number, number, number]; dark?: boolean; trim?: boolean }) {
  return <mesh geometry={box} material={trim ? gold : dark ? frame : armor} position={position} scale={scale} dispose={null} />;
}

export function FleetVessel({ kind: missionKind, shipClass, color = '#70dcff', compact = false }: { kind: FleetHull; shipClass?: ShipClass; color?: string; compact?: boolean }) {
  const kind: FleetHull = shipClass === 'colonyShip' ? 'colonize' : shipClass === 'espionageProbe' || shipClass === 'solarSatellite' ? 'espionage' : shipClass === 'smallCargo' || shipClass === 'largeCargo' || shipClass === 'recycler' ? 'transport' : shipClass ? 'attack' : missionKind;
  const engineX = shipClass === 'solarSatellite' ? [] : kind === 'espionage' || shipClass === 'lightFighter' ? [0] : [-.21, .21];
  return <group dispose={null} scale={kind === 'espionage' ? .72 : kind === 'colonize' ? 1.15 : 1}>
    <mesh geometry={shipClass ? FLEET_CLASS_HULLS[shipClass] : FLEET_HULLS[kind]} material={compact ? distant : armor} />
    {engineX.map(x => <group key={x} position={[x, -.79, 0]}>
      {!compact && <mesh geometry={nozzle} material={frame} />}
      <mesh geometry={light} material={engines[color] ?? engines['#70dcff']} position={[0, -.09, 0]} />
    </group>)}
    {!compact && <>
      <Plate position={[0,-.05,.17]} scale={[.18,.94,.11]} dark />
      <mesh geometry={box} material={canopy} position={[0,.42,.19]} scale={[.16,.24,.08]} />
      <Plate position={[0,.12,.24]} scale={[.065,.26,.018]} trim />
      {kind === 'attack' && !['lightFighter','heavyFighter','bomber','deathstar'].includes(shipClass ?? '') && <>
        {[-1,1].map(side => <group key={side}>
          <Plate position={[side*.42,-.19,0]} scale={[.22,1.12,.19]} />
          <Plate position={[side*.31,-.24,-.01]} scale={[.36,.15,.1]} dark />
          <Plate position={[side*.43,.12,.12]} scale={[.06,.15,.015]} trim />
          {[-.31,.16].map(y => <group key={y} position={[side*.17,y,.23]}>
            <Plate position={[0,0,0]} scale={[.12,.13,.08]} dark />
            <Plate position={[0,.13,.025]} scale={[.035,.25,.035]} />
          </group>)}
        </group>)}
      </>}
      {shipClass === 'deathstar' && <mesh geometry={fortressRing} material={frame} position={[0,0,.25]} />}
      {shipClass === 'solarSatellite' && [-1,1].map(side=><group key={side}><Plate position={[side*.6,0,.08]} scale={[.68,.33,.035]} dark /><Plate position={[0,side*.65,.08]} scale={[.25,.62,.035]} dark /></group>)}
      {kind === 'transport' && shipClass !== 'recycler' && [-1,1].map(side => <group key={side}>
        {(shipClass === 'smallCargo' ? [0] : [-.42,-.02,.38]).map(y => <group key={y}>
          <Plate position={[side*.38,y,0]} scale={[.32,.32,.3]} dark />
          <Plate position={[side*.38,y,.16]} scale={[.27,.27,.035]} />
          <Plate position={[side*.38,y,.185]} scale={[.025,.25,.012]} trim />
        </group>)}
      </group>)}
      {shipClass === 'recycler' && [-1,1].map(side=><group key={side}><mesh geometry={tank} material={armor} position={[side*.3,-.2,.1]} scale={[.65,.7,.65]}/><Plate position={[side*.35,.62,.12]} scale={[.08,.48,.1]} dark /><Plate position={[side*.24,.85,.12]} scale={[.25,.08,.1]} trim /></group>)}
      {kind === 'colonize' && [-1,1].map(side => <group key={side}>
        <mesh geometry={tank} material={armor} position={[side*.4,-.12,0]} />
        <Plate position={[side*.4,-.12,.15]} scale={[.055,.5,.015]} trim />
        <Plate position={[side*.32,-.47,-.06]} scale={[.36,.12,.12]} dark />
        <Plate position={[side*.55,.38,0]} scale={[.24,.45,.035]} dark />
      </group>)}
      {kind === 'espionage' && <>
        <Plate position={[0,.67,.03]} scale={[.025,.55,.025]} dark />
        {[-1,1].map(side => <Plate key={side} position={[side*.28,-.2,.025]} scale={[.19,.27,.035]} trim />)}
      </>}
    </>}
  </group>;
}
