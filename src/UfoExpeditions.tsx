import { useCallback, useEffect, useRef, useState } from 'react';
import { Award, Check, Clock3, LoaderCircle, Package, RefreshCw, Rocket, ShieldCheck, Sparkles, UserRound, X } from 'lucide-react';
import { PublicKey } from '@solana/web3.js';
import type { GameClient } from './game-state';
import { CommanderAvatar, CommanderAvatarDialog, cryptoUfosRequest, shortNftAddress, useCryptoUfos } from './CryptoUfos';
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
      if (revision.current === expected) { setError(cause instanceof Error ? cause.message : 'UFO account unavailable.'); }
    }
  }, [game, commander]);
  useEffect(() => { setLoadout(null); setError(''); void refresh(); return () => { ++revision.current; }; }, [refresh]);
  return { loadout: loadout?.commander === commander ? loadout : null, refresh, error };
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
  const [pendingAction, setPendingAction] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const [tokenIdentity, setTokenIdentity] = useState('');
  const [booster, setBooster] = useState(false);
  const [picker, setPicker] = useState(false);
  const [abortReview, setAbortReview] = useState(false);
  const [now, setNow] = useState(Math.floor(Date.now()/1000));
  const identity = `${commander}:${nft.link?.owner}:${nft.link?.selectedAsset}:${nft.ownershipEpoch}`;
  const ownershipReadyRef = useRef(nft.ownershipReady); ownershipReadyRef.current = nft.ownershipReady;
  const identityRef = useRef(identity); identityRef.current = identity;
  useEffect(() => { identityRef.current = identity; return () => { identityRef.current = ''; }; }, [identity]);
  const lock = useRef(false);
  const active = loadout && loadout.status !== 0;
  useEffect(() => { setToken(null); setExpiresAt(0); setTokenIdentity(''); setError(''); setBooster(false); setAbortReview(false); }, [identity]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Math.floor(Date.now()/1000)),1000); return () => clearInterval(timer); }, []);
  const tokenReady = Boolean(token && tokenIdentity === identity && expiresAt > now * 1000);
  useEffect(() => { if (token && !tokenReady) { setToken(null); setExpiresAt(0); } }, [token, tokenReady]);
  const previousCompleted = useRef<bigint | null>(null);
  const [rewardNotice, setRewardNotice] = useState(false);
  useEffect(() => { previousCompleted.current = null; setRewardNotice(false); }, [commander]);
  useEffect(() => {
    if (!loadout) return;
    if (previousCompleted.current !== null && loadout.completed > previousCompleted.current) setRewardNotice(true);
    previousCompleted.current = loadout.completed;
  }, [loadout?.completed]);
  useEffect(() => { if (!rewardNotice) return; const timer = window.setTimeout(() => setRewardNotice(false), 6000); return () => clearTimeout(timer); }, [rewardNotice]);
  const guarded = async (operation: () => Promise<void>, action = 'refresh') => {
    if (lock.current || busy) return;
    lock.current = true; setPending(true); setPendingAction(action); setError('');
    try { await operation(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'UFO command failed.'); }
    finally { lock.current = false; setPending(false); setPendingAction(''); }
  };
  const authorize = () => guarded(async () => {
    const expected = identityRef.current;
    if (!nft.flagship || !ownershipReadyRef.current) throw new Error('Refresh ownership and choose an owned UFO commander.');
    const value = await nft.verifyUtility(commander,nft.flagship.id);
    if (identityRef.current !== expected) throw new Error('Your commander changed. Retry verification.');
    if (!Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now()) throw new Error('UFO verification expired. Please verify again.');
    setToken(value.utilityToken); setExpiresAt(value.expiresAt); setTokenIdentity(expected);
  }, 'verify');
  const execute = (action: 'start'|'advance'|'claim'|'equip'|'abort', choice = 0) => guarded(async () => {
    if (!game) throw new Error('Game account is disconnected.');
    const expected = identityRef.current;
    const privileged = ['start','advance','claim'].includes(action);
    if (privileged && (!tokenReady || !ownershipReadyRef.current)) throw new Error('Verify current UFO ownership first.');
    let proof: UfoAttestation | undefined;
    try { if (privileged) proof = await cryptoUfosRequest<UfoAttestation>({action:'ufo-attest',utilityToken:token}); }
    catch (cause) {
      if (/expired|no longer owned/i.test(cause instanceof Error ? cause.message : String(cause))) { setToken(null); setExpiresAt(0); }
      if (/no longer owned/i.test(cause instanceof Error ? cause.message : String(cause))) void nft.refresh();
      throw cause;
    }
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
      if (privileged && (!ownershipReadyRef.current || Date.now() >= expiresAt)) throw new Error('Ownership verification changed or expired. No command was sent.');
      try { const signature = await client.sendUfoInstructions(new PublicKey(commander),instructions); await refresh(); setBooster(false); return signature; }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'UFO command failed.'); throw cause; }
    });
  }, action);
  const remaining = Math.max(0,(loadout?.nextActionAt || 0)-now);
  const cooldown = Math.max(0,(loadout?.lastStarted ? loadout.lastStarted+86400 : 0)-now);
  useEffect(() => {
    if (game && available === true && nft.ownershipReady && nft.flagship && !tokenReady && (active || cooldown === 0)) void authorize();
  }, [game, available, identity, nft.ownershipReady, tokenReady, Boolean(active), cooldown === 0]);
  const sameAsset = !active || (loadout.asset === nft.flagship?.id && loadout.owner === nft.link?.owner);
  const stage = loadout?.stage || 0;
  const doctrine = loadout?.doctrine || 1;
  const choices = ['Force the operation','Ignore the warning','Override the safeguards'];
  if (stage < 3) choices[(doctrine-1+(loadout?.route || 0)+stage)%3] = safeActions[doctrine-1]?.[stage] || 'Survey the site';
  const disabled = pending || busy || available !== true || Boolean(readError);
  const utilityDisabled = disabled || !nft.ownershipReady;
  const ownershipLabel = nft.ownershipStatus === 'checking' ? 'Checking ownership'
    : !nft.ownershipReady ? 'Ownership check required' : tokenReady ? 'Utility verified'
      : 'Checking saved commander';
  const cooldownMinutes = Math.ceil(cooldown/60);
  const cooldownLabel = `${Math.floor(cooldownMinutes/60)}h ${cooldownMinutes%60}m`;
  return <section className="ufo-expeditions" aria-label="UFO expeditions">
    <header><div><h3>UFO expeditions</h3></div><button className="ufo-icon-button" type="button" aria-label="Refresh UFO loadout" title="Refresh UFO loadout" disabled={pending || busy} onClick={() => void guarded(async () => { await Promise.all([refresh(), nft.refresh()]); })}><RefreshCw size={18} className={pendingAction === 'refresh' ? 'ufo-spin' : ''}/></button></header>
    {(error || readError) && <p className="ufo-mission-error" role="alert">{error || readError}</p>}
    {available === null ? <p role="status">Checking on-chain expedition configuration...</p> : !available ? <p className="ufo-mission-status">Program activation pending</p> : <>
      <div className="ufo-mission-identity"><CommanderAvatar className="ufo-commander-portrait"/><div className="ufo-identity-copy"><b>{nft.flagship?.name || 'Choose a UFO commander'}</b><small className={`ufo-ownership-status ${nft.ownershipStatus}`}><span aria-hidden="true"/>{ownershipLabel}</small>{nft.link?.owner && <small>{shortNftAddress(nft.link.owner)}</small>}</div><button className="ufo-change-commander" disabled={disabled || nft.busy} onClick={() => setPicker(true)}><UserRound size={16}/>Change commander</button></div>
      {!tokenReady && (active || cooldown === 0) && <button className="ufo-mission-primary" disabled={utilityDisabled || !nft.flagship || !game} onClick={() => void authorize()}>{pendingAction === 'verify' ? <LoaderCircle size={18} className="ufo-spin"/> : <ShieldCheck size={18}/>} {pendingAction === 'verify' ? 'Checking ownership...' : 'Check ownership'}</button>}
      {nft.error && <p className="ufo-mission-error" role="alert">{nft.error}</p>}
      {active ? <div className="ufo-mission-active"><div className="ufo-mission-meta"><b>{UFO_ROLES[doctrine]} expedition</b><span>Encounter {Math.min(stage+1,3)}/3 · {loadout.mistakes}/3 hazards</span></div>
        <ol className="ufo-mission-progress" aria-label="Expedition progress">{[0,1,2].map(step => <li key={step} className={step < stage ? 'complete' : step === stage ? 'current' : ''} aria-current={step === stage ? 'step' : undefined}><span>{step < stage ? <Check size={14}/> : step+1}</span><b>Encounter {step+1}</b></li>)}</ol>
        {!sameAsset && <p role="alert">This expedition belongs to another UFO. Reselect its commander or abort.</p>}
        {loadout.status === 1 && <><div className="ufo-encounter-heading"><h4>{scenes[doctrine-1]?.[stage] || 'Survey the expedition site.'}</h4><span className="ufo-encounter-clock" role="status"><Clock3 size={14}/>{remaining ? `${remaining}s` : 'Ready'}</span></div><label className={`ufo-booster-toggle${booster && loadout.booster ? ' armed' : ''}${!loadout.booster ? ' spent' : ''}`}><input aria-label={`Use ${UFO_BOOSTERS[doctrine]}`} type="checkbox" checked={booster && loadout.booster} disabled={utilityDisabled || !loadout.booster} onChange={event => setBooster(event.target.checked)}/><Sparkles size={18}/><b>{UFO_BOOSTERS[doctrine]}</b><span>{!loadout.booster ? 'Spent' : booster ? 'Armed' : '1 charge'}</span></label><div className="ufo-encounter-actions">{choices.map((choice,index) => <button key={index} disabled={utilityDisabled || !tokenReady || !sameAsset || remaining > 0} onClick={() => void execute('advance',index)}>{choice}</button>)}</div></>}
        {loadout.status === 2 && <button className="ufo-mission-primary" disabled={utilityDisabled || !tokenReady || !sameAsset} onClick={() => void execute('claim')}><Package size={18}/>{pendingAction === 'claim' ? 'Claiming...' : 'Claim expedition loot'}</button>}
        {loadout.status === 3 && <p>Expedition lost to hazards. No loot earned.</p>}
        {abortReview ? <div className="ufo-abort-review" role="group" aria-label="Abort expedition confirmation"><span>Unclaimed loot will be lost.</span><button disabled={pending || busy} onClick={() => setAbortReview(false)}>Keep expedition</button><button className="ufo-abort-confirm" disabled={pending || busy || Boolean(readError)} onClick={() => void execute('abort')}><X size={16}/>Abandon expedition</button></div> : <button className="ufo-abort" disabled={pending || busy || Boolean(readError)} onClick={() => setAbortReview(true)}><X size={16}/>Abort expedition</button>}
      </div> : cooldown ? <div className="ufo-cooldown" role="status"><Clock3 size={18}/><span>Next expedition</span><b>{cooldownLabel}</b></div> : <button className="ufo-mission-primary" disabled={utilityDisabled || !tokenReady || !nft.flagship || !game} onClick={() => void execute('start')}><Rocket size={18}/>{pendingAction === 'start' ? 'Launching...' : 'Launch UFO expedition'}</button>}
    </>}
    <div className="ufo-earned-loot"><div><h4>Recovered loot</h4><span>{loadout?.completed.toString() || '0'} completed</span></div>{rewardNotice && <p className="ufo-reward-notice" role="status"><Award size={18}/>Expedition complete</p>}{!loadout?.loot.length ? <div className="ufo-loot-empty"><Package size={22}/><span>No loot recovered</span></div> : <ul>{loadout.loot.map((item,index) => <li key={index}><Award size={20}/><div><b>{lootName(item)}</b><small>Commander cosmetic</small></div><button disabled={pending || busy || Boolean(readError)} aria-pressed={loadout.equipped === index} onClick={() => void execute('equip',loadout.equipped === index ? 255 : index)}>{loadout.equipped === index ? <><Check size={16}/>Equipped</> : <><Award size={16}/>Equip</>}</button></li>)}</ul>}</div>
    {picker && <CommanderAvatarDialog onClose={() => setPicker(false)}/>}
  </section>;
}
