import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { getWallets } from '@wallet-standard/app';
import { connectHoldingWallet, holdingAccount, type HoldingWallet } from './nft-holding-wallet';
import { Check, ExternalLink, Link2, LoaderCircle, RefreshCw, Rocket, Unlink, Wallet as WalletIcon, X } from 'lucide-react';
import WalletConnectControl from './WalletConnectControl';
import gamesolLogo from './assets/ui/logobg.png';
import './crypto-ufos.css';
import { UfoLoadout } from './UfoLoadout';
import { useUfoFrame } from './ufo-cosmetics';
import type { SolanaSignMessageFeature } from '@solana/wallet-standard-features';
import { Buffer } from 'buffer';
import { nftReaderView, type NftOwnershipStatus } from './nft-reader-state';
import type { GameClient } from './game-state';
import { fetchCommanderIdentity, type CommanderIdentity, type UfoAttestation } from './ufo-onchain';
import { saveCommanderSelection } from './commander-identity';

export type CryptoUfo = { id: string; name: string; image: string | null; originalImage?: string | null; traits: { name: string; value: string }[]; compressed: boolean };
type LinkState = { owner: string; assets: CryptoUfo[]; selectedAsset: string | null; checkedAt: number; identityVerified: false };
type NftContext = { link: LinkState | null; flagship: CryptoUfo | null; busy: boolean; error: string; stage: string;
  gameCommander: string; identityReady: boolean; saving: boolean; holdingConnected: boolean;
  bindGame: (game: GameClient | null, commander: string) => () => void;
  ownershipReady: boolean; ownershipStatus: NftOwnershipStatus; ownershipEpoch: number;
  wallets: HoldingWallet[]; connect: (wallet: HoldingWallet) => Promise<boolean>; refresh: () => Promise<void>;
  assign: (id: string | null) => Promise<void>; unlink: () => void; clearError: () => void;
  verifyUtility: (commander: string, asset: string) => Promise<{utilityToken: string; expiresAt: number}>; utilityEnabled: boolean | null };
const Context = createContext<NftContext | null>(null);
const COLLECTION = '53UVubjHQpC4RmUnDGU1PV3f2bYFk6GcWb3SgtYFMHTb';
const READER_WALLET = 'gamesol:cryptoufos:reader-wallet:v1';
function savedPreference(key: string) { try { return localStorage.getItem(key); } catch { return null; } }
function savePreference(key: string, value: string | null) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* Connection works without browser storage. */ }
}
export const shortNftAddress = (value: string) => `${value.slice(0, 5)}...${value.slice(-5)}`;

export async function cryptoUfosRequest<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/crypto-ufos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let data;
  try { data = await response.json(); } catch { throw new Error('The NFT service is unavailable. Please retry.'); }
  if (!response.ok) throw new Error(data.error || 'Unable to verify Crypto UFOs ownership.');
  return data as T;
}

