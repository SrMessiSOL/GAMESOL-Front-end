export const SHIP_CLASSES = ['smallCargo','largeCargo','lightFighter','heavyFighter','cruiser','battleship','battlecruiser','bomber','destroyer','deathstar','recycler','espionageProbe','colonyShip','solarSatellite'] as const;
export type ShipClass = typeof SHIP_CLASSES[number];
const travelPriority: ShipClass[] = ['deathstar','destroyer','battleship','battlecruiser','bomber','cruiser','heavyFighter','lightFighter','colonyShip','largeCargo','smallCargo','recycler','espionageProbe'];
export function missionShipClass(mission: object, kind: string): ShipClass | undefined {
  const counts = mission as Record<string, unknown>;
  const present = (key: ShipClass) => {
    const value = counts[`s${key[0].toUpperCase()}${key.slice(1)}`];
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
  };
  if (kind === 'colonize' && present('colonyShip')) return 'colonyShip';
  if (kind === 'espionage' && present('espionageProbe')) return 'espionageProbe';
  return travelPriority.find(present);
}
