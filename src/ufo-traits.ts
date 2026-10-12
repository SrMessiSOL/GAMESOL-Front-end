export type UfoTrait = { name: string; value: string };
export type FrameStyle = 'body' | 'background' | 'standard';
export const FRAME_STYLES: FrameStyle[] = ['body', 'background', 'standard'];
const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
export function traitValue(traits: readonly UfoTrait[], name: string): string | null {
  const names = name === 'Accessory' ? ['accessory', 'accesory'] : [normalize(name)];
  return traits.find(trait => names.includes(normalize(trait.name)))?.value ?? null;
}

const bodies: Record<string, { role: string; accent: string; booster: string; objective: string; loot: string }> = {
  'silver ufo': { role: 'Engineer', accent: '#c4d5d7', booster: 'Repair kit', objective: 'Recover damaged infrastructure on PvE expeditions.', loot: 'Engineer hull decal' },
  'blue ufo': { role: 'Navigator', accent: '#73c7ee', booster: 'Survey scanner', objective: 'Chart stellar anomalies on PvE expeditions.', loot: 'Stellar chart banner' },
  'red ufo': { role: 'Escort', accent: '#e97d88', booster: 'Convoy beacon', objective: 'Protect civilian convoys from NPC hazards.', loot: 'Escort wing decal' },
  'green ufo': { role: 'Biologist', accent: '#89d89f', booster: 'Sample capsule', objective: 'Catalogue planetary ecosystems on PvE expeditions.', loot: 'Ecosystem expedition badge' },
  'gold ufo': { role: 'Quartermaster', accent: '#e1cf76', booster: 'Supply manifest', objective: 'Coordinate relief deliveries on PvE expeditions.', loot: 'Convoy command banner' },
  'pink ufo': { role: 'Envoy', accent: '#e5a2d0', booster: 'Contact relay', objective: 'Complete first-contact PvE expeditions.', loot: 'First-contact insignia' },
};
const backgrounds: Record<string, string> = { redbg: '#e97d88', blackbg: '#a6b9c0', violetbg: '#c4afe3' };
const routes: Record<string, string> = {
  vr: 'Anomaly analysis', '3d glasses': 'Anomaly analysis', 'nerd glasses': 'Research survey',
  'horned rim glasses': 'Research survey', 'eye patch': 'Salvage', 'classic shades': 'Reconnaissance',
  'regular shades': 'Reconnaissance', 'small sun glasses': 'Reconnaissance', 'violet shades': 'Reconnaissance',
  normal: 'First contact', 'small eyes': 'First contact', o0: 'First contact',
  'clown eyes blue': 'First contact', 'clown eyes green': 'First contact',
};

export function ufoProfile(traits: readonly UfoTrait[]) {
  const body = traitValue(traits, 'Body'); const eyes = traitValue(traits, 'Eyes');
  const background = traitValue(traits, 'Background');
  const role = body ? bodies[normalize(body)] : undefined;
  return {
    body, eyes, background, role: role?.role ?? 'Commander', accent: role?.accent ?? '#84adb3',
    backgroundAccent: background ? backgrounds[normalize(background)] ?? null : null,
    route: eyes ? routes[normalize(eyes)] ?? 'Standard expedition' : 'Standard expedition',
    booster: role ? { name: role.booster, objective: role.objective, status: 'planned' as const } : null,
    loot: role ? [{ name: role.loot, source: 'Body', trait: body! }] : [],
    accessory: traitValue(traits, 'Accessory'), hair: traitValue(traits, 'Hair'),
    mouth: traitValue(traits, 'Mouth'), rarity: traitValue(traits, 'Rarity Rank'),
  };
}

export function frameAccent(traits: readonly UfoTrait[], style: string | null) {
  const profile = ufoProfile(traits);
  if (style === 'standard') return '#84adb3';
  if (style === 'background') return profile.backgroundAccent ?? profile.accent;
  return profile.accent;
}

export function validFrameStyle(value: string | null): FrameStyle {
  return FRAME_STYLES.includes(value as FrameStyle) ? value as FrameStyle : 'body';
}
