import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Package, RefreshCw, Rocket, ShieldCheck, Sparkles, X } from 'lucide-react';
import { PublicKey } from '@solana/web3.js';
import type { GameClient } from './game-state';
import { CommanderAvatarDialog, cryptoUfosRequest, useCryptoUfos } from './CryptoUfos';
import { fetchUfoLoadout, lootName, ufoInstructions, UFO_BOOSTERS, UFO_ROLES, type UfoAttestation, type UfoChainState } from './ufo-onchain';
import './ufo-expeditions.css';

export function useUfoOnchain(game: GameClient | null, commander: string) {
  const [loadout, setLoadout] = useState<UfoChainState | null>(null);
  const [error, setError] = useState('');
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    const expected = ++revision.current;
    if (!game) { setLoadout(null); return; }
    try {
      const state = await fetchUfoLoadout(game.getConnection(),commander);
      if (revision.current === expected) { setLoadout(state); setError(''); }
    } catch (cause) {
      if (revision.current === expected) { setLoadout(null); setError(cause instanceof Error ? cause.message : 'UFO account unavailable.'); }
    }
  }, [game, commander]);
  useEffect(() => { setLoadout(null); void refresh(); return () => { ++revision.current; }; }, [refresh]);
  return { loadout, refresh, error };
}

const scenes = [
  ['A station reactor is failing.', 'A pressure leak blocks the repair crew.', 'The restored station needs a safe restart.'],
  ['An anomaly distorts your stellar charts.', 'A drifting beacon obscures the route.', 'The survey needs a stable reference point.'],
  ['Civilian vessels report a hostile signal.', 'The convoy approaches a debris field.', 'A separated freighter needs escort.'],
  ['An unfamiliar ecosystem awaits sampling.', 'A habitat sensor reports contamination.', 'The samples need safe transport.'],
  ['A relief convoy needs a supply plan.', 'The cargo manifest has a discrepancy.', 'A remote station awaits its delivery.'],
  ['An unknown transmission requests contact.', 'The translation relay is unstable.', 'The visitors await your response.'],
];
const safeActions = [
  ['Stabilize the reactor', 'Seal the pressure leak', 'Run the restart checks'],
  ['Calibrate the scanner', 'Triangulate the beacon', 'Record the reference point'],
  ['Screen the civilian fleet', 'Mark a protected route', 'Escort the freighter'],
  ['Isolate the sample area', 'Decontaminate the sensor', 'Secure the capsules'],
  ['Balance the supply manifest', 'Reconcile the cargo seals', 'Confirm the delivery'],
  ['Decode the greeting', 'Stabilize the relay', 'Transmit a peaceful response'],
];

