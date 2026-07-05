import React from "react";
import type { Planet } from "./game-state";
import { getPlanetTheme } from "./art-direction";
import { getPlanetIdentity } from "./planet-generation";

type PlanetBiome = "lava" | "temperate" | "arid" | "ice" | "oceanic" | "toxic" | "storm" | "generic";
type RGBA = [number, number, number, number];

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rgba = (r: number, g: number, b: number, a = 255): RGBA => [r, g, b, a];
function mixColor(a: RGBA, b: RGBA, t: number): RGBA { return [Math.round(lerp(a[0],b[0],t)),Math.round(lerp(a[1],b[1],t)),Math.round(lerp(a[2],b[2],t)),Math.round(lerp(a[3],b[3],t))]; }
function mulColor(a: RGBA, f: number): RGBA { return [clamp(Math.round(a[0]*f),0,255),clamp(Math.round(a[1]*f),0,255),clamp(Math.round(a[2]*f),0,255),a[3]]; }
function addColor(a: RGBA, amt: number): RGBA { return [clamp(a[0]+amt,0,255),clamp(a[1]+amt,0,255),clamp(a[2]+amt,0,255),a[3]]; }
function hashCoords(galaxy: number, system: number, position: number): number { let h=2166136261>>>0; const str=`${galaxy}:${system}:${position}`; for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);} return h>>>0; }
function mulberry32(seed: number) { return function(){ let t=(seed+=0x6d2b79f5); t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return((t^(t>>>14))>>>0)/4294967296; }; }
function valueNoise2D(x: number, y: number, seed: number): number { let n=Math.imul((x|0)^0x27d4eb2d,374761393)^Math.imul((y|0)^0x165667b1,668265263)^seed; n=(n^(n>>>13))>>>0; n=Math.imul(n,1274126177)>>>0; return(n&0xffff)/0xffff; }
function smoothNoise2D(x: number, y: number, seed: number): number { const x0=Math.floor(x),y0=Math.floor(y),xf=x-x0,yf=y-y0; const v00=valueNoise2D(x0,y0,seed),v10=valueNoise2D(x0+1,y0,seed),v01=valueNoise2D(x0,y0+1,seed),v11=valueNoise2D(x0+1,y0+1,seed); const sx=xf*xf*(3-2*xf),sy=yf*yf*(3-2*yf); return lerp(lerp(v00,v10,sx),lerp(v01,v11,sx),sy); }
function fbm2D(x: number, y: number, seed: number, octaves=5): number { let value=0,amp=0.5,freq=1,norm=0; for(let i=0;i<octaves;i++){value+=smoothNoise2D(x*freq,y*freq,seed+i*9973)*amp;norm+=amp;amp*=0.5;freq*=2;} return value/norm; }
type PixelPlanetVisual = { seed:number; biome:PlanetBiome; basePalette:RGBA[]; atmosphere:RGBA; glow:RGBA; cloudPalette:RGBA[]; ringColor:RGBA; stormColor:RGBA; hasRings:boolean; hasStorm:boolean; craterDensity:number; cloudDensity:number; mountainDensity:number; waterLevel:number; banding:number; polarCaps:boolean; rotationSpeed:number; cloudDriftSpeed:number; };

