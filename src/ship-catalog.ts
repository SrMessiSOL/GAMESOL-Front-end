import type { ShipClass } from './fleet-identity';
import smallCargo from './assets/fleet/smallCargo-v1.webp';
import largeCargo from './assets/fleet/gamesol-cargo-v1.webp';
import lightFighter from './assets/fleet/lightFighter-v1.webp';
import heavyFighter from './assets/fleet/heavyFighter-v1.webp';
import cruiser from './assets/fleet/cruiser-v1.webp';
import battleship from './assets/fleet/battleship-v1.webp';
import battlecruiser from './assets/fleet/gamesol-battlecruiser-v1.webp';
import bomber from './assets/fleet/bomber-v1.webp';
import destroyer from './assets/fleet/destroyer-v1.webp';
import deathstar from './assets/fleet/deathstar-v1.webp';
import recycler from './assets/fleet/recycler-v1.webp';
import espionageProbe from './assets/fleet/gamesol-scout-v1.webp';
import colonyShip from './assets/fleet/gamesol-colony-v1.webp';
import solarSatellite from './assets/fleet/solarSatellite-v1.webp';
import hangar from './assets/fleet/orbital-hangar-v1.webp';
import space from './assets/universe-lab/starless-deep-space-v4.webp';

export const SHIP_CATALOG: {key: ShipClass; name: string; role: string; image: string}[] = [
  {key:'smallCargo',name:'Small Cargo',role:'Light logistics',image:smallCargo},
  {key:'largeCargo',name:'Large Cargo',role:'Heavy logistics',image:largeCargo},
  {key:'lightFighter',name:'Light Fighter',role:'Interceptor',image:lightFighter},
  {key:'heavyFighter',name:'Heavy Fighter',role:'Armored fighter',image:heavyFighter},
  {key:'cruiser',name:'Cruiser',role:'Fleet combat',image:cruiser},
  {key:'battleship',name:'Battleship',role:'Heavy combat',image:battleship},
  {key:'battlecruiser',name:'Battlecruiser',role:'Advanced combat',image:battlecruiser},
  {key:'bomber',name:'Bomber',role:'Bombardment',image:bomber},
  {key:'destroyer',name:'Destroyer',role:'Capital combat',image:destroyer},
  {key:'deathstar',name:'Deathstar',role:'Siege fortress',image:deathstar},
  {key:'recycler',name:'Recycler',role:'Salvage vessel',image:recycler},
  {key:'espionageProbe',name:'Espionage Probe',role:'Reconnaissance',image:espionageProbe},
  {key:'colonyShip',name:'Colony Ship',role:'Colonization',image:colonyShip},
  {key:'solarSatellite',name:'Solar Satellite',role:'Orbital energy',image:solarSatellite},
];
export const SHIP_BACKDROPS = { hangar, space };
export const SHIP_ART = new Map(SHIP_CATALOG.map(ship => [ship.key.toLowerCase(), ship.image]));
