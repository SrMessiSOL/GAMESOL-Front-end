import { useEffect, useState } from 'react';
import { frameAccent, validFrameStyle, type FrameStyle, type UfoTrait } from './ufo-traits';

const eventName = 'gamesol:ufo-cosmetic-frame';
const keyFor = (id: string) => `gamesol:ufo-frame:v1:${id}`;
function preference(id?: string) {
  try { return id ? validFrameStyle(localStorage.getItem(keyFor(id))) : 'body' as const; }
  catch { return 'body' as const; }
}

// Cosmetic preference only. This must never authorize a reward or gameplay stat.
export function useUfoFrame(asset?: { id: string; traits: UfoTrait[] } | null) {
  const [style, setStyle] = useState<FrameStyle>(() => preference(asset?.id));
  useEffect(() => {
    setStyle(preference(asset?.id));
    const update = (event: Event) => {
      if (event.type === 'storage') { setStyle(preference(asset?.id)); return; }
      const change = (event as CustomEvent<{ id: string; style: FrameStyle }>).detail;
      if (change?.id === asset?.id) setStyle(validFrameStyle(change.style));
    };
    window.addEventListener(eventName, update); window.addEventListener('storage', update);
    return () => { window.removeEventListener(eventName, update); window.removeEventListener('storage', update); };
  }, [asset?.id]);
  const choose = (next: FrameStyle) => {
    if (!asset) return;
    const value = validFrameStyle(next);
    try { localStorage.setItem(keyFor(asset.id), value); } catch { /* Preferences still work for this session. */ }
    setStyle(value);
    window.dispatchEvent(new CustomEvent(eventName, { detail: { id: asset.id, style: value } }));
  };
  return { style, choose, accent: asset ? frameAccent(asset.traits, style) : '#84adb3' };
}