function paletteFromVisualFamily(biome: PlanetBiome): { basePalette: RGBA[]; atmosphere: RGBA; glow: RGBA; cloudPalette: RGBA[]; ringColor: RGBA; stormColor: RGBA } {
  switch (biome) {
    case "lava":
      return { basePalette:[rgba(26,8,10),rgba(72,18,16),rgba(138,34,18),rgba(212,79,18),rgba(255,173,67)], atmosphere:rgba(255,104,36,90), glow:rgba(255,98,28,180), cloudPalette:[rgba(255,190,110,32), rgba(255,120,40,44)], ringColor:rgba(255,158,87,110), stormColor:rgba(255,214,120,180) };
    case "temperate":
      return { basePalette:[rgba(12,34,56),rgba(28,86,136),rgba(32,126,98),rgba(88,165,101),rgba(186,205,144)], atmosphere:rgba(90,185,255,80), glow:rgba(72,198,255,150), cloudPalette:[rgba(248,252,255,95), rgba(192,234,255,70)], ringColor:rgba(160,232,255,105), stormColor:rgba(244,249,255,180) };
    case "arid":
      return { basePalette:[rgba(59,33,20),rgba(111,67,38),rgba(164,103,63),rgba(212,164,109),rgba(241,219,174)], atmosphere:rgba(255,194,108,64), glow:rgba(255,191,110,135), cloudPalette:[rgba(245,224,180,42), rgba(255,214,163,58)], ringColor:rgba(230,196,138,105), stormColor:rgba(255,230,191,175) };
    case "ice":
      return { basePalette:[rgba(21,41,68),rgba(47,86,128),rgba(112,165,197),rgba(195,229,243),rgba(244,250,255)], atmosphere:rgba(160,220,255,88), glow:rgba(180,230,255,145), cloudPalette:[rgba(252,252,255,74), rgba(202,232,255,64)], ringColor:rgba(205,236,255,120), stormColor:rgba(242,247,255,185) };
    case "oceanic":
      return { basePalette:[rgba(5,28,55),rgba(12,74,122),rgba(24,122,168),rgba(42,163,172),rgba(158,232,218)], atmosphere:rgba(88,205,255,86), glow:rgba(66,196,255,150), cloudPalette:[rgba(240,249,255,82), rgba(183,233,255,66)], ringColor:rgba(150,220,255,110), stormColor:rgba(228,247,255,188) };
    case "toxic":
      return { basePalette:[rgba(23,31,8),rgba(58,87,18),rgba(95,125,27),rgba(157,171,44),rgba(215,212,102)], atmosphere:rgba(164,235,72,72), glow:rgba(146,222,61,142), cloudPalette:[rgba(214,246,139,48), rgba(170,212,82,62)], ringColor:rgba(185,230,102,102), stormColor:rgba(230,255,170,176) };
    case "storm":
      return { basePalette:[rgba(18,22,54),rgba(42,56,113),rgba(81,103,186),rgba(126,149,221),rgba(211,225,255)], atmosphere:rgba(130,156,255,84), glow:rgba(121,144,255,148), cloudPalette:[rgba(238,242,255,88), rgba(186,195,255,72)], ringColor:rgba(169,180,255,110), stormColor:rgba(244,248,255,195) };
    case "generic":
    default:
      return { basePalette:[rgba(19,36,57),rgba(39,83,121),rgba(48,130,126),rgba(103,176,144),rgba(204,222,186)], atmosphere:rgba(116,211,232,78), glow:rgba(96,198,232,140), cloudPalette:[rgba(244,249,255,82), rgba(202,232,240,62)], ringColor:rgba(175,227,231,104), stormColor:rgba(247,252,255,180) };
  }
}

function chooseVisual(planet: Planet): PixelPlanetVisual {
  const identity = getPlanetIdentity(planet);
  const seed = hashCoords(planet.galaxy||1, planet.system||1, clamp(planet.position||1,1,15)) ^ parseInt(identity.variantCode, 36);
  const rand = mulberry32(seed);
  const biomeMap: Record<string, PlanetBiome> = { "hero-lava":"lava","hero-temperate":"temperate","hero-arid":"arid","hero-ice":"ice","hero-oceanic":"oceanic","hero-toxic":"toxic","hero-storm":"storm","hero-generic":"generic" };
  const biome = biomeMap[identity.visualFamily] ?? "generic";
  const palette = paletteFromVisualFamily(biome);
  const anomalyFactor = (identity.anomaly.length % 5) / 5;
  const weatherFactor = (identity.weather.length % 7) / 7;
  const roleFactor = (identity.strategicRole.length % 6) / 6;
  const rotationSpeed = 0.000012 + rand()*0.000026 + weatherFactor*0.000008;
  const cloudDriftSpeed = 0.000018 + rand()*0.00002 + anomalyFactor*0.000006;
  const hasRings = false;
  const hasStorm = /storm|thunder|cyclone|squall|pressure/i.test(identity.weather) || biome === "storm" || rand() > 0.7;
  return {
    seed, biome, ...palette, hasRings, hasStorm,
    craterDensity: biome === "temperate" || biome === "oceanic" ? 0.012 + rand()*0.03 : 0.03 + rand()*0.08,
    cloudDensity: biome === "storm" ? 0.18 + rand()*0.12 : biome === "oceanic" || biome === "temperate" ? 0.10 + rand()*0.12 : biome === "ice" ? 0.08 + rand()*0.10 : 0.03 + rand()*0.06,
    mountainDensity: 0.08 + rand()*0.14 + roleFactor*0.04,
    waterLevel: biome === "oceanic" ? 0.56 + rand()*0.18 : biome === "temperate" ? 0.30 + rand()*0.20 : biome === "ice" ? 0.08 + rand()*0.12 : biome === "arid" ? (rand()>0.85 ? 0.05 + rand()*0.06 : 0) : 0,
    banding: biome === "storm" ? 0.16 + rand()*0.12 : biome === "lava" ? 0.12 + rand()*0.10 : 0.03 + rand()*0.08,
    polarCaps: biome === "ice" || (biome === "temperate" && rand() > 0.5),
    rotationSpeed, cloudDriftSpeed,
  };
}

