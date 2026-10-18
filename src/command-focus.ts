export function restorePlanetCommandFocus(opener: HTMLElement | null, navigation: HTMLElement | null, command: string) {
  const label: Record<string, string> = {
    building: 'Buildings', buildingSelect: 'Buildings', research: 'Research', ships: 'Shipyard',
    defense: 'Defenses', missions: 'Missions', activity: 'Activity reports', market: 'Market',
    quests: 'Quests', alliance: 'Alliance', store: 'Store',
  };
  const controls = Array.from(navigation?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  const preferred = controls.find(control => control.getAttribute('aria-label')?.startsWith(label[command] ?? command));
  const more = controls.find(control => control.getAttribute('aria-label') === 'More planet operations');
  const target = [opener, preferred, more, ...controls].find(control =>
    control?.isConnected && !control.hasAttribute('disabled') && control.getClientRects().length > 0);
  target?.focus({ preventScroll: true });
}
