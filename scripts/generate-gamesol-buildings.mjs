import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

globalThis.FileReader = class {
  result = null;
  onloadend = null;
  onerror = null;
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((value) => { this.result = value; this.onloadend?.(); }).catch((error) => this.onerror?.(error)); }
  readAsDataURL(blob) { blob.arrayBuffer().then((value) => { this.result = `data:${blob.type};base64,${Buffer.from(value).toString("base64")}`; this.onloadend?.(); }).catch((error) => this.onerror?.(error)); }
};

const output = join(process.cwd(), "public", "planet-models", "gamesol");
await mkdir(output, { recursive: true });

const material = (color, metalness = .82, roughness = .26, emissive = null, emissiveIntensity = 0) => new THREE.MeshStandardMaterial({ color, metalness, roughness, emissive: emissive ?? "#000000", emissiveIntensity });
const dark = material("#07141d", .9, .22);
const hull = material("#172d3a", .88, .24);
const armor = material("#557481", .78, .25);
const trim = material("#a4c6cf", .72, .2);

function add(group, geometry, mat, position = [0, 0, 0], rotation = [0, 0, 0], name = "detail") {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(...position); mesh.rotation.set(...rotation); mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
}
const box = (group, size, mat, pos, rot, name) => add(group, new THREE.BoxGeometry(...size), mat, pos, rot, name);
const cyl = (group, radiusTop, radiusBottom, height, mat, pos, sides = 20, rot = [0, 0, 0], name) => add(group, new THREE.CylinderGeometry(radiusTop, radiusBottom, height, sides), mat, pos, rot, name);
const sphere = (group, radius, mat, pos, name) => add(group, new THREE.SphereGeometry(radius, 24, 16), mat, pos, [0, 0, 0], name);
const torus = (group, radius, tube, mat, pos, rot = [Math.PI / 2, 0, 0], name) => add(group, new THREE.TorusGeometry(radius, tube, 12, 48), mat, pos, rot, name);
const cone = (group, radius, height, mat, pos, sides = 12, rot = [0, 0, 0], name) => add(group, new THREE.ConeGeometry(radius, height, sides), mat, pos, rot, name);

function foundation(group, accent) {
  cyl(group, 4.8, 5.2, .55, dark, [0, .05, 0], 32, [0, 0, 0], "armored-foundation");
  cyl(group, 4.35, 4.55, .18, hull, [0, .42, 0], 32, [0, 0, 0], "upper-deck");
  torus(group, 4.5, .08, accent, [0, .53, 0], [Math.PI / 2, 0, 0], "perimeter-light");
  for (let i = 0; i < 8; i += 1) {
    const a = i * Math.PI / 4;
    box(group, [.42, .45, .62], armor, [Math.cos(a) * 4.55, .38, Math.sin(a) * 4.55], [0, -a, 0], `buttress-${i}`);
  }
}

function windows(group, accent, radius, height, count = 8) {
  for (let i = 0; i < count; i += 1) {
    const a = i * Math.PI * 2 / count;
    box(group, [.38, .1, .035], accent, [Math.cos(a) * radius, height + (i % 2) * .18, Math.sin(a) * radius], [0, -a, 0], `window-${i}`);
  }
}

function metalMine(accent) {
  const g = new THREE.Group(); foundation(g, accent);
  torus(g, 2.7, .52, hull, [0, .72, 0], [Math.PI / 2, 0, 0], "excavation-rim");
  cyl(g, 2.15, 2.7, .65, dark, [0, .72, 0], 32, [0, 0, 0], "excavation-pit");
  for (const side of [-1, 1]) {
    box(g, [.48, 3.8, .55], hull, [side * 2.75, 2.2, -.5], [0, 0, side * -.12], "excavator-tower");
    box(g, [3.6, .38, .58], armor, [side * 1.45, 3.55, -.5], [0, 0, side * -.24], "excavator-boom");
    cyl(g, .72, .72, .38, accent, [side * .1, 2.78, -.5], 24, [Math.PI / 2, 0, 0], "bucket-wheel");
  }
  box(g, [6.6, .3, .52], hull, [1.3, 1.22, 2.25], [0, -.35, .05], "ore-conveyor"); windows(g, accent, 3.7, .9, 10); return g;
}