export function CryptoUfosProvider({ children }: PropsWithChildren) {
  const [binding, setBinding] = useState<{game: GameClient; commander: string} | null>(null);
  const bindingRef = useRef(binding); bindingRef.current = binding;
  const chainRef = useRef<{commander: string; record: CommanderIdentity | null} | null>(null);
  const [identityCommander, setIdentityCommander] = useState('');
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const signOwnershipRef = useRef<((commander: string, asset: string, purpose: 'expedition' | 'commander') => Promise<{utilityToken: string; expiresAt: number}>) | null>(null);
  const bindGame = useCallback((game: GameClient | null, commander: string) => {
    const next = game && commander ? {game, commander} : null;
    setBinding(next);
    return () => { setBinding(current => current === next ? null : current); };
  }, []);
  const [link, setLink] = useState<LinkState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stage, setStage] = useState('');
  const [wallets, setWallets] = useState<HoldingWallet[]>([]);
  const [holdingWallet, setHoldingWallet] = useState<HoldingWallet | null>(null);
  const [utilityEnabled, setUtilityEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    void cryptoUfosRequest<{enabled: boolean}>({action:'ufo-status'}).then(value => { if (!cancelled) setUtilityEnabled(value.enabled); }).catch(() => { if (!cancelled) setUtilityEnabled(false); });
    return () => { cancelled = true; };
  }, []);
  const linkRef = useRef(link);
  linkRef.current = link;
  const selectedRef = useRef<string | null>(null);
  const walletRef = useRef<HoldingWallet | null>(null);
  const revision = useRef(0);
  const verificationRevision = useRef(0);
  const [ownershipEpoch, setOwnershipEpoch] = useState(0);
  const invalidateVerification = useCallback(() => { ++verificationRevision.current; setOwnershipEpoch(value => value + 1); }, []);
  const attemptedRestore = useRef(false);

  const readOwner = useCallback(async (owner: string, expected: number, selected = selectedRef.current) => {
    setBusy(true); setError(''); setStage('Reading mainnet Crypto UFOs');
    setLink((value) => value?.owner === owner ? value : null);
    try {
      const result = await cryptoUfosRequest<{ owner: string; assets: CryptoUfo[]; checkedAt: number; identityVerified: false }>({ action: 'owner-assets', owner });
      if (revision.current !== expected) return false;
      if (result.owner !== owner) throw new Error('The NFT service returned another holding wallet.');
      const selectedAsset = result.assets.some((asset) => asset.id === selected) ? selected : null;
      selectedRef.current = selectedAsset;
      const next = { ...result, selectedAsset };
      linkRef.current = next;
      setLink(next);
      return true;
    } catch (cause) {
      if (revision.current === expected) {
        setLink(value => value?.owner === owner ? value : null);
        setError(cause instanceof Error ? cause.message : 'Unable to read this holding wallet.');
      }
      return false;
    } finally {
      if (revision.current === expected) { setBusy(false); setStage(''); }
    }
  }, []);

  useEffect(() => {
    const expected = ++revision.current;
    invalidateVerification(); chainRef.current = null; setIdentityCommander('');
    selectedRef.current = null; linkRef.current = null; setLink(null);
    if (!binding) return;
    let cancelled = false;
    let readRevision = expected;
    setBusy(true); setStage('Loading saved commander'); setError('');
    void (async () => {
      try {
        if (await binding.game.getConnection().getGenesisHash() !== 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG') throw new Error('Commander saving is currently available on devnet only.');
        const record = await fetchCommanderIdentity(binding.game.getConnection(), binding.commander);
        if (cancelled || bindingRef.current !== binding) return;
        readRevision = ++revision.current;
        chainRef.current = {commander: binding.commander, record}; setIdentityCommander(binding.commander);
        const account = walletRef.current && holdingAccount(walletRef.current.accounts);
        if (account) await readOwner(account.address, readRevision, record?.owner === account.address && record.verifiedAt > 0n ? record.asset : null);
        else if (record && record.verifiedAt > 0n) await readOwner(record.owner, readRevision, record.asset);
        else {
          setBusy(false); setStage('');
        }
      } catch (cause) {
        if (!cancelled && bindingRef.current === binding && revision.current === readRevision) setError(cause instanceof Error ? cause.message : 'Unable to load your saved commander.');
      } finally {
        if (!cancelled && bindingRef.current === binding && revision.current === readRevision) { setBusy(false); setStage(''); }
      }
    })();
    return () => { cancelled = true; };
  }, [binding, readOwner, invalidateVerification]);

  useEffect(() => {
    const registry = getWallets();
    const update = () => setWallets(registry.get().filter((wallet): wallet is HoldingWallet =>
      !/lazor/i.test(wallet.name) && wallet.chains.includes('solana:mainnet')
      && Boolean(wallet.features['standard:connect'])));
    update();
    const unregistered = registry.on('unregister', update);
    const registered = registry.on('register', update);
    return () => { unregistered(); registered(); };
  }, []);

  const connect = useCallback(async (wallet: HoldingWallet, silent = false) => {
    invalidateVerification();
    attemptedRestore.current = true;
    const expected = ++revision.current;
    walletRef.current = null; linkRef.current = null; setHoldingWallet(null); setLink(null);
    selectedRef.current = null; setBusy(true); setError(''); setStage(`Connect ${wallet.name}`);
    try {
      const account = await connectHoldingWallet(wallet, silent);
      if (revision.current !== expected) return false;
      walletRef.current = wallet; setHoldingWallet(wallet);
      savePreference(READER_WALLET, wallet.name);
      const record = chainRef.current?.record;
      return await readOwner(account.address, expected, record?.owner === account.address && record.verifiedAt > 0n ? record.asset : null);
    } catch (cause) {
      if (revision.current === expected && !silent) setError(cause instanceof Error ? cause.message : 'Holding wallet connection failed.');
      return false;
    } finally {
      if (revision.current === expected) { setBusy(false); setStage(''); }
    }
  }, [readOwner, invalidateVerification]);

  useEffect(() => {
    if (attemptedRestore.current || walletRef.current) return;
    const wallet = wallets.find((candidate) => candidate.name === savedPreference(READER_WALLET));
    if (!wallet) return;
    attemptedRestore.current = true;
    void connect(wallet, true);
  }, [wallets, connect]);

  const refresh = useCallback(async () => {
    if (saveLock.current) return;
    const wallet = walletRef.current;
    const expected = ++revision.current;
    const active = bindingRef.current;
    if (active) {
      try {
        const record = await fetchCommanderIdentity(active.game.getConnection(), active.commander);
        if (revision.current !== expected || bindingRef.current !== active) return;
        chainRef.current = {commander: active.commander, record}; setIdentityCommander(active.commander);
        if (!wallet && record && record.verifiedAt > 0n) { await readOwner(record.owner, expected, record.asset); return; }
        if (!wallet) {
          selectedRef.current = null; setLink(value => value ? {...value,selectedAsset:null} : null);
          if (linkRef.current) linkRef.current = {...linkRef.current,selectedAsset:null};
          return;
        }
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load your saved commander.'); return; }
    }
    if (!wallet) return;
    const account = holdingAccount(wallet.accounts);
    if (!account) {
      invalidateVerification(); linkRef.current = null;
      selectedRef.current = null; setLink(null); setBusy(false); setStage('');
      setError('The NFT holding wallet is disconnected.');
      return;
    }
    if (linkRef.current?.owner !== account.address) {
      invalidateVerification(); linkRef.current = null; selectedRef.current = null; setLink(null);
    }
    const record = chainRef.current?.record;
    await readOwner(account.address, expected, record?.owner === account.address && record.verifiedAt > 0n ? record.asset : null);
  }, [readOwner, invalidateVerification]);

  useEffect(() => {
    if (!holdingWallet && !binding) return;
    const unsubscribe = holdingWallet?.features['standard:events']?.on('change', (changes) => {
      if (changes.accounts === undefined || walletRef.current !== holdingWallet) return;
      const account = holdingAccount(changes.accounts);
      if (account?.address === linkRef.current?.owner) { void refresh(); return; }
      invalidateVerification();
      const expected = ++revision.current;
      selectedRef.current = null; linkRef.current = null;
      setLink(null); setError('');
      if (account) void readOwner(account.address, expected, null);
      else {
        walletRef.current = null; setHoldingWallet(null);
        savePreference(READER_WALLET, null);
        setBusy(false); setStage('');
      }
    });
    const check = () => { if (document.visibilityState === 'visible') void refresh(); };
    const interval = window.setInterval(check, 60000);
    window.addEventListener('focus', check);
    return () => { unsubscribe?.(); clearInterval(interval); window.removeEventListener('focus', check); };
  }, [holdingWallet, binding, readOwner, refresh, invalidateVerification]);

  const assign = useCallback(async (assetId: string | null) => {
    if (saveLock.current) return;
    const active = bindingRef.current;
    const current = linkRef.current;
    const wallet = walletRef.current;
    if (!active || chainRef.current?.commander !== active.commander) { setError('Sign in to your game account and load your saved commander first.'); return; }
    const account = wallet && holdingAccount(wallet.accounts);
    if (assetId && (!current || !account || account.address !== current.owner)) { setError('Connect the wallet holding this UFO before saving.'); return; }
    saveLock.current = true; setSaving(true); setError(''); setStage(assetId ? 'Saving commander on-chain' : 'Removing saved commander');
    const expected = ++revision.current;
    const verification = verificationRevision.current;
    const assertCurrent = () => {
      if (bindingRef.current !== active || revision.current !== expected || verificationRevision.current !== verification
        || (assetId && (!wallet || holdingAccount(wallet.accounts)?.address !== account?.address))) throw new Error('Your account changed. Refresh your saved commander before retrying.');
    };
    try {
      const record = await saveCommanderSelection(active.game, active.commander, assetId, async () => {
        if (!signOwnershipRef.current) throw new Error('Ownership verification is not ready.');
        const auth = await signOwnershipRef.current(active.commander, assetId!, 'commander');
        assertCurrent();
        return cryptoUfosRequest<UfoAttestation>({action:'ufo-commander-attest',utilityToken:auth.utilityToken});
      }, assertCurrent);
      assertCurrent(); chainRef.current = {commander: active.commander, record};
      invalidateVerification();
      selectedRef.current = assetId;
      const owner = account?.address ?? record?.owner ?? current?.owner;
      if (owner && assetId) await readOwner(owner, expected, assetId);
      else { setLink(value => value ? {...value, selectedAsset:null} : null); linkRef.current = current ? {...current, selectedAsset:null} : null; }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save your commander.'); }
    finally { saveLock.current = false; setSaving(false); setStage(''); }
  }, [readOwner, invalidateVerification]);

  const unlink = () => {
    invalidateVerification();
    ++revision.current;
    walletRef.current = null;
    savePreference(READER_WALLET, null);
    setHoldingWallet(null); setError(''); setBusy(false); setStage('');
  };
  const { flagship, ownershipReady, ownershipStatus } = nftReaderView(link, busy, error);
  const signOwnership = async (commander: string, asset: string, purpose: 'expedition' | 'commander') => {
    const wallet = walletRef.current; const account = wallet && holdingAccount(wallet.accounts);
    if (!wallet || !account || account.address !== linkRef.current?.owner) throw new Error('Reconnect the UFO holding wallet.');
    if (!ownershipReady || (purpose === 'expedition' && linkRef.current?.selectedAsset !== asset) || !linkRef.current?.assets.some(value => value.id === asset)) throw new Error('Refresh ownership and choose an owned UFO commander.');
    const signer = (wallet.features as Partial<SolanaSignMessageFeature>)['solana:signMessage'];
    if (!signer || !account.features.includes('solana:signMessage')) throw new Error('This holding wallet cannot sign a utility message.');
    const expected = verificationRevision.current;
    const challenge = await cryptoUfosRequest<{challengeToken: string; message: string}>({ action: 'ufo-challenge', commander, owner: account.address, asset, purpose });
    if (verificationRevision.current !== expected) throw new Error('Holding wallet changed. Retry verification.');
    const message = new TextEncoder().encode(challenge.message);
    const [signed] = await signer.signMessage({ account, message });
    if (verificationRevision.current !== expected || holdingAccount(wallet.accounts)?.address !== account.address) throw new Error('Holding wallet changed. Retry verification.');
    if (!signed || !Buffer.from(signed.signedMessage).equals(Buffer.from(message))) throw new Error('Wallet signed a different utility message.');
    const result = await cryptoUfosRequest<{utilityToken: string; expiresAt: number}>({ action: 'ufo-verify', challengeToken: challenge.challengeToken, signature: Buffer.from(signed.signature).toString('base64') });
    if (verificationRevision.current !== expected || holdingAccount(wallet.accounts)?.address !== account.address || (purpose === 'expedition' && linkRef.current?.selectedAsset !== asset)) throw new Error('Holding wallet or commander changed. Retry verification.');
    return result;
  };
  const verifyUtility = (commander: string, asset: string) => signOwnership(commander, asset, 'expedition');
  signOwnershipRef.current = signOwnership;
  return <Context.Provider value={{ link, flagship, ownershipReady, ownershipStatus, ownershipEpoch, wallets, busy: busy || saving, error, stage, connect, refresh, assign, unlink, verifyUtility, utilityEnabled,
    gameCommander: binding?.commander ?? '', identityReady: Boolean(binding && identityCommander === binding.commander), saving, holdingConnected: Boolean(holdingWallet), bindGame,
    clearError: () => setError('') }}>{children}</Context.Provider>;
}

export function useCryptoUfos() {
  const value = useContext(Context);
  if (!value) throw new Error('Crypto UFOs provider is unavailable.');
  return value;
}

function NftImage({ asset }: { asset: CryptoUfo }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useRef<number | undefined>();
  useEffect(() => {
    setFailed(false); setAttempt(0);
    return () => window.clearTimeout(retry.current);
  }, [asset.image]);
  const source = asset.image && attempt > 0 ? `${asset.image}&retry=${attempt}` : asset.image;
  return source && !failed ? <img src={source} alt={asset.name} loading="lazy" referrerPolicy="no-referrer" onError={() => {
    if (attempt < 2) {
      window.clearTimeout(retry.current);
      retry.current = window.setTimeout(() => setAttempt((value) => value + 1), 1500 * (attempt + 1));
    } else setFailed(true);
  }} /> : <span className="nft-image-missing">Artwork unavailable</span>;
}

export function CommanderAvatar({ className = '', fallback = 'CO' }: { className?: string; fallback?: string }) {
  const { flagship, ownershipStatus } = useCryptoUfos();
  const frame = useUfoFrame(flagship);
  return <span className={`commander-avatar ${className}`} data-ownership={ownershipStatus} style={{ '--commander-accent': frame.accent } as React.CSSProperties} title={flagship ? `${flagship.name}${ownershipStatus === 'verified' ? '' : ` (${ownershipStatus})`}` : 'Commander'}>
    {flagship ? <NftImage asset={flagship} /> : <span aria-hidden="true">{fallback}</span>}
  </span>;
}

export function CommanderAvatarDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (ref.current?.querySelector('.nft-wallet-dialog')) return;
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') ?? []);
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', key); previous?.focus(); };
  }, [onClose]);
  return <div ref={ref} role="dialog" aria-modal="true" aria-label="Choose commander avatar" className="nft-commander-dialog"><CryptoUfosPanel embedded onClose={onClose} /></div>;
}