function renderPixelPlanetToCanvas(canvas: HTMLCanvasElement, planet: Planet, opts?: { size?: number; rotationOffset?: number; cloudOffset?: number }) {
  const size=opts?.size??92; const visual=chooseVisual(planet); const rotationOffset=opts?.rotationOffset??0; const cloudOffset=opts?.cloudOffset??0;
  canvas.width=size; canvas.height=size; canvas.style.width=`${size}px`; canvas.style.height=`${size}px`;
  const ctx=canvas.getContext("2d",{alpha:true}); if(!ctx)return; ctx.clearRect(0,0,size,size); ctx.imageSmoothingEnabled=false;
  const cx=size/2,cy=size/2,radius=Math.floor(size*0.355); const rand=mulberry32(visual.seed); const lightX=-0.62,lightY=-0.42;
  const tilt=(rand()*2-1)*0.35; const stormCx=(rand()*1.2-0.6)*0.45; const stormCy=(rand()*1.2-0.6)*0.45; const stormR=0.10+rand()*0.09;
  const img=ctx.createImageData(size,size); const data=img.data;
  function paletteSample(palette: RGBA[], t: number): RGBA { const n=palette.length-1; if(t<=0)return palette[0]; if(t>=1)return palette[n]; const scaled=t*n; const i=Math.floor(scaled); const f=scaled-i; return mixColor(palette[i],palette[Math.min(i+1,n)],f); }
  for(let py=0;py<size;py++){for(let px=0;px<size;px++){const dx=(px-cx)/radius,dy=(py-cy)/radius; const rr=dx*dx+dy*dy; if(rr>1)continue; const z=Math.sqrt(1-rr); const nx=dx,ny=dy*Math.cos(tilt)-z*Math.sin(tilt),nz=dy*Math.sin(tilt)+z*Math.cos(tilt); const shade=clamp(nx*lightX+ny*lightY+nz*0.88,-1,1); const lambert=0.28+Math.max(0,shade)*0.85; const u=(0.5+Math.atan2(nx,nz)/(Math.PI*2)+rotationOffset)%1; const v=0.5-Math.asin(ny)/Math.PI; const continents=fbm2D(u*5.5+11.7,v*5.5+3.2,visual.seed+101,6); const details=fbm2D(u*16.0+0.8,v*16.0+7.3,visual.seed+202,5); const ridges=fbm2D(u*22.0+8.4,v*22.0+9.1,visual.seed+303,4); const micro=fbm2D(u*42.0+2.1,v*42.0+1.6,visual.seed+404,3); const lat=Math.abs(v-0.5)*2; const band=(Math.sin((v+u*0.2)*Math.PI*(4+visual.banding*18)+visual.seed*0.001)+1)*0.5; let height=continents*0.56+details*0.24+ridges*0.14+micro*0.06+band*visual.banding*0.22;
    if(visual.biome==="temperate"||visual.biome==="ice"||visual.biome==="oceanic")height-=visual.waterLevel*0.42; else if(visual.biome==="arid")height-=visual.waterLevel*0.20; else height+=0.06;
    let color=paletteSample(visual.basePalette,clamp(height,0,1));
    if(visual.biome==="temperate"||visual.biome==="oceanic"){ if(height<0.08) color=mixColor(rgba(7,35,76,255), rgba(42,118,188,255), clamp((height+0.12)/0.20,0,1)); else { if(height>0.42) color=mixColor(color,rgba(184,188,154,255),0.25); if(height>0.62) color=mixColor(color,rgba(232,234,228,255),0.35);} }
    if(visual.biome==="lava"){ const magma=fbm2D(u*19+1.3,v*19+2.6,visual.seed+606,5); const crack=fbm2D(u*40+3.7,v*40+5.5,visual.seed+707,3); if(magma>0.66||crack>0.73)color=mixColor(color,rgba(255,129,32,255),0.62); if(magma>0.80)color=mixColor(color,rgba(255,210,92,255),0.74); }
    if(visual.biome==="toxic"){ const acid=fbm2D(u*17+4.1,v*17+3.7,visual.seed+909,5); if(acid>0.68) color=mixColor(color, rgba(193,255,106,255), 0.42); }
    if(visual.biome==="storm"){ const charge=fbm2D(u*28+1.7,v*28+8.3,visual.seed+515,4); if(charge>0.7) color=mixColor(color, rgba(215,223,255,255), 0.38); }
    if(visual.polarCaps&&lat>0.72)color=mixColor(color,rgba(245,248,255,255),clamp((lat-0.72)/0.22,0,1)*0.85);
    const craterNoise=fbm2D(u*31+9.1,v*31+1.4,visual.seed+808,4); if(craterNoise>1-visual.craterDensity)color=mulColor(color,0.72);
    if(visual.hasStorm){ const sx=u-(0.5+stormCx),sy=v-(0.5+stormCy),sdist=Math.sqrt(sx*sx+sy*sy); if(sdist<stormR){ const spiral=Math.sin(Math.atan2(sy,sx)*6+sdist*64-visual.seed*0.002); const stormAmt=clamp((stormR-sdist)/stormR,0,1)*(0.28+(spiral+1)*0.24); color=mixColor(color,visual.stormColor,stormAmt); } }
    const cloudNoise=fbm2D((u+cloudOffset)*14+5.3,v*14+7.9,visual.seed+1111,5); if(cloudNoise>1-visual.cloudDensity)color=mixColor(color,visual.cloudPalette[0],clamp((cloudNoise-(1-visual.cloudDensity))/visual.cloudDensity,0,1)*0.70);
    const rim=Math.pow(1-z,1.6); color=mixColor(color,visual.atmosphere,rim*0.65); color=mulColor(color,lambert); const spec=Math.pow(Math.max(0,shade),18); color=addColor(color,Math.round(spec*(visual.biome==="lava"||visual.biome==="toxic"?24:52)));
    const idx=(py*size+px)*4; data[idx]=color[0];data[idx+1]=color[1];data[idx+2]=color[2];data[idx+3]=255;
  }}
  const ringRotation = -0.28;
  const ringCx = cx;
  const ringCy = cy + radius * 0.2;
  const ringRxOuter = radius * 1.48;
  const ringRyOuter = radius * 0.38;
  const ringRxInner = radius * 1.2;
  const ringRyInner = radius * 0.24;
  const drawRingBand = (startAngle: number, endAngle: number, alphaScale: number) => {
    ctx.save();
    ctx.translate(ringCx, ringCy);
    ctx.rotate(ringRotation);
    const ringGradient = ctx.createLinearGradient(-ringRxOuter, 0, ringRxOuter, 0);
    ringGradient.addColorStop(0, `rgba(${visual.ringColor[0]},${visual.ringColor[1]},${visual.ringColor[2]},${0.16 * alphaScale})`);
    ringGradient.addColorStop(0.2, `rgba(${visual.ringColor[0]},${visual.ringColor[1]},${visual.ringColor[2]},${0.54 * alphaScale})`);
    ringGradient.addColorStop(0.5, `rgba(255,255,255,${0.3 * alphaScale})`);
    ringGradient.addColorStop(0.8, `rgba(${visual.ringColor[0]},${visual.ringColor[1]},${visual.ringColor[2]},${0.5 * alphaScale})`);
    ringGradient.addColorStop(1, `rgba(${visual.ringColor[0]},${visual.ringColor[1]},${visual.ringColor[2]},${0.12 * alphaScale})`);
    ctx.fillStyle = ringGradient;
    ctx.beginPath();
    ctx.ellipse(0, 0, ringRxOuter, ringRyOuter, 0, startAngle, endAngle);
    ctx.ellipse(0, 0, ringRxInner, ringRyInner, 0, endAngle, startAngle, true);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.22 * alphaScale})`;
    ctx.lineWidth = Math.max(1, size * 0.006);
    ctx.beginPath();
    ctx.ellipse(0, 0, ringRxOuter, ringRyOuter, 0, startAngle, endAngle);
    ctx.stroke();
    ctx.restore();
  };
  if (visual.hasRings) drawRingBand(Math.PI * 1.06, Math.PI * 1.94, 0.48);
  ctx.putImageData(img,0,0);
  if (visual.hasRings) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.995, 0, Math.PI * 2);
    ctx.clip();
    const occlusion = ctx.createLinearGradient(cx - radius, cy - radius * 0.08, cx + radius, cy + radius * 0.72);
    occlusion.addColorStop(0, "rgba(0,0,0,0)");
    occlusion.addColorStop(0.3, "rgba(0,0,0,0.05)");
    occlusion.addColorStop(0.5, "rgba(0,0,0,0.28)");
    occlusion.addColorStop(0.72, "rgba(0,0,0,0.1)");
    occlusion.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = occlusion;
    ctx.fillRect(cx - radius * 1.2, cy - radius * 0.05, radius * 2.4, radius * 1.35);
    ctx.restore();
  }
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const glow = ctx.createRadialGradient(cx, cy, radius * 0.35, cx, cy, radius * 1.35);
  glow.addColorStop(0, `rgba(${visual.glow[0]},${visual.glow[1]},${visual.glow[2]},0.10)`);
  glow.addColorStop(1, `rgba(${visual.glow[0]},${visual.glow[1]},${visual.glow[2]},0)`);
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(cx, cy, radius * 1.35, 0, Math.PI * 2); ctx.fill();
  if (visual.hasRings) {
    ctx.save();
    ctx.shadowColor = `rgba(${visual.ringColor[0]},${visual.ringColor[1]},${visual.ringColor[2]},0.28)`;
    ctx.shadowBlur = size * 0.04;
    ctx.beginPath();
    ctx.rect(0, 0, size, size);
    ctx.arc(cx, cy, radius * 1.01, 0, Math.PI * 2, true);
    ctx.clip("evenodd");
    drawRingBand(0.2, Math.PI - 0.2, 0.92);
    ctx.restore();
  }
  ctx.restore();
}

export const PixelPlanetCanvas: React.FC<{ planet: Planet; size?: number; rotationOffset?: number; cloudOffset?: number }> = ({ planet, size=92, rotationOffset=0, cloudOffset=0 }) => { const ref=React.useRef<HTMLCanvasElement|null>(null); React.useEffect(()=>{if(!ref.current)return; renderPixelPlanetToCanvas(ref.current,planet,{size,rotationOffset,cloudOffset});},[planet.galaxy,planet.system,planet.position,planet.temperature,planet.diameter,planet.maxFields,planet.name,size,rotationOffset,cloudOffset]); return <canvas ref={ref} width={size} height={size} style={{display:"block",imageRendering:"pixelated"}} />; };

export const OrbitingPlanetVisual: React.FC<{ planet: Planet; size?: number }> = ({ planet, size=175 }) => { const [time,setTime]=React.useState(0); const visual=React.useMemo(()=>chooseVisual(planet),[planet.galaxy,planet.system,planet.position,planet.temperature,planet.diameter,planet.maxFields,planet.name]); React.useEffect(()=>{let raf=0; const started=performance.now(); const tick=(now: number)=>{setTime(now-started);raf=requestAnimationFrame(tick);}; raf=requestAnimationFrame(tick); return()=>cancelAnimationFrame(raf);},[]); return <PixelPlanetCanvas planet={planet} size={size} rotationOffset={(time*visual.rotationSpeed)%1} cloudOffset={(time*visual.cloudDriftSpeed)%1} />; };

export const PlanetSceneCard: React.FC<{ planet: Planet; size?: number; compact?: boolean }> = ({ planet, size = 164, compact = false }) => {
  const theme = getPlanetTheme(planet);
  const style = {
    "--planet-accent": theme.accent,
  } as React.CSSProperties;

  return (
    <div className="hero-planet-card" style={style}>
      <div className="hero-planet-visual">
        <OrbitingPlanetVisual planet={planet} size={compact ? Math.max(84, size - 50) : Math.max(110, size - 30)} />
      </div>
    </div>
  );
};