function crystalMine(accent) {
  const g = new THREE.Group(); foundation(g, accent);
  [[0,4.8,0,1.15],[-1.5,3.5,.4,.78],[1.45,3.8,.15,.86],[-.7,2.7,-1.5,.58],[1.1,2.9,1.45,.62]].forEach(([x,y,z,r], i) => {
    cone(g, r, y, accent, [x, .65 + y / 2, z], 6, [0, i * .28, 0], `crystal-spire-${i}`);
    torus(g, r * .82, .08, trim, [x, 1.2 + i * .18, z], [Math.PI / 2, 0, 0], `extractor-${i}`);
  });
  for (const side of [-1, 1]) { box(g, [.5, 4.2, .5], hull, [side * 3.2, 2.5, .8], [0, 0, 0], "gantry-tower"); box(g, [3.4, .34, .42], armor, [side * 1.75, 4.25, .8], [0, 0, side * -.18], "gantry-arm"); }
  windows(g, accent, 4.1, .85, 12); return g;
}

function deuterium(accent) {
  const g = new THREE.Group(); foundation(g, accent);
  for (const x of [-2.25, 0, 2.25]) { sphere(g, 1.08, hull, [x, 1.55, .7], "pressure-vessel"); torus(g, 1.1, .09, trim, [x, 1.55, .7], [0, 0, 0], "vessel-brace"); }
  for (const x of [-1.05, 1.05]) { cyl(g, .62, .82, 4.5, hull, [x, 2.75, -1.25], 20, [0, 0, 0], "cryogenic-tower"); windows(g, accent, Math.abs(x), 2.2, 6); }
  box(g, [6.4, .34, .34], accent, [0, 1.18, 1.8], [0, 0, 0], "fuel-conduit"); torus(g, 2.85, .09, accent, [0, .88, 0]); return g;
}

function solarPlant(accent) {
  const g = new THREE.Group(); foundation(g, accent);
  cyl(g, .72, 1.45, 5.8, hull, [0, 3.1, 0], 24, [0, 0, 0], "receiver-tower");
  cyl(g, .95, .95, 1.25, accent, [0, 5.4, 0], 24, [0, 0, 0], "plasma-receiver"); torus(g, 1.15, .12, trim, [0, 5.3, 0]);
  for (let ring = 0; ring < 3; ring += 1) for (let i = 0; i < 8; i += 1) { const a = i * Math.PI / 4 + ring * .22; const r = 2 + ring * 1.05; box(g, [1.05, .08, .72], material("#174d70", .48, .18, "#0b3150", .45), [Math.cos(a) * r, .7 + ring * .08, Math.sin(a) * r], [.06, -a, 0], `heliostat-${ring}-${i}`); }
  return g;
}

function fusion(accent) {
  const g = new THREE.Group(); foundation(g, accent);
  cyl(g, 2.1, 2.65, 2.1, hull, [0, 1.45, 0], 28, [0, 0, 0], "containment-vault"); sphere(g, 1.15, accent, [0, 3.0, 0], "fusion-core");
  torus(g, 1.62, .18, trim, [0, 3, 0], [0, 0, 0], "containment-ring-x"); torus(g, 1.62, .18, trim, [0, 3, 0], [Math.PI / 2, 0, 0], "containment-ring-y"); torus(g, 1.62, .18, trim, [0, 3, 0], [Math.PI / 2, Math.PI / 2, 0], "containment-ring-z");
  for (let i = 0; i < 6; i += 1) { const a = i * Math.PI / 3; cyl(g, .3, .48, 2.8, hull, [Math.cos(a) * 2.85, 1.8, Math.sin(a) * 2.85], 14, [0, 0, 0], `coolant-tower-${i}`); }
  windows(g, accent, 2.25, 1.6, 12); return g;
}

function robotics(accent) {
  const g = new THREE.Group(); foundation(g, accent);
  box(g, [6.2, 2.25, 4.4], hull, [0, 1.55, 0], [0, 0, 0], "assembly-hall"); box(g, [5.5, .12, 3.75], dark, [0, 2.7, 0], [0, 0, 0], "factory-roof");
  for (const x of [-2.25, -1.1, 0, 1.1, 2.25]) box(g, [.65, .14, .04], accent, [x, 1.65, 2.22], [0, 0, 0], "assembly-window");
  for (const side of [-1, 1]) { box(g, [.42, 3.9, .42], armor, [side * 3.35, 2.35, -.8], [0, 0, 0], "crane-tower"); box(g, [3.4, .32, .38], hull, [side * 1.8, 4.05, -.8], [0, 0, side * -.16], "crane-arm"); }
  return g;
}

