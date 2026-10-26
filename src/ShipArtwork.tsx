import { SHIP_ART, SHIP_BACKDROPS } from './ship-catalog';
import './ship-artwork.css';

export default function ShipArtwork({ shipKey, className = '', scene = 'hangar', label = '' }: { shipKey: string; className?: string; scene?: 'hangar' | 'space'; label?: string }) {
  const image = SHIP_ART.get(shipKey.toLowerCase());
  return <div className={`ship-art-stage ${className}`} data-scene={scene} style={{backgroundImage:`url("${SHIP_BACKDROPS[scene]}")`}}>
    {image && <img src={image} alt={label} loading="lazy" decoding="async" width={1536} height={1024} />}
  </div>;
}
