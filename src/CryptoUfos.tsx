import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { getWallets } from '@wallet-standard/app';
import { connectHoldingWallet, holdingAccount, type HoldingWallet } from './nft-holding-wallet';
import { Check, ExternalLink, Link2, LoaderCircle, RefreshCw, Rocket, Unlink, Wallet as WalletIcon, X } from 'lucide-react';
import WalletConnectControl from './WalletConnectControl';
import gamesolLogo from './assets/ui/logobg.png';
import './crypto-ufos.css';

export type CryptoUfo = { id: string; name: string; image: string | null; originalImage?: string | null; traits: { name: string; value: string }[]; compressed: boolean };
type LinkState = { owner: string; assets: CryptoUfo[]; selectedAsset: string | null; checkedAt: number; identityVerified: false };
type NftContext = { link: LinkState | null; flagship: CryptoUfo | null; busy: boolean; error: string; stage: string;
  wallets: HoldingWallet[]; connect: (wallet: HoldingWallet) => Promise<boolean>; refresh: () => Promise<void>;
  assign: (id: string | null) => Promise<void>; unlink: () => void; clearError: () => void };
const Context = createContext<NftContext | null>(null);
const COLLECTION = '53UVubjHQpC4RmUnDGU1PV3f2bYFk6GcWb3SgtYFMHTb';
const READER_WALLET = 'gamesol:cryptoufos:reader-wallet:v1';
const selectionKey = (owner: string) => `gamesol:cryptoufos:cosmetic:v1:${owner}`;
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
  const [link, setLink] = useState<LinkState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stage, setStage] = useState('');
  const [wallets, setWallets] = useState<HoldingWallet[]>([]);
  const [holdingWallet, setHoldingWallet] = useState<HoldingWallet | null>(null);
  const linkRef = useRef(link);
  linkRef.current = link;
  const selectedRef = useRef<string | null>(null);
  const walletRef = useRef<HoldingWallet | null>(null);
  const revision = useRef(0);
  const attemptedRestore = useRef(false);

  const readOwner = useCallback(async (owner: string, expected: number, selected = selectedRef.current) => {
    setBusy(true); setError(''); setStage('Reading mainnet Crypto UFOs');
    setLink((value) => value?.owner === owner ? { ...value, assets: [] } : null);
    try {
      const result = await cryptoUfosRequest<{ owner: string; assets: CryptoUfo[]; checkedAt: number; identityVerified: false }>({ action: 'owner-assets', owner });
      if (revision.current !== expected) return false;
      const selectedAsset = result.assets.some((asset) => asset.id === selected) ? selected : null;
      selectedRef.current = selectedAsset;
      savePreference(selectionKey(owner), selectedAsset);
      setLink({ ...result, selectedAsset });
      return true;
    } catch (cause) {
      if (revision.current === expected) {
        setLink(null); selectedRef.current = null;
        setError(cause instanceof Error ? cause.message : 'Unable to read this holding wallet.');
      }
      return false;
    } finally {
      if (revision.current === expected) { setBusy(false); setStage(''); }
    }
  }, []);

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
    attemptedRestore.current = true;
    const expected = ++revision.current;
    walletRef.current = null; setHoldingWallet(null); setLink(null);
    selectedRef.current = null; setBusy(true); setError(''); setStage(`Connect ${wallet.name}`);
    try {
      const account = await connectHoldingWallet(wallet, silent);
      if (revision.current !== expected) return false;
      walletRef.current = wallet; setHoldingWallet(wallet);
      savePreference(READER_WALLET, wallet.name);
      return await readOwner(account.address, expected, savedPreference(selectionKey(account.address)));
    } catch (cause) {
      if (revision.current === expected && !silent) setError(cause instanceof Error ? cause.message : 'Holding wallet connection failed.');
      return false;
    } finally {
      if (revision.current === expected) { setBusy(false); setStage(''); }
    }
  }, [readOwner]);

  useEffect(() => {
    if (attemptedRestore.current || walletRef.current) return;
    const wallet = wallets.find((candidate) => candidate.name === savedPreference(READER_WALLET));
    if (!wallet) return;
    attemptedRestore.current = true;
    void connect(wallet, true);
  }, [wallets, connect]);

  const refresh = useCallback(async () => {
    const wallet = walletRef.current;
    if (!wallet) return;
    const expected = ++revision.current;
    const account = holdingAccount(wallet.accounts);
    if (!account) {
      selectedRef.current = null; setLink(null); setBusy(false); setStage('');
      setError('The NFT holding wallet is disconnected.');
      return;
    }
    await readOwner(account.address, expected, linkRef.current?.owner === account.address ? selectedRef.current : null);
  }, [readOwner]);

  useEffect(() => {
    if (!holdingWallet) return;
    const unsubscribe = holdingWallet.features['standard:events']?.on('change', (changes) => {
      if (changes.accounts === undefined || walletRef.current !== holdingWallet) return;
      const expected = ++revision.current;
      const account = holdingAccount(changes.accounts);
      selectedRef.current = null;
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
  }, [holdingWallet, readOwner, refresh]);

  const assign = useCallback(async (assetId: string | null) => {
    const current = linkRef.current;
    const wallet = walletRef.current;
    if (!current || !wallet) return;
    const account = holdingAccount(wallet.accounts);
    if (!account || account.address !== current.owner) { await refresh(); return; }
    await readOwner(account.address, ++revision.current, assetId);
  }, [readOwner, refresh]);

  const unlink = () => {
    ++revision.current;
    walletRef.current = null; selectedRef.current = null;
    savePreference(READER_WALLET, null);
    setHoldingWallet(null); setLink(null); setError(''); setBusy(false); setStage('');
  };
  const fresh = link && !error && Date.now() - link.checkedAt < 120000;
  const flagship = fresh ? link.assets.find((asset) => asset.id === link.selectedAsset) ?? null : null;
  return <Context.Provider value={{ link, flagship, wallets, busy, error, stage, connect, refresh, assign, unlink, clearError: () => setError('') }}>{children}</Context.Provider>;
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

export function CryptoUfosPanel({ embedded = false, onClose }: { embedded?: boolean; onClose?: () => void }) {
  const nft = useCryptoUfos();
  const { publicKey } = useWallet();
  const [selected, setSelected] = useState<string | null>(null);
  const [walletPicker, setWalletPicker] = useState(false);
  useEffect(() => setSelected(null), [nft.link?.owner]);
  const selectedAsset = nft.link?.assets.find((asset) => asset.id === selected) ?? nft.flagship;
  const assets = nft.link?.assets ?? [];
  return <section className={`nft-panel ${embedded ? 'nft-embedded' : ''}`} aria-label="Crypto UFOs founder hangar">
    <header className="nft-heading"><div><small>GAMESOL ORIGINAL COMMUNITY</small><h1>Crypto UFOs</h1><p>Your collection stays in your wallet. Your UFO joins your game.</p></div>{onClose && <button className="nft-icon-button" title="Close founder hangar" aria-label="Close founder hangar" onClick={onClose}><X size={20} /></button>}</header>
    <div className="nft-layout"><section className="nft-gallery"><div className="nft-section-title"><h2>Your Crypto UFOs</h2><span>MAINNET cNFTs</span><a href="https://www.tensor.trade/trade/cryptoufos" target="_blank" rel="noopener noreferrer" title="View collection on Tensor"><ExternalLink size={16} /></a></div>
      {nft.error && <p className="nft-error" role="alert">{nft.error}</p>}
      {!nft.link && !nft.busy && <div className="nft-empty"><h3>No holding wallet connected</h3><button className="nft-button primary" onClick={() => setWalletPicker(true)}><WalletIcon size={16} /> Connect Solflare or another wallet</button></div>}
      {nft.busy && <p className="nft-loading" role="status"><LoaderCircle size={18} className="nft-spin" /> {nft.stage || 'Checking mainnet ownership...'}</p>}
      {nft.link && !nft.busy && assets.length === 0 && !nft.error && <div className="nft-empty"><h3>No Crypto UFOs in this wallet</h3><p>Switch to the wallet holding your collection.</p><button className="nft-button" onClick={() => setWalletPicker(true)}><WalletIcon size={16} /> Change holding wallet</button></div>}
      <div className="nft-grid">{assets.map((asset) => <button key={asset.id} className={`nft-card ${selectedAsset?.id === asset.id ? 'selected' : ''}`} aria-pressed={selectedAsset?.id === asset.id} disabled={!nft.link || nft.busy} onClick={() => setSelected(asset.id)}><div className="nft-art"><NftImage asset={asset} />{nft.flagship?.id === asset.id && <span className="nft-assigned"><Rocket size={12} /> FLAGSHIP</span>}</div><div className="nft-card-caption"><strong>{asset.name}</strong><span>{shortNftAddress(asset.id)}</span></div></button>)}</div>
      <footer className="nft-collection-address"><span>Collection</span><a href={`https://solscan.io/account/${COLLECTION}`} target="_blank" rel="noopener noreferrer">{shortNftAddress(COLLECTION)} <ExternalLink size={12} /></a></footer>
    </section><aside className="nft-sidebar"><section><h2>Accounts</h2><div className="nft-account"><span>Game account</span><strong>{publicKey ? shortNftAddress(publicKey.toBase58()) : 'Not signed in'}</strong><small>LazorKit &middot; Devnet</small></div><div className="nft-account"><span>NFT holding wallet</span><strong>{nft.link ? shortNftAddress(nft.link.owner) : 'Not connected'}</strong><small>Phantom, Solflare, Jupiter or another Solana wallet &middot; Mainnet</small></div>
      {!publicKey && <WalletConnectControl disconnectedLabel="SIGN IN TO GAMESOL" />}<button className="nft-button primary" disabled={nft.busy} onClick={() => setWalletPicker(true)}><WalletIcon size={16} /> {nft.link ? 'Change holding wallet' : 'Connect holding wallet'}</button>
      {nft.link && <div className="nft-account-actions"><button className="nft-button" disabled={nft.busy} onClick={() => void nft.refresh()}><RefreshCw size={14} /> Refresh ownership</button><button className="nft-icon-button" disabled={nft.busy} title="Disconnect NFT reader" aria-label="Disconnect NFT reader" onClick={nft.unlink}><Unlink size={16} /></button></div>}
      <p className="nft-small">Read-only connection. No signatures or transfers.</p></section>
      <section className="nft-flagship"><h2>Flagship Identity</h2>{selectedAsset ? <><div className="nft-flagship-art"><NftImage asset={selectedAsset} /></div><h3>{selectedAsset.name}</h3><dl className="nft-traits">{selectedAsset.traits.map((trait, index) => <div key={`${trait.name}-${index}`}><dt>{trait.name}</dt><dd>{trait.value}</dd></div>)}</dl><button className="nft-button primary" disabled={nft.busy || nft.flagship?.id === selectedAsset.id} onClick={() => void nft.assign(selectedAsset.id)}>{nft.flagship?.id === selectedAsset.id ? <><Check size={16} /> Assigned</> : <><Rocket size={16} /> Assign to flagship</>}</button>{nft.flagship && <button className="nft-button" disabled={nft.busy} onClick={() => void nft.assign(null)}>Remove identity</button>}</> : <p className="nft-small">No flagship selected.</p>}<p className="nft-small">Cosmetic identity. Combat stats stay unchanged.</p></section>
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