function nanite(accent) {
  const g = new THREE.Group(); foundation(g, accent);
  cyl(g, 1.25, 2.2, 4.6, hull, [0, 2.7, 0], 8, [0, .39, 0], "assembler-spire"); cone(g, 1.08, 2.6, accent, [0, 5.75, 0], 8, [0, .39, 0], "nanite-crown");
  for (let i = 0; i < 6; i += 1) { const a = i * Math.PI / 3; cyl(g, .28, .5, 2.35, armor, [Math.cos(a) * 2.7, 1.7, Math.sin(a) * 2.7], 10, [0, 0, 0], `assembler-pylon-${i}`); box(g, [2.35, .2, .22], hull, [Math.cos(a) * 1.55, 2.35, Math.sin(a) * 1.55], [0, -a, 0], `matter-feed-${i}`); }
  [1.65, 2.6, 3.55, 4.5].forEach((y, i) => torus(g, 1.65 - i * .16, .07, accent, [0, y, 0], [Math.PI / 2, i * .3, 0], `field-ring-${i}`)); return g;
}

function shipyard(accent) {
  const g = new THREE.Group(); foundation(g, accent);
  box(g, [3.8, .38, 7.4], dark, [0, .75, .55], [0, 0, 0], "construction-trench");
  for (const side of [-1, 1]) { box(g, [.65, 5.1, .72], hull, [side * 2.65, 3.0, .3], [0, 0, 0], "gantry-pillar"); box(g, [3.0, .5, .68], armor, [side * 1.35, 5.3, .3], [0, 0, side * -.12], "gantry-crown"); }
  for (const z of [-2.5, -1.2, .1, 1.4, 2.7]) box(g, [4.9, .18, .34], accent, [0, 1.0, z], [0, 0, 0], "dock-light");
  cone(g, .72, 4.4, trim, [0, 2.85, .6], 6, [0, 0, Math.PI], "hull-under-construction"); return g;
}

function storageFacility(accent, kind) {
  const g = new THREE.Group(); foundation(g, accent);
  for (let i = 0; i < 7; i += 1) { const a = i * Math.PI * 2 / 7; const r = i === 0 ? 0 : 2.55; const x = i === 0 ? 0 : Math.cos(a) * r; const z = i === 0 ? 0 : Math.sin(a) * r; if (kind === 1) { box(g, [1.35, 2.6 + (i % 2) * .4, 1.35], hull, [x, 1.7, z], [0, a, 0], "metal-vault"); } else if (kind === 2) { add(g, new THREE.OctahedronGeometry(.92 + (i === 0 ? .25 : 0), 1), accent, [x, 1.65, z], [0, a, 0], "crystal-cell"); cyl(g, .82, 1.0, .75, hull, [x, .85, z], 12); } else { sphere(g, .92 + (i === 0 ? .2 : 0), hull, [x, 1.6, z], "fuel-tank"); torus(g, .96, .08, accent, [x, 1.6, z], [0, 0, 0]); } }
  windows(g, accent, 4.0, .85, 12); return g;
}

function researchLab(accent) {
  const g = new THREE.Group(); foundation(g, accent);
  cyl(g, 2.7, 3.3, 1.65, hull, [0, 1.25, 0], 28, [0, 0, 0], "laboratory-base");
  add(g, new THREE.SphereGeometry(2.35, 32, 18, 0, Math.PI * 2, 0, Math.PI / 2), armor, [0, 2.05, 0], [0, 0, 0], "observatory-dome");
  cyl(g, .24, .42, 4.2, hull, [0, 4.1, 0], 16, [0, 0, 0], "sensor-spire"); add(g, new THREE.CylinderGeometry(1.15, 1.15, .12, 32), trim, [0, 5.7, 0], [Math.PI / 2, 0, .28], "deep-space-dish");
  for (let i = 0; i < 8; i += 1) { const a = i * Math.PI / 4; box(g, [.44, .16, .05], accent, [Math.cos(a) * 2.82, 1.65, Math.sin(a) * 2.82], [0, -a, 0], `lab-window-${i}`); } return g;
}