export function UfoExpeditions({ game, commander, loadout, refresh, readError, busy, run }: {
  game: GameClient | null; commander: string; loadout: UfoChainState | null; refresh: () => Promise<void>; readError: string;
  busy: boolean; run: (label: string, action: (client: GameClient) => Promise<unknown>) => Promise<void>;
}) {
  const nft = useCryptoUfos();
  const available = nft.utilityEnabled;
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [booster, setBooster] = useState(false);
  const [picker, setPicker] = useState(false);
  const [now, setNow] = useState(Math.floor(Date.now()/1000));
  const identity = `${commander}:${nft.link?.owner}:${nft.link?.selectedAsset}`;
  const identityRef = useRef(identity); identityRef.current = identity;
  useEffect(() => { identityRef.current = identity; return () => { identityRef.current = ''; }; }, [identity]);
  const lock = useRef(false);
  const active = loadout && loadout.status !== 0;
  useEffect(() => { setToken(null); setError(''); setBooster(false); }, [identity]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Math.floor(Date.now()/1000)),1000); return () => clearInterval(timer); }, []);
  const guarded = async (operation: () => Promise<void>) => {
    if (lock.current || busy) return;
    lock.current = true; setPending(true); setError('');
    try { await operation(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'UFO command failed.'); }
    finally { lock.current = false; setPending(false); }
  };
  const authorize = () => guarded(async () => {
    const expected = identityRef.current;
    if (!nft.flagship) throw new Error('Choose an owned UFO commander.');
    const value = await nft.verifyUtility(commander,nft.flagship.id);
    if (identityRef.current !== expected) throw new Error('Your commander changed. Retry verification.');
    setToken(value);
  });
  const execute = (action: 'start'|'advance'|'claim'|'equip'|'abort', choice = 0) => guarded(async () => {
    if (!game) throw new Error('Game account is disconnected.');
    const expected = identityRef.current;
    const privileged = ['start','advance','claim'].includes(action);
    if (privileged && !token) throw new Error('Verify the UFO holding wallet first.');
    const proof = privileged ? await cryptoUfosRequest<UfoAttestation>({action:'ufo-attest',utilityToken:token}) : undefined;
    if (identityRef.current !== expected) throw new Error('Your commander changed. No command was sent.');
    const instructions = await ufoInstructions(commander,action,proof,choice,booster);
    if (action === 'start') {
      const start = instructions[instructions.length - 1];
      const rent = await game.buildSponsoredProgramRentInstruction(new PublicKey(commander), [
        { pubkey: start.keys[3].pubkey, space: 211 + 24 * 34 },
        { pubkey: start.keys[4].pubkey, space: 16 },
        { pubkey: start.keys[5].pubkey, space: 16 },
      ]);
      if (rent) instructions.splice(instructions.length - 1,0,rent);
    }
    if (identityRef.current !== expected) throw new Error('Your commander changed. No command was sent.');
    await run(`UFO ${action}`,async client => {
      if (identityRef.current !== expected) throw new Error('Your commander changed. No command was sent.');
      try { const signature = await client.sendUfoInstructions(new PublicKey(commander),instructions); await refresh(); setBooster(false); return signature; }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'UFO command failed.'); throw cause; }
    });
  });
  const remaining = Math.max(0,(loadout?.nextActionAt || 0)-now);
  const cooldown = Math.max(0,(loadout?.lastStarted ? loadout.lastStarted+86400 : 0)-now);
  const sameAsset = !active || (loadout.asset === nft.flagship?.id && loadout.owner === nft.link?.owner);
  const stage = loadout?.stage || 0;
  const doctrine = loadout?.doctrine || 1;
  const choices = ['Force the operation','Ignore the warning','Override the safeguards'];
  if (stage < 3) choices[(doctrine-1+(loadout?.route || 0)+stage)%3] = safeActions[doctrine-1]?.[stage] || 'Survey the site';
  const disabled = pending || busy || available !== true || Boolean(readError);
  return <section className="ufo-expeditions" aria-label="UFO expeditions">
    <header><div><small>FOUNDER EXPEDITIONS · DEVNET</small><h3>UFO mission control</h3></div><button type="button" aria-label="Refresh UFO loadout" title="Refresh UFO loadout" disabled={pending || busy} onClick={() => void guarded(refresh)}><RefreshCw size={18}/></button></header>
    {(error || readError) && <p className="ufo-mission-error" role="alert">{error || readError}</p>}
    {available === null ? <p role="status">Checking on-chain expedition configuration...</p> : !available ? <p className="ufo-mission-status">Program activation pending</p> : <>
      <div className="ufo-mission-identity"><div><b>{nft.flagship?.name || 'No UFO commander selected'}</b><small>{token ? 'Holding wallet verified' : 'Holding wallet verification required'}</small></div><button disabled={disabled} onClick={() => setPicker(true)}><Package size={16}/>Choose commander</button></div>
      {!token && <button className="ufo-mission-primary" disabled={disabled || !nft.flagship || !game} onClick={() => void authorize()}><ShieldCheck size={18}/>{pending ? 'Verifying...' : 'Verify UFO utility'}</button>}
      {active ? <div className="ufo-mission-active"><div className="ufo-mission-meta"><b>{UFO_ROLES[doctrine]} expedition</b><span>Encounter {Math.min(stage+1,3)}/3 · {loadout.mistakes}/3 hazards</span></div>
        {!sameAsset && <p role="alert">This expedition belongs to another UFO. Reselect its commander or abort.</p>}
        {loadout.status === 1 && <><h4>{scenes[doctrine-1]?.[stage] || 'Survey the expedition site.'}</h4><p>{remaining ? `Next encounter in ${remaining}s` : 'Encounter ready'}</p><label className="ufo-booster-toggle"><input type="checkbox" checked={booster && loadout.booster} disabled={disabled || !loadout.booster} onChange={event => setBooster(event.target.checked)}/><Sparkles size={16}/>{UFO_BOOSTERS[doctrine]} · {loadout.booster ? '1 charge' : 'spent'}</label><div className="ufo-encounter-actions">{choices.map((choice,index) => <button key={index} disabled={disabled || !token || !sameAsset || remaining > 0} onClick={() => void execute('advance',index)}>{choice}</button>)}</div></>}
        {loadout.status === 2 && <button className="ufo-mission-primary" disabled={disabled || !token || !sameAsset} onClick={() => void execute('claim')}><Package size={18}/>Claim expedition loot</button>}
        {loadout.status === 3 && <p>Expedition lost to hazards. No loot earned.</p>}
        <button disabled={pending || busy || Boolean(readError)} onClick={() => void execute('abort')}><X size={16}/>Abort expedition</button>
      </div> : <button className="ufo-mission-primary" disabled={disabled || !token || cooldown > 0 || !nft.flagship} onClick={() => void execute('start')}><Rocket size={18}/>{cooldown ? `Available in ${Math.ceil(cooldown/3600)}h` : 'Launch UFO expedition'}</button>}
    </>}
    <div className="ufo-earned-loot"><div><h4>Earned cosmetics</h4><span>{loadout?.completed.toString() || '0'} expeditions completed</span></div>{!loadout?.loot.length ? <p>No loot earned</p> : <ul>{loadout.loot.map((item,index) => <li key={index}><Package size={18}/><b>{lootName(item)}</b><button disabled={pending || busy || Boolean(readError)} aria-pressed={loadout.equipped === index} onClick={() => void execute('equip',loadout.equipped === index ? 255 : index)}>{loadout.equipped === index ? <><Check size={16}/>Equipped</> : 'Equip'}</button></li>)}</ul>}</div>
    {picker && <CommanderAvatarDialog onClose={() => setPicker(false)}/>}
  </section>;
}
