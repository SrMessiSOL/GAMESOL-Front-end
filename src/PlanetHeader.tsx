import { ChevronLeft, FlaskConical, Gem, Pickaxe, Zap } from 'lucide-react';
import { GameIconButton } from './design-system/game-ui';

type Quantity = number | bigint;
type PlanetResources = { metal: Quantity; crystal: Quantity; deuterium: Quantity; energyProduction: Quantity; energyConsumption: Quantity };
const compact = (value: Quantity) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

export function PlanetHeader({ world, resources, energyPercent, energyTone, onExit }: {
  world: { name: string; galaxy: number; system: number; position: number };
  resources: PlanetResources; energyPercent: number; energyTone: string; onExit: () => void;
}) {
  return <header className="pw-top">
    <GameIconButton className="pw-system-back" label="Return to active planet system" onClick={onExit}><ChevronLeft aria-hidden="true" /></GameIconButton>
    <div className="pw-world-identity"><span>COMMAND WORLD</span><strong title={world.name}>{world.name}</strong><small>{world.galaxy}:{world.system}:{world.position}</small></div>
    <div className="pw-resources" aria-label="Planet resources">
      {([{ key: 'metal', label: 'Metal', Icon: Pickaxe }, { key: 'crystal', label: 'Crystal', Icon: Gem }, { key: 'deuterium', label: 'Deuterium', Icon: FlaskConical }] as const).map(({ key, label, Icon }) => <b key={key} className={key} aria-label={`${label} ${resources[key].toLocaleString()}`} title={`${label}: ${resources[key].toLocaleString()}`}>
        <Icon aria-hidden="true" /><span>{label}</span><strong className="pw-resource-exact">{resources[key].toLocaleString()}</strong><strong className="pw-resource-compact">{compact(resources[key])}</strong>
      </b>)}
      <b className={`energy ${energyTone}`} aria-label={`Energy ${resources.energyProduction} produced, ${resources.energyConsumption} consumed, ${energyPercent} percent available`} title={`Energy: ${resources.energyProduction} / ${resources.energyConsumption}, ${energyPercent}%`}><Zap aria-hidden="true" /><span>Energy</span><strong className="pw-resource-exact">{resources.energyProduction.toLocaleString()} / {resources.energyConsumption.toLocaleString()}</strong><strong className="pw-resource-compact">{compact(resources.energyProduction)} / {compact(resources.energyConsumption)}</strong><em>{energyPercent}%</em></b>
    </div>
  </header>;
}