function missileSilo(accent) {
  const g = new THREE.Group(); foundation(g, accent);
  for (let i = 0; i < 5; i += 1) { const a = i * Math.PI * 2 / 5; const x = Math.cos(a) * 2.25; const z = Math.sin(a) * 2.25; cyl(g, .75, .88, 1.05, hull, [x, 1.0, z], 20, [0, 0, 0], `silo-${i}`); torus(g, .72, .09, accent, [x, 1.55, z]); cone(g, .34, 1.15, trim, [x, 2.1, z], 12, [0, 0, 0], `missile-${i}`); }
  cyl(g, 1.15, 1.5, 3.5, dark, [0, 2.15, 0], 18, [0, 0, 0], "command-bunker"); windows(g, accent, 1.2, 2.4, 8); return g;
}

function evolveFacility(group, accent, stage, kind) {
  const scale = [.82, .93, 1.03, 1.12][stage];
  group.scale.setScalar(scale);
  if (stage === 0) return;
  const annexCount = stage === 1 ? 3 : stage === 2 ? 5 : 7;
  for (let i = 0; i < annexCount; i += 1) {
    const a = i * Math.PI * 2 / annexCount + kind * .19;
    const r = 5.15 + stage * .55 + (i % 2) * .34;
    const annex = new THREE.Group();
    annex.position.set(Math.cos(a) * r, .25, Math.sin(a) * r);
    annex.rotation.y = -a;
    if (kind <= 2 || (kind >= 8 && kind <= 10)) {
      cyl(annex, .55, .72, 1.25 + stage * .32, hull, [0, .68 + stage * .16, 0], 14, [0, 0, 0], `refinery-annex-${i}`);
      torus(annex, .57, .06, accent, [0, .82 + stage * .18, 0]);
    } else if (kind === 3 || kind === 4 || kind === 6 || kind === 11) {
      cyl(annex, .2, .42, 1.8 + stage * .5, hull, [0, 1.0 + stage * .25, 0], 12, [0, 0, 0], `energy-pylon-${i}`);
      sphere(annex, .22 + stage * .04, accent, [0, 1.95 + stage * .5, 0], `energy-node-${i}`);
    } else {
      box(annex, [1.35 + stage * .18, .72 + stage * .2, 1.05], hull, [0, .5 + stage * .1, 0], [0, 0, 0], `industrial-annex-${i}`);
      box(annex, [.72, .08, .04], accent, [0, .55 + stage * .12, .53], [0, 0, 0], `annex-light-${i}`);
    }
    box(annex, [.08, .03, r - 3.8], accent, [0, .08, -(r - 3.8) / 2], [0, 0, 0], `access-line-${i}`);
    group.add(annex);
  }
  if (stage >= 2) {
    torus(group, 5.25 + stage * .42, .09, accent, [0, .42, 0], [Math.PI / 2, 0, 0], `district-grid-${stage}`);
  }
  if (stage >= 3) {
    for (let i = 0; i < 4; i += 1) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const x = Math.cos(a) * 5.1; const z = Math.sin(a) * 5.1;
      box(group, [.35, 4.8, .35], armor, [x, 2.75, z], [0, -a, 0], `mega-pylon-${i}`);
      box(group, [.18, 2.2, .12], accent, [x, 2.9, z + .19], [0, -a, 0], `mega-pylon-light-${i}`);
    }
  }
}

