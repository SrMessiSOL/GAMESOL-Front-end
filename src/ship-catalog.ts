import type { ShipClass } from './fleet-identity';
import smallCargo from './assets/ui/smallCargo.webp';
import largeCargo from './assets/ui/largeCargo.webp';
import lightFighter from './assets/ui/lightFighter.webp';
import heavyFighter from './assets/ui/heavyFighter.webp';
import cruiser from './assets/ui/cruiser.webp';
import battleship from './assets/ui/battleship.webp';
import battlecruiser from './assets/ui/battlecruiser.webp';
import bomber from './assets/ui/bomber.webp';
import destroyer from './assets/ui/destroyer.webp';
import deathstar from './assets/ui/deathStar.webp';
import recycler from './assets/ui/recycler.webp';
import espionageProbe from './assets/ui/espionageProbe.webp';
import colonyShip from './assets/ui/colonyShip.webp';
import solarSatellite from './assets/ui/solarSatellite.webp';
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
