import { useId, useState } from 'react';
import { Boxes, Check, Package, Palette, Sparkles } from 'lucide-react';
import type { CryptoUfo } from './CryptoUfos';
import { frameAccent, ufoProfile, type FrameStyle } from './ufo-traits';
import { useUfoFrame } from './ufo-cosmetics';
import './ufo-loadout.css';

export function UfoLoadout({ asset, equipped = false, utilityEnabled = false }: { asset: Pick<CryptoUfo, 'id' | 'name' | 'traits'>; equipped?: boolean; utilityEnabled?: boolean }) {
  const [tab, setTab] = useState<'cosmetics' | 'boosters' | 'loot'>('cosmetics');
  const id = useId(); const profile = ufoProfile(asset.traits); const frame = useUfoFrame(asset);
  const tabs = [{ key: 'cosmetics', name: 'Cosmetics', Icon: Palette }, { key: 'boosters', name: 'Boosters', Icon: Sparkles }, { key: 'loot', name: 'Loot', Icon: Package }] as const;
  return <section className="ufo-loadout" aria-label={`${asset.name} trait loadout`}>
    <header><div><small>COMMANDER LOADOUT</small><h3>{profile.role}</h3></div><span className="ufo-role-source">{profile.body ?? 'No Body trait'}</span></header>
    <dl className="ufo-route"><div><dt>Expedition route</dt><dd>{profile.route}</dd></div>{profile.eyes && <div><dt>Eyes</dt><dd>{profile.eyes}</dd></div>}</dl>
    <div className="ufo-loadout-tabs" role="tablist" aria-label="Commander loadout views">{tabs.map(({ key, name, Icon }) => <button key={key} id={`${id}-${key}`} role="tab" aria-selected={tab === key} aria-controls={`${id}-panel`} tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)} onKeyDown={(event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const index = tabs.findIndex(item => item.key === key);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      setTab(tabs[next].key); document.getElementById(`${id}-${tabs[next].key}`)?.focus();
    }}><Icon aria-hidden="true" />{name}</button>)}</div>
    <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`} className="ufo-loadout-content">
      {tab === 'cosmetics' && <><div className="ufo-section-label"><strong>Portrait frame</strong><span>Cosmetic</span></div><div className="ufo-frame-options">{([{ key: 'body', label: 'Body frame', source: profile.body }, { key: 'background', label: 'Background frame', source: profile.background }, { key: 'standard', label: 'Standard frame', source: 'GAMESOL' }] as { key: FrameStyle; label: string; source: string | null }[]).map(({ key, label, source }) => <button key={key} aria-label={label} title={`${label}: ${source ?? 'Unavailable'}`} aria-pressed={frame.style === key} disabled={key === 'background' && !profile.backgroundAccent} onClick={() => frame.choose(key)} style={{ backgroundColor: frameAccent(asset.traits, key) }}><span aria-hidden="true">{frame.style === key ? <Check size={18} /> : null}</span></button>)}</div><div className="ufo-frame-caption"><span>{frame.style === 'background' ? profile.background : frame.style === 'body' ? profile.body ?? 'Standard' : 'GAMESOL'}</span><b>{equipped ? 'Equipped frame' : 'Saved frame'}</b></div>{profile.rarity && <div className="ufo-rarity"><span>Collection rarity rank</span><b>{profile.rarity}</b></div>}</>}
      {tab === 'boosters' && <><div className="ufo-section-label"><strong>{utilityEnabled ? 'PvE expedition booster' : 'PvE booster blueprint'}</strong><span>{utilityEnabled ? '1 charge per expedition' : 'Not active'}</span></div>{profile.booster ? <div className="ufo-blueprint"><Sparkles aria-hidden="true" /><div><h4>{profile.booster.name}</h4><p>{profile.booster.objective}</p><small>{profile.body}</small></div></div> : <p className="ufo-neutral">No booster mapping for this Body trait.</p>}<p className="ufo-draft-status">{utilityEnabled ? 'One hazard recovery. No combat, resource or token bonus.' : 'Planned utility: no stat changes or claim available.'}</p></>}
      {tab === 'loot' && <><div className="ufo-section-label"><strong>{utilityEnabled ? 'Expedition cosmetics' : 'Cosmetic loot blueprints'}</strong><span>{utilityEnabled ? 'Mission rewards' : 'Not earned'}</span></div><ul className="ufo-loot-list">{profile.loot.map(item => <li key={item.name}><Package aria-hidden="true" /><div><b>{item.name}</b><small>{item.source}: {item.trait}</small></div></li>)}{profile.accessory && <li><Boxes aria-hidden="true" /><div><b>{profile.accessory} insignia</b><small>Accessory: {profile.accessory}</small></div></li>}{profile.hair && <li><Palette aria-hidden="true" /><div><b>{profile.hair} commander crest</b><small>Hair: {profile.hair}</small></div></li>}</ul>{!profile.loot.length && !profile.accessory && !profile.hair && <p className="ufo-neutral">No mapped loot traits.</p>}<p className="ufo-draft-status">{utilityEnabled ? 'Earned inventory and equipped insignia are recorded on-chain.' : 'Planned rewards: no loot granted or minted.'}</p></>}
    </div>
  </section>;
}