function addAdvancedSilhouette(group, accent, stage, kind) {
  if (stage < 2) return;
  const high = stage === 3;
  if (kind <= 2) {
    const towerCount = high ? 5 : 3;
    for (let i = 0; i < towerCount; i += 1) {
      const a = i * Math.PI * 2 / towerCount + .38;
      const r = high ? 4.35 : 3.75;
      const height = 3.2 + (i % 2) * .85 + stage * .4;
      cyl(group, .24, .46, height, hull, [Math.cos(a) * r, .65 + height / 2, Math.sin(a) * r], 14, [0, 0, 0], `processing-tower-${i}`);
      torus(group, .36, .055, accent, [Math.cos(a) * r, 1.45 + (i % 2) * .34, Math.sin(a) * r], [Math.PI / 2, 0, 0], `tower-status-${i}`);
      box(group, [r * 1.15, .16, .2], armor, [Math.cos(a) * r * .53, 2.05 + (i % 2) * .24, Math.sin(a) * r * .53], [0, -a, 0], `material-feed-${i}`);
    }
    if (high) torus(group, 3.75, .18, hull, [0, 4.7, 0], [Math.PI / 2, 0, 0], "industrial-sky-ring");
  } else if (kind === 3 || kind === 4) {
    const ringHeight = high ? 5.9 : 4.8;
    torus(group, high ? 3.45 : 2.85, .18, armor, [0, ringHeight, 0], [Math.PI / 2, .18, 0], "power-crown");
    torus(group, high ? 2.78 : 2.26, .08, accent, [0, ringHeight, 0], [0, 0, 0], "power-crown-field-x");
    torus(group, high ? 2.78 : 2.26, .08, accent, [0, ringHeight, 0], [Math.PI / 2, 0, 0], "power-crown-field-y");
    for (let i = 0; i < (high ? 6 : 4); i += 1) {
      const a = i * Math.PI * 2 / (high ? 6 : 4);
      box(group, [.22, ringHeight - .8, .22], hull, [Math.cos(a) * (high ? 3.45 : 2.85), ringHeight / 2 + .35, Math.sin(a) * (high ? 3.45 : 2.85)], [0, -a, 0], `crown-support-${i}`);
    }
  } else if (kind === 5 || kind === 6) {
    const width = high ? 8.8 : 7.2;
    for (const z of high ? [-2.75, 0, 2.75] : [-2.25, 2.25]) {
      box(group, [width, .34, .42], armor, [0, 5.05 + Math.abs(z) * .08, z], [0, 0, 0], `assembly-gantry-${z}`);
      for (const x of [-width / 2 + .35, width / 2 - .35]) box(group, [.38, 4.7, .42], hull, [x, 2.7, z], [0, 0, 0], `gantry-support-${x}-${z}`);
      box(group, [.2, 3.35, .2], accent, [0, 3.3, z], [0, 0, 0], `assembly-lift-${z}`);
    }
    if (high) box(group, [6.2, 1.4, 2.05], dark, [0, 5.9, 0], [0, 0, 0], "orbital-assembly-hall");
  } else if (kind === 7) {
    const dockCount = high ? 4 : 2;
    for (let dock = 0; dock < dockCount; dock += 1) {
      const side = dock % 2 ? 1 : -1;
      const z = dock < 2 ? -.9 : 2.3;
      box(group, [.52, 5.8 + stage * .8, .62], hull, [side * (3.45 + (dock > 1 ? .7 : 0)), 3.25 + stage * .4, z], [0, 0, 0], `capital-dock-pillar-${dock}`);
      box(group, [3.9 + stage * .35, .38, .5], armor, [side * 1.9, 5.75 + stage * .65, z], [0, 0, side * -.12], `capital-dock-arm-${dock}`);
      box(group, [.08, .06, 6.8], accent, [side * (3.45 + (dock > 1 ? .7 : 0)), 1.05, z + 1.9], [0, 0, 0], `dock-guidance-${dock}`);
    }
    if (high) torus(group, 4.9, .16, armor, [0, 6.4, .45], [Math.PI / 2, 0, 0], "capital-dock-crown");
  } else if (kind >= 8 && kind <= 10) {
    const cells = high ? 10 : 6;
    for (let cell = 0; cell < cells; cell += 1) {
      const a = cell * Math.PI * 2 / cells + .2;
      const r = high ? 4.45 : 3.85;
      const height = 2.4 + (cell % 3) * .7 + stage * .32;
      if (kind === 8) box(group, [1.05, height, 1.05], hull, [Math.cos(a) * r, .65 + height / 2, Math.sin(a) * r], [0, -a, 0], `mega-vault-${cell}`);
      else if (kind === 9) add(group, new THREE.OctahedronGeometry(.72 + (cell % 2) * .16, 1), accent, [Math.cos(a) * r, 1.4 + (cell % 3) * .34, Math.sin(a) * r], [0, a, 0], `mega-crystal-cell-${cell}`);
      else sphere(group, .7 + (cell % 2) * .12, hull, [Math.cos(a) * r, 1.35 + (cell % 3) * .38, Math.sin(a) * r], `mega-fuel-cell-${cell}`);
    }
    torus(group, high ? 4.65 : 4.05, .14, accent, [0, 1.02, 0], [Math.PI / 2, 0, 0], "logistics-ring");
  } else if (kind === 11) {
    const dishes = high ? 5 : 3;
    for (let dish = 0; dish < dishes; dish += 1) {
      const a = dish * Math.PI * 2 / dishes;
      const r = high ? 4.3 : 3.7;
      cyl(group, .12, .28, 3.1 + stage * .35, hull, [Math.cos(a) * r, 2.2, Math.sin(a) * r], 12, [0, 0, 0], `array-mast-${dish}`);
      add(group, new THREE.CylinderGeometry(.72 + stage * .08, .72 + stage * .08, .08, 32), trim, [Math.cos(a) * r, 4.0 + stage * .32, Math.sin(a) * r], [Math.PI / 2, a, .34], `deep-space-array-${dish}`);
      sphere(group, .12, accent, [Math.cos(a) * r, 4.0 + stage * .32, Math.sin(a) * r], `array-node-${dish}`);
    }
    if (high) torus(group, 3.15, .1, accent, [0, 6.3, 0], [Math.PI / 2, 0, 0], "research-field-crown");
  } else if (kind === 12) {
    const siloCount = high ? 8 : 6;
    for (let silo = 0; silo < siloCount; silo += 1) {
      const a = silo * Math.PI * 2 / siloCount;
      const r = high ? 4.3 : 3.7;
      cyl(group, .48, .64, 1.4, dark, [Math.cos(a) * r, 1.15, Math.sin(a) * r], 18, [0, 0, 0], `strategic-silo-${silo}`);
      torus(group, .5, .06, accent, [Math.cos(a) * r, 1.88, Math.sin(a) * r], [Math.PI / 2, 0, 0], `silo-warning-${silo}`);
    }
    cyl(group, .42, .86, high ? 7.2 : 5.6, hull, [0, high ? 4.3 : 3.5, 0], 18, [0, 0, 0], "strategic-command-spire");
  }
}

