import { useEffect, useMemo } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { planetBiomeTexture } from "./planet-biome-assets";
import type { PlanetSurfaceStyle } from "./planet-style";

type Rgb = [number, number, number];
type PlanetPalette = { water: Rgb; coast: Rgb; land: Rgb; highland: Rgb; polar: Rgb };

function colorChannels(hex: string): Rgb {
  const color = new THREE.Color(hex);
  return [color.r * 255, color.g * 255, color.b * 255];
}

function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  const t = THREE.MathUtils.clamp(amount, 0, 1);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function seededParameters(seed: number) {
  let value = (seed || 1) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  value ^= value >>> 16;
  const random = () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
  return Array.from({ length: 24 }, random);
}

function sphericalSignal(x: number, y: number, z: number, parameters: number[]): number {
  let signal = 0;
  let amplitude = 0;
  for (let octave = 0; octave < 5; octave += 1) {
    const base = octave * 4;
    const frequency = 1.35 * Math.pow(1.88, octave) * (.82 + parameters[base] * .42);
    const phase = parameters[base + 1] * Math.PI * 2;
    const dx = parameters[base + 2] * 2 - 1;
    const dy = parameters[base + 3] * 2 - 1;
    const dz = Math.sin(phase * .73 + octave * 1.91);
    const weight = Math.pow(.56, octave);
    signal += Math.sin((x * dx + y * dy + z * dz) * frequency * Math.PI + phase) * weight;
    amplitude += weight;
  }
  return .5 + signal / Math.max(.001, amplitude) * .5;
}

function proceduralColor(style: PlanetSurfaceStyle, palette: PlanetPalette, x: number, y: number, z: number, u: number, v: number, parameters: number[], reverseParameters: number[], sourceLuminance: number): Rgb {
  const { water, coast, land, highland, polar } = palette;
  const broad = sphericalSignal(x, y, z, parameters);
  const detail = sphericalSignal(z * 1.73, x * 1.73, y * 1.73, reverseParameters);
  const height = broad * .72 + detail * .2 + sourceLuminance * .08;
  const polarReach = .67 + parameters[20] * .16;
  const ice = smoothstep(polarReach, .98, Math.abs(y) + (detail - .5) * .13);
  let color: Rgb;

  if (style.className === "gas") {
    const bandCount = 13 + Math.floor(parameters[21] * 14);
    const bands = .5 + .5 * Math.sin((v - .5) * Math.PI * bandCount + broad * 4.8 + parameters[22] * Math.PI * 2);
    color = mix(water, land, bands);
    color = mix(color, highland, smoothstep(.72, .98, detail));
    const stormU = parameters[4];
    const stormV = .25 + parameters[5] * .5;
    const wrappedU = Math.min(Math.abs(u - stormU), 1 - Math.abs(u - stormU));
    const stormDistance = Math.hypot(wrappedU * 5.2, (v - stormV) * 11.5);
    const storm = 1 - smoothstep(.35, .7, stormDistance);
    color = mix(color, polar, storm * .76);
  } else if (style.className === "volcanic") {
    const crust = mix(water, land, smoothstep(.28, .72, height));
    const ridge = Math.abs(Math.sin((broad * 8.5 + detail * 3.2 + x * 2.1 - z * 1.7) * Math.PI));
    const fracture = 1 - smoothstep(.035, .17, ridge);
    color = mix(crust, highland, smoothstep(.64, .9, height));
    color = mix(color, polar, fracture * (.72 + parameters[23] * .25));
  } else {
    const seaLevel = style.className === "ocean" ? .57 + parameters[21] * .1 : style.className === "ice" ? .43 : .48 + parameters[21] * .1;
    const shore = smoothstep(seaLevel - .035, seaLevel + .035, height);
    color = mix(water, coast, shore);
    color = mix(color, land, smoothstep(seaLevel + .015, seaLevel + .14, height));
    color = mix(color, highland, smoothstep(seaLevel + .17, seaLevel + .34, height));
    if (style.className === "ice") color = mix(color, polar, .28 + ice * .7);
    else color = mix(color, polar, ice);
  }

  // The master biome image supplies photographic micro-detail only. Large
  // continents, storms, caps and fractures all come from the unique seed.
  const microDetail = .74 + sourceLuminance * .42;
  return [color[0] * microDetail, color[1] * microDetail, color[2] * microDetail];
}

function buildProceduralTexture(sourceTexture: THREE.Texture, style: PlanetSurfaceStyle, anisotropy: number, width: number): THREE.Texture {
  if (typeof document === "undefined" || !sourceTexture.image) {
    const fallback = sourceTexture.clone();
    fallback.anisotropy = anisotropy;
    fallback.needsUpdate = true;
    return fallback;
  }
  const height = Math.max(128, Math.round(width / 2));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return sourceTexture.clone();
  context.drawImage(sourceTexture.image as CanvasImageSource, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const parameters = seededParameters(style.proceduralSeed ?? style.variantSeed ?? 1);
  const reverseParameters = [...parameters].reverse();
  const palette: PlanetPalette = {
    water: colorChannels(style.water),
    coast: colorChannels(style.coast),
    land: colorChannels(style.land),
    highland: colorChannels(style.highland),
    polar: colorChannels(style.polar),
  };
  for (let py = 0; py < height; py += 1) {
    const v = (py + .5) / height;
    const latitude = (v - .5) * Math.PI;
    const cosLatitude = Math.cos(latitude);
    const y = Math.sin(latitude);
    for (let px = 0; px < width; px += 1) {
      const u = (px + .5) / width;
      const longitude = (u - .5) * Math.PI * 2;
      const x = Math.cos(longitude) * cosLatitude;
      const z = Math.sin(longitude) * cosLatitude;
      const index = (py * width + px) * 4;
      const luminance = (pixels.data[index] * .2126 + pixels.data[index + 1] * .7152 + pixels.data[index + 2] * .0722) / 255;
      const color = proceduralColor(style, palette, x, y, z, u, v, parameters, reverseParameters, luminance);
      pixels.data[index] = Math.min(255, color[0]);
      pixels.data[index + 1] = Math.min(255, color[1]);
      pixels.data[index + 2] = Math.min(255, color[2]);
      pixels.data[index + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  texture.userData.proceduralPlanet = true;
  texture.userData.variantSeed = style.variantSeed;
  texture.userData.proceduralSeed = style.proceduralSeed;
  return texture;
}

export function useProceduralPlanetTexture(style: PlanetSurfaceStyle, anisotropy = 8, width = 512): THREE.Texture {
  const sourceTexture = useTexture(planetBiomeTexture(style));
  const texture = useMemo(
    () => buildProceduralTexture(sourceTexture, style, anisotropy, width),
    [anisotropy, sourceTexture, style.atmosphere, style.className, style.coast, style.highland, style.land, style.polar, style.proceduralSeed, style.variantSeed, style.water, width],
  );
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}
