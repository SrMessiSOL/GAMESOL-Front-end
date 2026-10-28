import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ShipClass } from './fleet-identity';

export type FleetHull = 'attack' | 'transport' | 'colonize' | 'espionage';
type Vec3 = [number, number, number];
export function strategicFleetScale(distance: number, verticalFov: number, height: number, minimum: number) {
  if (![distance, verticalFov, height, minimum].every(Number.isFinite)) return 1;
  const unitsPerPixel = 2 * Math.tan(verticalFov * Math.PI / 360) * Math.max(0, distance) / Math.max(1, height);
  return Math.min(128, Math.max(1, minimum, unitsPerPixel * 22));
}
function hull(points: number[][], depth: number) {
  const shape = new THREE.Shape();
  points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y)); shape.closePath();
  const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:.035,bevelThickness:.035,bevelSegments:1,steps:1});
  return g.translate(0,0,-depth/2);
}
function freighter(w:number,l:number,d:number) {
  return hull([[-w*.6,l],[w*.6,l],[w,l*.65],[w,-l*.8],[w*.65,-l],[-w*.65,-l],[-w,-l*.8],[-w,l*.65]],d);
}
function capital(w:number,l:number,d:number){
  const profile=[[0,-l],[w*.72,-l],[w,-l*.78],[w,l*.35],[w*.9,l*.72],[w*.56,l],[0,l+.025]].map(([x,y])=>new THREE.Vector2(x,y));
  return new THREE.LatheGeometry(profile,12).scale(1,1,d/w);
}
// Bow is +Y, dorsal surface +Z. Silhouettes follow the original UI artwork.
export const FLEET_CLASS_HULLS:Record<ShipClass,THREE.BufferGeometry>={
  smallCargo:freighter(.43,.92,.38), largeCargo:freighter(.57,1.23,.46),
  lightFighter:hull([[0,1],[.18,.56],[.24,.04],[.8,-.56],[.71,-.72],[.21,-.37],[.17,-.79],[-.17,-.79],[-.21,-.37],[-.71,-.72],[-.8,-.56],[-.24,.04],[-.18,.56]],.16),
  heavyFighter:hull([[-.12,.98],[.12,.98],[.3,.6],[.36,.18],[.83,-.47],[.73,-.67],[.32,-.38],[.27,-.83],[-.27,-.83],[-.32,-.38],[-.73,-.67],[-.83,-.47],[-.36,.18],[-.3,.6]],.29),
  cruiser:capital(.43,1.32,.28), battleship:capital(.5,1.38,.4),
  battlecruiser:capital(.46,1.35,.34), bomber:capital(.5,1.1,.4),
  destroyer:hull([[-.32,1.25],[-.13,1.4],[.13,1.4],[.32,1.25],[.48,.75],[.48,-1.12],[.32,-1.35],[-.32,-1.35],[-.48,-1.12],[-.48,.75]],.44),
  deathstar:new THREE.SphereGeometry(.93,12,8), recycler:freighter(.46,.76,.38),
  espionageProbe:new THREE.SphereGeometry(.4,10,6), colonyShip:freighter(.28,1.42,.25),
  solarSatellite:hull([[-.14,1.05],[.14,1.05],[.14,.18],[1.03,.18],[1.03,-.18],[.14,-.18],[.14,-1.05],[-.14,-1.05],[-.14,-.18],[-1.03,-.18],[-1.03,.18],[-.14,.18]],.12),
};
export const FLEET_HULLS={attack:FLEET_CLASS_HULLS.battlecruiser,transport:FLEET_CLASS_HULLS.largeCargo,colonize:FLEET_CLASS_HULLS.colonyShip,espionage:FLEET_CLASS_HULLS.espionageProbe};
const box=new THREE.BoxGeometry(1,1,1),cylinder=new THREE.CylinderGeometry(1,1,1,10),sphere=new THREE.SphereGeometry(1,12,8),ring=new THREE.TorusGeometry(1,.06,4,20);
function part(g:THREE.BufferGeometry,p:Vec3,s:Vec3,r:Vec3=[0,0,0]){
  return g.clone().applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p),new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),new THREE.Vector3(...s)));
}
function merged(parts:THREE.BufferGeometry[]){
  if(!parts.length)return new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([],3));
  const copies=parts.map(g=>g.index?g.toNonIndexed():g.clone()),result=mergeGeometries(copies,false);
  copies.forEach(g=>g.dispose());if(!result)throw new Error('Incompatible fleet geometry');return result;
}
type Model={structure:THREE.BufferGeometry;plating:THREE.BufferGeometry;glass:THREE.BufferGeometry;accents:THREE.BufferGeometry;engines:THREE.BufferGeometry;compact:THREE.BufferGeometry};
function model(ship:ShipClass):Model {
  const structure:THREE.BufferGeometry[]=[],plating:THREE.BufferGeometry[]=[],glass:THREE.BufferGeometry[]=[],accents:THREE.BufferGeometry[]=[],engines:THREE.BufferGeometry[]=[];
  const plate=(p:Vec3,s:Vec3,dark=false)=>(dark?structure:plating).push(part(box,p,s));
  const engine=(x:number,y:number,z:number,r=.105)=>{structure.push(part(cylinder,[x,y,z],[r*1.35,.22,r*1.35]));engines.push(part(cylinder,[x,y-.12,z],[r,.015,r]));};
  if(['cruiser','battleship','battlecruiser','bomber','destroyer'].includes(ship)){
    const capital=ship==='battleship'||ship==='destroyer',w=ship==='cruiser'?.43:.48;
    plate([0,-.18,.27],[w*1.55,1.25,.18]);plate([0,-.52,.46],[.38,.5,capital?.4:.22],true);plate([0,-.53,capital?.72:.56],[.48,.26,.14]);
    glass.push(part(box,[0,-.38,capital?.73:.57],[.38,.018,.06]));
    for(const side of [-1,1]){
      for(const y of [-.7,-.28,.16]){plate([side*(w+.04),y,.02],[.16,.25,.32],true);plate([side*(w+.08),y,.12],[.08,.19,.09]);}
      for(const y of [0,.45,.82]){plate([side*.24,y,.3],[.19,.18,.1],true);for(const x of [-.04,.04])plate([side*.24+x,y+.13,.34],[.035,.3,.035]);}
      accents.push(part(box,[side*.3,.74,.25],[.065,.57,.018]));engine(side*.31,-1.27,0,.13);
    }
    if(ship==='destroyer'){plate([0,1.17,-.12],[.44,.1,.32],true);for(const side of [-1,1]){plate([side*.34,1.32,-.22],[.09,.54,.1],true);plate([side*.13,1.37,.18],[.065,.52,.065]);}}
    if(ship==='bomber')for(const side of [-1,1])for(const y of [-.3,.15,.55])structure.push(part(cylinder,[side*.48,y,-.05],[.09,.22,.09]));
  }else if(ship==='smallCargo'||ship==='largeCargo'){
    const large=ship==='largeCargo';plate([0,large?.74:.52,.2],[large?.84:.56,.43,.2]);glass.push(part(box,[0,large?.97:.75,.22],[large?.65:.43,.02,.09]));
    for(const side of [-1,1])for(const y of large?[-.72,-.24,.24]:[-.4,.04]){plate([side*(large?.42:.36),y,large?.42:.13],[large?.39:.32,.42,large?.52:.4]);if(large)plate([side*.42,y,.81],[.39,.42,.22]);accents.push(part(box,[side*(large?.42:.36),y,large?.94:.34],[.025,.34,.012]));}
    if(large)for(const x of [-.3,0,.3])engine(x,-1.29,-.05,.11);else for(const side of [-1,1])engine(side*.26,-.94,0,.12);
  }else if(ship==='lightFighter'||ship==='heavyFighter'){
    const heavy=ship==='heavyFighter';plate([0,.05,.16],[heavy?.45:.29,.84,.15]);glass.push(part(sphere,[0,.35,.22],[heavy?.15:.12,.32,.13]));
    for(const side of [-1,1]){plate([side*(heavy?.38:.32),-.14,.11],[heavy?.23:.14,.65,.2],true);plate([side*.43,.24,.09],[.05,.59,.05]);plate([side*.47,-.55,.31],[.035,.26,.35]);engine(side*(heavy?.25:.19),-.81,0,heavy?.13:.085);}
    if(heavy){plate([0,-.13,.39],[.46,.24,.12],true);for(const x of [-.14,.14])plate([x,.1,.46],[.08,.5,.08]);}
  }else if(ship==='colonyShip'){
    for(const side of [-1,1])for(const y of [-.6,-.02,.56]){plating.push(part(cylinder,[side*.3,y,0],[.23,.48,.23]));plate([side*.43,y,-.16],[.4,.34,.035],true);}
    plating.push(part(cylinder,[0,-.78,.26],[.64,.13,.64],[Math.PI/2,0,0]));
    const dome=new THREE.SphereGeometry(1,16,8,0,Math.PI*2,0,Math.PI/2);glass.push(part(dome,[0,-.78,.34],[.53,.38,.53],[Math.PI/2,0,0]));dome.dispose();
    plate([0,-.78,.34],[.44,.34,.23]);for(const x of [-.31,.31])engine(x,-1.46,-.07,.13);
  }else if(ship==='recycler'){
    plate([0,.7,0],[.67,.18,.48]);plate([0,.72,-.19],[.73,.32,.1],true);plate([0,.73,.21],[.73,.32,.1]);
    for(const side of [-1,1]){structure.push(part(cylinder,[side*.55,-.12,0],[.3,.95,.3]));for(const y of [-.35,.05,.38])structure.push(part(ring,[side*.55,y,0],[.31,.31,.31],[Math.PI/2,0,0]));plate([side*.56,.6,.07],[.22,.37,.24]);engine(side*.48,-.81,0,.1);}
    glass.push(part(box,[0,.8,.03],[.46,.015,.19]));accents.push(part(box,[0,.82,.15],[.61,.025,.035]));
  }else if(ship==='espionageProbe'){
    structure.push(part(ring,[0,0,0],[.42,.42,.42]));for(const side of [-1,1]){plate([0,0,side*.6],[.035,.035,.72],true);plate([side*.46,0,0],[.5,.035,.035],true);}
    structure.push(part(cylinder,[0,.34,0],[.23,.09,.23]));glass.push(part(cylinder,[0,.4,0],[.16,.02,.16]));engine(0,-.43,0,.07);
  }else if(ship==='deathstar'){
    structure.push(part(ring,[0,0,0],[.935,.935,.935]));structure.push(part(cylinder,[.3,.4,.82],[.3,.04,.3],[Math.PI/2,0,0]));glass.push(part(cylinder,[.3,.4,.85],[.23,.015,.23],[Math.PI/2,0,0]));accents.push(part(cylinder,[.3,.4,.87],[.06,.02,.06],[Math.PI/2,0,0]));
  }else{
    structure.push(part(cylinder,[0,0,0],[.23,1.55,.23]));for(const side of [-1,1])for(const y of [-.42,.42]){plate([side*.69,y,0],[.79,.52,.04]);glass.push(part(box,[side*.69,y,.025],[.73,.46,.012]));}structure.push(part(ring,[0,0,0],[.32,.32,.32],[Math.PI/2,0,0]));
  }
  // Keep only silhouette-defining volumes at strategic distances, not turrets or seams.
  const compactParts:THREE.BufferGeometry[]=[];
  const coarse=(p:Vec3,s:Vec3)=>compactParts.push(part(box,p,s));
  if(['cruiser','battleship','battlecruiser','bomber','destroyer'].includes(ship)){
    coarse([0,-.5,.4],[.46,.4,ship==='battleship'||ship==='destroyer'?.65:.3]);
    if(ship==='destroyer')for(const side of [-1,1])coarse([side*.34,1.3,-.22],[.09,.55,.1]);
  }else if(ship==='largeCargo')for(const side of [-1,1])coarse([side*.42,-.24,.6],[.39,1.4,.65]);
  else if(ship==='smallCargo')for(const side of [-1,1])coarse([side*.36,-.2,.13],[.32,.8,.4]);
  else if(ship==='colonyShip'){
    for(const side of [-1,1])coarse([side*.3,0,0],[.45,1.65,.4]);
    const dome=new THREE.SphereGeometry(1,8,4);compactParts.push(part(dome,[0,-.78,.34],[.6,.6,.37]));dome.dispose();
  }else if(ship==='recycler')for(const side of [-1,1]){compactParts.push(part(cylinder,[side*.55,-.12,0],[.3,.95,.3]));coarse([side*.56,.6,.07],[.22,.37,.24]);}
  else if(ship==='espionageProbe'){coarse([0,0,0],[.035,.035,1.85]);coarse([0,0,0],[1.42,.035,.035]);compactParts.push(part(cylinder,[0,.35,0],[.22,.09,.22]));}
  else if(ship==='deathstar')compactParts.push(part(cylinder,[.3,.4,.82],[.3,.04,.3],[Math.PI/2,0,0]));
  else if(ship==='solarSatellite')for(const side of [-1,1])for(const y of [-.42,.42])coarse([side*.69,y,0],[.79,.52,.04]);
  else for(const side of [-1,1])coarse([side*.47,-.55,.31],[.035,.26,.35]);
  const result={structure:merged(structure),plating:merged(plating),glass:merged(glass),accents:merged(accents),engines:merged(engines),compact:merged([FLEET_CLASS_HULLS[ship],...compactParts])};
  [...structure,...plating,...glass,...accents,...engines,...compactParts].forEach(g=>g.dispose());return result;
}
export const FLEET_MODELS=Object.fromEntries(Object.keys(FLEET_CLASS_HULLS).map(key=>[key,model(key as ShipClass)])) as Record<ShipClass,Model>;
// Strategic display lengths, not literal kilometres: preserve hierarchy without hiding probes.
export const SHIP_VISUAL_LENGTH:Record<ShipClass,number>={
  espionageProbe:.4,solarSatellite:.85,lightFighter:.75,heavyFighter:1,
  smallCargo:1.25,recycler:1.8,largeCargo:2.25,cruiser:2.5,bomber:2.75,
  colonyShip:2.7,battlecruiser:3,battleship:3.25,destroyer:4.25,deathstar:8,
};
export const SHIP_MODEL_SCALE=Object.fromEntries(Object.entries(FLEET_MODELS).map(([key,parts])=>{
  const bounds=new THREE.Box3();
  for(const geometry of [FLEET_CLASS_HULLS[key as ShipClass],...Object.values(parts)]){
    if(!geometry.getAttribute('position').count)continue;
    geometry.computeBoundingBox();bounds.union(geometry.boundingBox!);
  }
  const size=bounds.getSize(new THREE.Vector3());
  return [key,SHIP_VISUAL_LENGTH[key as ShipClass]/Math.max(size.x,size.y,size.z)];
})) as Record<ShipClass,number>;
function armorPanels(){
  const data=new Uint8Array(128*128*4);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    const i=(y*128+x)*4,seam=x%32===0||y%16===0,shade=seam?118:207+(x*13+y*29)%19;
    data[i]=data[i+1]=data[i+2]=shade;data[i+3]=255;
  }
  const texture=new THREE.DataTexture(data,128,128);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;return texture;
}
const armor=new THREE.MeshStandardMaterial({color:'#92999b',map:armorPanels(),metalness:.65,roughness:.48,emissive:'#56656c',emissiveIntensity:.1});
const frame=new THREE.MeshStandardMaterial({color:'#30373c',metalness:.7,roughness:.46,emissive:'#485662',emissiveIntensity:.16});
const gold=new THREE.MeshStandardMaterial({color:'#c6a558',metalness:.5,roughness:.45});
const glass=new THREE.MeshStandardMaterial({color:'#153b53',metalness:.6,roughness:.19,emissive:'#3989a1',emissiveIntensity:.4});
const distant=new THREE.MeshBasicMaterial({color:'#a5b5bd',toneMapped:false});
// Shared cosmetic materials never change hull geometry, scale or mission indicators.
const skinMaterials=[{armor,gold,distant},...[
  ['#dde8eb','#22cbbf'],['#552d36','#e5e9ed'],['#e0bb52','#26353b'],
].map(([hull,trim])=>({
  armor:new THREE.MeshStandardMaterial({color:hull,map:armor.map,metalness:.65,roughness:.48}),
  gold:new THREE.MeshStandardMaterial({color:trim,metalness:.5,roughness:.45}),
  distant:new THREE.MeshBasicMaterial({color:hull,toneMapped:false}),
}))];
const engines=Object.fromEntries(['#70dcff','#ff586d','#d998ff','#ffc866','#45f4c1','#6fdbd1','#d5fff4'].map(color=>[color,new THREE.MeshBasicMaterial({color,toneMapped:false})]));
const defaults:Record<FleetHull,ShipClass>={attack:'battlecruiser',transport:'largeCargo',colonize:'colonyShip',espionage:'espionageProbe'};
export function FleetVessel({kind,shipClass,color='#70dcff',compact=false,presentation='fleet',skin=0}:{kind:FleetHull;shipClass?:ShipClass;color?:string;compact?:boolean;presentation?:'fleet'|'inspection';skin?:number}){
  const key=shipClass??defaults[kind],parts=FLEET_MODELS[key];
  const paint=skinMaterials[skin]??skinMaterials[0];
  return <group dispose={null} scale={presentation==='inspection'?1:SHIP_MODEL_SCALE[key]}>
    <mesh geometry={compact?parts.compact:FLEET_CLASS_HULLS[key]} material={compact ? paint.distant : paint.armor}/>
    {!compact&&<><mesh geometry={parts.structure} material={frame}/><mesh geometry={parts.plating} material={paint.armor}/><mesh geometry={parts.glass} material={glass}/><mesh geometry={parts.accents} material={paint.gold}/></>}
    <mesh geometry={parts.engines} material={engines[color]??engines['#70dcff']}/>
  </group>;
}