function beamBetween(group, start, end, radius, mat, name) {
  const from = new THREE.Vector3(...start);
  const to = new THREE.Vector3(...end);
  const midpoint = from.clone().add(to).multiplyScalar(.5);
  const direction = to.clone().sub(from);
  const mesh = add(group, new THREE.CylinderGeometry(radius, radius, direction.length(), 10), mat, midpoint.toArray(), [0, 0, 0], name);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function addPlanetaryInfrastructure(group, accent, stage, kind) {
  const tier = stage + 1;
  const serviceRadius = 3.75 + stage * .34;

  // A readable service deck gives every structure human scale when the player
  // dives from the planetary view into facility inspection.
  for (let segment = 0; segment < 8; segment += 1) {
    const angle = segment * Math.PI / 4 + kind * .071;
    const nextAngle = angle + Math.PI / 4 - .06;
    const y = .62 + (segment % 2) * .045;
    beamBetween(
      group,
      [Math.cos(angle) * serviceRadius, y, Math.sin(angle) * serviceRadius],
      [Math.cos(nextAngle) * serviceRadius, y, Math.sin(nextAngle) * serviceRadius],
      .07,
      segment % 2 ? armor : hull,
      `service-catwalk-${segment}`,
    );
    const postX = Math.cos(angle) * serviceRadius;
    const postZ = Math.sin(angle) * serviceRadius;
    cyl(group, .035, .055, .62, armor, [postX, .84, postZ], 8, [0, 0, 0], `catwalk-post-${segment}`);
    sphere(group, .055, accent, [postX, 1.17, postZ], `navigation-beacon-${segment}`);
  }

  // Pipes and cable trunks make the facility feel connected to the planet,
  // instead of reading as a single toy-like object placed on a disc.
  const conduitCount = 3 + stage;
  for (let conduit = 0; conduit < conduitCount; conduit += 1) {
    const angle = conduit * Math.PI * 2 / conduitCount + kind * .23;
    const inner = 2.05 + (conduit % 2) * .3;
    const outer = 5.0 + stage * .46;
    const height = .5 + (conduit % 3) * .08;
    beamBetween(group, [Math.cos(angle) * inner, height, Math.sin(angle) * inner], [Math.cos(angle) * outer, height, Math.sin(angle) * outer], .105, hull, `utility-conduit-${conduit}`);
    torus(group, .14, .035, accent, [Math.cos(angle) * (outer - .58), height, Math.sin(angle) * (outer - .58)], [Math.PI / 2, 0, angle], `conduit-status-light-${conduit}`);
  }

  // Ventilation, radar and landing hardware are deliberately asymmetric so
  // silhouettes remain recognizable from orbit rather than becoming rings.
  const equipmentCount = 3 + tier;
  for (let equipment = 0; equipment < equipmentCount; equipment += 1) {
    const angle = equipment * 2.399963 + kind * .41;
    const radius = 2.25 + (equipment % 3) * .58;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if ((equipment + kind) % 3 === 0) {
      cyl(group, .19, .25, .58 + stage * .09, hull, [x, 1.0 + stage * .05, z], 12, [0, 0, 0], `thermal-vent-${equipment}`);
      cyl(group, .27, .27, .08, dark, [x, 1.33 + stage * .095, z], 12, [0, 0, 0], `vent-cap-${equipment}`);
    } else {
      box(group, [.72, .12, .46], material("#173e54", .52, .18, "#0b3551", .35), [x, .86 + stage * .04, z], [.08, -angle, 0], `collector-panel-${equipment}`);
      box(group, [.05, .38, .05], armor, [x, .66, z], [0, 0, 0], `panel-mount-${equipment}`);
    }
  }

  const padAngle = kind * .83 + .55;
  const padRadius = 5.75 + stage * .55;
  const padX = Math.cos(padAngle) * padRadius;
  const padZ = Math.sin(padAngle) * padRadius;
  cyl(group, 1.12 + stage * .08, 1.24 + stage * .08, .18, dark, [padX, .25, padZ], 32, [0, 0, 0], "landing-pad");
  torus(group, .82 + stage * .06, .055, accent, [padX, .36, padZ], [Math.PI / 2, 0, 0], "landing-guidance-light");
  for (let marker = 0; marker < 4; marker += 1) {
    const angle = marker * Math.PI / 2 + Math.PI / 4;
    sphere(group, .065, marker % 2 ? accent : trim, [padX + Math.cos(angle) * .76, .39, padZ + Math.sin(angle) * .76], `pad-light-${marker}`);
  }

  if (stage >= 2) {
    const mastX = -padX * .45;
    const mastZ = -padZ * .45;
    cyl(group, .07, .15, 3.3 + stage * .55, hull, [mastX, 2.05 + stage * .275, mastZ], 12, [0, 0, 0], "communications-mast");
    add(group, new THREE.CylinderGeometry(.72, .72, .07, 28), trim, [mastX, 3.72 + stage * .55, mastZ], [Math.PI / 2, padAngle, .34], "tracking-array");
    sphere(group, .1, accent, [mastX, 3.72 + stage * .55, mastZ], "tracking-node");
  }
}

const specs = [
  ["metalMine", "#ffae42", metalMine], ["crystalMine", "#65eaff", crystalMine], ["deuteriumSynthesizer", "#60efd0", deuterium], ["solarPlant", "#ffd15c", solarPlant],
  ["fusionReactor", "#72eaff", fusion], ["roboticsFactory", "#76dcff", robotics], ["naniteFactory", "#b992ff", nanite], ["shipyard", "#6de8ff", shipyard],
  ["metalStorage", "#d2e8ef", (a) => storageFacility(a, 1)], ["crystalStorage", "#76e8ff", (a) => storageFacility(a, 2)], ["deuteriumTank", "#72edb8", (a) => storageFacility(a, 3)],
  ["researchLab", "#bd9aff", researchLab], ["missileSilo", "#ff7d78", missileSilo],
];

const exporter = new GLTFExporter();
for (let kind = 0; kind < specs.length; kind += 1) {
  const [name, color, builder] = specs[kind];
  for (let stage = 0; stage < 4; stage += 1) {
    const accent = material(color, .3, .18, color, 1.8);
    const scene = new THREE.Scene();
    const facility = builder(accent); facility.name = `${name}-gamesol-stage-${stage + 1}`;
    evolveFacility(facility, accent, stage, kind);
    addAdvancedSilhouette(facility, accent, stage, kind);
    addPlanetaryInfrastructure(facility, accent, stage, kind);
    scene.add(facility); scene.updateMatrixWorld(true);
    const data = await exporter.parseAsync(scene, { binary: true, onlyVisible: true, trs: false });
    const filename = `${name}-stage${stage + 1}.glb`;
    await writeFile(join(output, filename), Buffer.from(data));
    console.log(`${filename} ${(data.byteLength / 1024).toFixed(1)} KB`);
  }
}