export function CryptoUfosPanel({ embedded = false, onClose }: { embedded?: boolean; onClose?: () => void }) {
  const nft = useCryptoUfos();
  const gameWallet = useWallet();
  const publicKey = nft.gameCommander || gameWallet.publicKey?.toBase58() || '';
  const [selected, setSelected] = useState<string | null>(null);
  const [walletPicker, setWalletPicker] = useState(false);
  useEffect(() => setSelected(null), [nft.link?.owner]);
  const selectedAsset = nft.link?.assets.find((asset) => asset.id === selected) ?? nft.flagship;
  const assets = nft.link?.assets ?? [];
  return <section className={`nft-panel ${embedded ? 'nft-embedded' : ''}`} aria-label="Crypto UFOs commander avatars">
    <header className="nft-heading"><div><small>GAMESOL ORIGINAL COMMUNITY</small><h1>Crypto UFOs</h1><p>Your collection stays in your wallet. Your UFO joins your game.</p></div>{onClose && <button className="nft-icon-button" title="Close commander avatars" aria-label="Close commander avatars" onClick={onClose}><X size={20} /></button>}</header>
    <div className="nft-layout"><section className="nft-gallery"><div className="nft-section-title"><h2>{nft.link && !nft.ownershipReady ? 'Last verified Crypto UFOs' : 'Your Crypto UFOs'}</h2><span>MAINNET cNFTs</span><a href="https://www.tensor.trade/trade/cryptoufos" target="_blank" rel="noopener noreferrer" title="View collection on Tensor"><ExternalLink size={16} /></a></div>
      {nft.error && <p className="nft-error" role="alert">{nft.error}</p>}
      {!nft.link && !nft.busy && <div className="nft-empty"><h3>No holding wallet connected</h3><button className="nft-button primary" onClick={() => setWalletPicker(true)}><WalletIcon size={16} /> Connect Solflare or another wallet</button></div>}
      {nft.busy && <p className="nft-loading" role="status"><LoaderCircle size={18} className="nft-spin" /> {nft.stage || 'Checking mainnet ownership...'}</p>}
      {nft.link && !nft.busy && assets.length === 0 && !nft.error && <div className="nft-empty"><h3>No Crypto UFOs in this wallet</h3><p>Switch to the wallet holding your collection.</p><button className="nft-button" onClick={() => setWalletPicker(true)}><WalletIcon size={16} /> Change holding wallet</button></div>}
      <div className="nft-grid">{assets.map((asset) => <button key={asset.id} className={`nft-card ${selectedAsset?.id === asset.id ? 'selected' : ''}`} aria-pressed={selectedAsset?.id === asset.id} disabled={!nft.link || nft.busy} onClick={() => setSelected(asset.id)}><div className="nft-art"><NftImage asset={asset} />{nft.flagship?.id === asset.id && <span className="nft-assigned"><Rocket size={12} /> COMMANDER</span>}</div><div className="nft-card-caption"><strong>{asset.name}</strong><span>{shortNftAddress(asset.id)}</span></div></button>)}</div>
      <footer className="nft-collection-address"><span>Collection</span><a href={`https://solscan.io/account/${COLLECTION}`} target="_blank" rel="noopener noreferrer">{shortNftAddress(COLLECTION)} <ExternalLink size={12} /></a></footer>
    </section><aside className="nft-sidebar"><section><h2>Accounts</h2><div className="nft-account"><span>Game account</span><strong>{publicKey ? shortNftAddress(publicKey) : 'Not signed in'}</strong><small>LazorKit &middot; Devnet</small></div><div className="nft-account"><span>{nft.holdingConnected ? 'Connected holding wallet' : 'NFT holding wallet'}</span><strong>{nft.link ? shortNftAddress(nft.link.owner) : 'Not connected'}</strong><small>Phantom, Solflare, Jupiter or another Solana wallet &middot; Mainnet</small></div>
      {!publicKey && <WalletConnectControl disconnectedLabel="SIGN IN TO GAMESOL" />}<button className="nft-button primary" disabled={nft.busy} onClick={() => setWalletPicker(true)}><WalletIcon size={16} /> {nft.link ? 'Change holding wallet' : 'Connect holding wallet'}</button>
      {publicKey && !nft.gameCommander && <a className="nft-button" href="/app"><Rocket size={16} /> Open game</a>}
      {nft.link && <div className="nft-account-actions"><button className="nft-button" disabled={nft.busy} onClick={() => void nft.refresh()}><RefreshCw size={14} /> Refresh ownership</button><button className="nft-icon-button" disabled={nft.busy} title="Disconnect NFT reader" aria-label="Disconnect NFT reader" onClick={nft.unlink}><Unlink size={16} /></button></div>}
      <p className="nft-small">Read-only connection. No signatures or transfers.</p></section>
      <section className="nft-flagship"><h2>Commander avatar</h2>{selectedAsset ? <><div className="nft-flagship-art"><NftImage asset={selectedAsset} /></div><h3>{selectedAsset.name}</h3><dl className="nft-traits">{selectedAsset.traits.map((trait, index) => <div key={`${trait.name}-${index}`}><dt>{trait.name}</dt><dd>{trait.value}</dd></div>)}</dl>
        <button className="nft-button primary" disabled={nft.busy || !nft.gameCommander || !nft.identityReady || !nft.holdingConnected || !nft.ownershipReady || nft.flagship?.id === selectedAsset.id} onClick={() => void nft.assign(selectedAsset.id)}>
          {nft.saving ? <><LoaderCircle size={16} className="nft-spin" /> Saving...</> : nft.flagship?.id === selectedAsset.id ? <><Check size={16} /> Saved on-chain</> : <><Rocket size={16} /> Save commander</>}
        </button>
        {nft.flagship && <button className="nft-button" disabled={nft.busy || !nft.identityReady} onClick={() => void nft.assign(null)}>Remove avatar</button>}
        </> : <p className="nft-small">Choose one of your UFOs.</p>}<p className="nft-small">Cosmetic identity. Combat stats stay unchanged.</p></section>
        {selectedAsset && <UfoLoadout asset={selectedAsset} equipped={nft.flagship?.id === selectedAsset.id} utilityEnabled={nft.utilityEnabled === true && nft.ownershipReady} />}
    </aside></div>
    {walletPicker && <div className="nft-wallet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !nft.busy) setWalletPicker(false); }}><WalletPicker onClose={() => setWalletPicker(false)} /></div>}
  </section>;
}

function WalletPicker({ onClose }: { onClose: () => void }) {
  const nft = useCryptoUfos();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !nft.busy) onClose();
      if (event.key !== 'Tab') return;
      const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') ?? []);
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, [nft.busy, onClose]);
  return <div ref={ref} className="nft-wallet-dialog" role="dialog" aria-modal="true" aria-labelledby="nft-wallet-title"><header><h2 id="nft-wallet-title">Connect your NFT holding wallet</h2><button className="nft-icon-button" disabled={nft.busy} onClick={onClose} aria-label="Close wallet picker"><X size={18} /></button></header><p>Your GAMESOL passkey stays connected. Choose the separate wallet holding your mainnet Crypto UFOs.</p>{nft.wallets.map((wallet) => <button className="nft-wallet-option" key={wallet.name} disabled={nft.busy} onClick={() => void nft.connect(wallet).then((linked) => { if (linked) onClose(); })}><img src={wallet.icon} alt="" /><span>{wallet.name}</span><Link2 size={16} /></button>)}{nft.wallets.length === 0 && <div className="nft-empty"><p>No compatible Solana wallets detected in this browser.</p><div className="nft-install-links"><a href="https://phantom.com" target="_blank" rel="noopener noreferrer">Phantom <ExternalLink size={12} /></a><a href="https://solflare.com" target="_blank" rel="noopener noreferrer">Solflare <ExternalLink size={12} /></a><a href="https://jup.ag/mobile" target="_blank" rel="noopener noreferrer">Jupiter <ExternalLink size={12} /></a></div><p>Open the game in your wallet's browser or a browser with its extension.</p></div>}{nft.busy && <p role="status"><LoaderCircle size={16} className="nft-spin" /> {nft.stage}</p>}{nft.error && <p className="nft-error" role="alert">{nft.error}</p>}<small>Read-only access. Your LazorKit game account is unchanged.</small></div>;
}

export default function CryptoUfosPage() {
  return <main className="nft-page"><header className="nft-game-header"><a href="/app"><img src={gamesolLogo} alt="GAMESOL" /><span>GAMESOL</span></a><a href="/app">Return to universe</a></header><CryptoUfosPanel /></main>;
}
