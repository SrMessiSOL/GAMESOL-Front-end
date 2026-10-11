import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { useWallet as useLazorWallet, DialogManager } from '@lazorkit/wallet';
import { useWallet } from '@solana/wallet-adapter-react';
import { getWallets } from '@wallet-standard/app';
import type { Wallet } from '@wallet-standard/base';
import type { StandardConnectFeature } from '@wallet-standard/features';
import type { SolanaSignMessageFeature } from '@solana/wallet-standard-features';
import { Buffer } from 'buffer';
import { Check, ExternalLink, Link2, LoaderCircle, RefreshCw, Rocket, Unlink, Wallet as WalletIcon, X } from 'lucide-react';
import WalletConnectControl from './WalletConnectControl';
import gamesolLogo from './assets/ui/logobg.png';
import './crypto-ufos.css';

export type CryptoUfo = { id: string; name: string; image: string | null; originalImage?: string | null; traits: { name: string; value: string }[]; compressed: boolean };
type HoldingWallet = Wallet & { features: StandardConnectFeature & SolanaSignMessageFeature };
type LinkState = { linkToken: string; owner: string; commander: string; assets: CryptoUfo[]; selectedAsset: string | null; checkedAt: number; expires: number };
type NftContext = { link: LinkState | null; flagship: CryptoUfo | null; busy: boolean; error: string; stage: string;
  wallets: HoldingWallet[]; connect: (wallet: HoldingWallet) => Promise<boolean>; refresh: () => Promise<void>;
  assign: (id: string | null) => Promise<void>; unlink: () => void; clearError: () => void };
const Context = createContext<NftContext | null>(null);
const COLLECTION = '53UVubjHQpC4RmUnDGU1PV3f2bYFk6GcWb3SgtYFMHTb';
const storageKey = (commander: string) => `gamesol:cryptoufos:link:v1:${commander}`;
export const shortNftAddress = (value: string) => `${value.slice(0, 5)}...${value.slice(-5)}`;

export async function cryptoUfosRequest<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/crypto-ufos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let data;
  try { data = await response.json(); } catch { throw new Error('The NFT service is unavailable. Please retry.'); }
  if (!response.ok) throw new Error(data.error || 'Unable to verify Crypto UFOs ownership.');
  return data as T;
}

export function CryptoUfosProvider({ children }: PropsWithChildren) {
  const lazor = useLazorWallet();
  const { publicKey } = useWallet();
  const commander = publicKey?.toBase58() ?? null;
  const commanderRef = useRef(commander);
  commanderRef.current = commander;
  const [link, setLink] = useState<LinkState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stage, setStage] = useState('');
  const [wallets, setWallets] = useState<HoldingWallet[]>([]);
  const linkRef = useRef(link);
  linkRef.current = link;
  const active = useRef(false);

  const accept = useCallback((value: LinkState, expected: string) => {
    if (commanderRef.current !== expected || value.commander !== expected) return;
    localStorage.setItem(storageKey(expected), value.linkToken);
    setLink(value);
  }, []);

  useEffect(() => {
    const registry = getWallets();
    const update = () => setWallets(registry.get().filter((wallet): wallet is HoldingWallet =>
      !/lazor/i.test(wallet.name) && wallet.chains.includes('solana:mainnet')
      && Boolean(wallet.features['standard:connect']) && Boolean(wallet.features['solana:signMessage'])));
    update();
    const unregistered = registry.on('unregister', update);
    const registered = registry.on('register', update);
    return () => { unregistered(); registered(); };
  }, []);

  useEffect(() => {
    setLink(null); setError('');
    if (!commander) return;
    const token = localStorage.getItem(storageKey(commander));
    if (!token) return;
    let canceled = false;
    void cryptoUfosRequest<LinkState>({ action: 'assets', commander, linkToken: token }).then((value) => {
      if (!canceled && !active.current && !linkRef.current) accept(value, commander);
    }).catch((cause) => { if (!canceled && !active.current && !linkRef.current) setError(cause instanceof Error ? cause.message : 'Unable to restore your NFT wallet link.'); });
    return () => { canceled = true; };
  }, [commander, accept]);

  const refresh = useCallback(async () => {
    const current = linkRef.current;
    if (!current || active.current) return;
    active.current = true; setBusy(true); setError('');
    // Remove stale identity while fresh ownership is checked; errors never preserve holder eligibility.
    setLink((value) => value ? { ...value, assets: [] } : null);
    try { accept(await cryptoUfosRequest<LinkState>({ action: 'assets', commander: current.commander, linkToken: current.linkToken }), current.commander); }
    catch (cause) { if (commanderRef.current === current.commander) setError(cause instanceof Error ? cause.message : 'NFT ownership verification failed.'); }
    finally { active.current = false; setBusy(false); }
  }, [accept]);

  useEffect(() => {
    if (!link || !commander) return;
    const check = () => { if (document.visibilityState === 'visible') void refresh(); };
    const interval = window.setInterval(check, 60000);
    window.addEventListener('focus', check);
    return () => { clearInterval(interval); window.removeEventListener('focus', check); };
  }, [Boolean(link), commander, refresh]);

  const connect = useCallback(async (holdingWallet: HoldingWallet) => {
    if (!lazor.wallet || !commander) { setError('Sign into GAMESOL with your passkey first.'); return false; }
    if (active.current) return false;
    const gameWallet = lazor.wallet;
    active.current = true; setBusy(true); setError('');
    try {
      setStage(`Connect ${holdingWallet.name}`);
      const { accounts } = await holdingWallet.features['standard:connect'].connect();
      const account = accounts.find((candidate) => candidate.chains.includes('solana:mainnet') && candidate.features.includes('solana:signMessage'));
      if (!account) throw new Error('Choose a mainnet Solana account that supports message signing.');
      if (account.address === commander) throw new Error('Choose the separate wallet holding your mainnet Crypto UFOs.');
      const challenge = await cryptoUfosRequest<{ challengeToken: string; message: string; passkeyChallenge: string }>({
        action: 'challenge', commander, smartWallet: gameWallet.smartWallet, owner: account.address,
      });
      setStage(`Approve the linking message in ${holdingWallet.name}`);
      const message = new TextEncoder().encode(challenge.message);
      const [signed] = await holdingWallet.features['solana:signMessage'].signMessage({ account, message });
      if (!signed || !Buffer.from(signed.signedMessage).equals(Buffer.from(message))) throw new Error('The wallet changed the linking message. Please use a wallet supporting exact Solana message signatures.');
      if (commanderRef.current !== commander) throw new Error('Your game account changed. Start the wallet link again.');
      setStage('Approve the same link with your GAMESOL passkey');
      const dialog = new DialogManager({ portalUrl: import.meta.env.VITE_LAZORKIT_PORTAL_URL || 'https://portal.lazor.sh' });
      let passkeyProof;
      try { passkeyProof = await dialog.openSignMessage(challenge.passkeyChallenge, gameWallet.credentialId); }
      finally { dialog.destroy(); }
      setStage('Verify mainnet Crypto UFOs ownership');
      const result = await cryptoUfosRequest<LinkState>({ action: 'link', challengeToken: challenge.challengeToken,
        holdingSignature: Buffer.from(signed.signature).toString('base64'), credentialId: gameWallet.credentialId, passkeyProof });
      accept(result, commander);
      return commanderRef.current === commander;
    } catch (cause) { if (commanderRef.current === commander) setError(cause instanceof Error ? cause.message : 'Wallet linking failed.'); return false; }
    finally { active.current = false; setBusy(false); setStage(''); }
  }, [lazor.wallet, commander, accept]);

  const assign = useCallback(async (assetId: string | null) => {
    const current = linkRef.current;
    if (!current || active.current) return;
    active.current = true; setBusy(true); setError('');
    try { accept(await cryptoUfosRequest<LinkState>({ action: 'assign', commander: current.commander, linkToken: current.linkToken, assetId }), current.commander); }
    catch (cause) { if (commanderRef.current === current.commander) { setLink((value) => value ? { ...value, assets: [], selectedAsset: null } : null); setError(cause instanceof Error ? cause.message : 'Flagship selection failed.'); } }
    finally { active.current = false; setBusy(false); }
  }, [accept]);

  const unlink = () => {
    if (active.current) return;
    if (commander) localStorage.removeItem(storageKey(commander));
    setLink(null); setError('');
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
  const [original, setOriginal] = useState(false);
  useEffect(() => { setFailed(false); setOriginal(false); }, [asset.image]);
  const source = original ? asset.originalImage : asset.image;
  return source && !failed ? <img src={source} alt={asset.name} loading="lazy" referrerPolicy="no-referrer" onError={() => {
    if (!original && asset.originalImage && asset.originalImage !== asset.image) setOriginal(true);
    else setFailed(true);
  }} /> : <span className="nft-image-missing">Artwork unavailable</span>;
}

export function CryptoUfosPanel({ embedded = false, onClose }: { embedded?: boolean; onClose?: () => void }) {
  const nft = useCryptoUfos();
  const { publicKey } = useWallet();
  const [selected, setSelected] = useState<string | null>(null);
  const [walletPicker, setWalletPicker] = useState(false);
  const [collection, setCollection] = useState<CryptoUfo[]>([]);
  const [collectionBusy, setCollectionBusy] = useState(false);
  const [collectionError, setCollectionError] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  useEffect(() => setWalletPicker(false), [nft.link?.linkToken]);
  const selectedAsset = nft.link?.assets.find((asset) => asset.id === selected) ?? nft.flagship;
  useEffect(() => {
    if (nft.link) return;
    let canceled = false;
    setCollectionBusy(true); setCollectionError('');
    void cryptoUfosRequest<{ assets: CryptoUfo[]; hasMore: boolean }>({ action: 'collection', page }).then((result) => {
      if (!canceled) { setCollection(result.assets); setHasMore(result.hasMore); }
    }).catch((cause) => { if (!canceled) setCollectionError(cause instanceof Error ? cause.message : 'Unable to load the collection.'); })
      .finally(() => { if (!canceled) setCollectionBusy(false); });
    return () => { canceled = true; };
  }, [page, Boolean(nft.link)]);
  const assets = nft.link ? nft.link.assets : collection;
  return <section className={`nft-panel ${embedded ? 'nft-embedded' : ''}`} aria-label="Crypto UFOs founder hangar">
    <header className="nft-heading"><div><small>GAMESOL ORIGINAL COMMUNITY</small><h1>Crypto UFOs</h1><p>Your collection stays in your wallet. Your UFO joins your game.</p></div>{onClose && <button className="nft-icon-button" title="Close founder hangar" aria-label="Close founder hangar" onClick={onClose}><X size={20} /></button>}</header>
    <div className="nft-layout"><section className="nft-gallery"><div className="nft-section-title"><h2>{nft.link ? 'Your Crypto UFOs' : 'The collection'}</h2><span>MAINNET cNFTs</span><a href="https://www.tensor.trade/trade/cryptoufos" target="_blank" rel="noopener noreferrer" title="View collection on Tensor"><ExternalLink size={16} /></a></div>
      {(nft.error || collectionError) && <p className="nft-error" role="alert">{nft.error || collectionError}</p>}
      {collectionBusy && !nft.link && <p className="nft-loading"><LoaderCircle size={18} className="nft-spin" /> Loading real collection artwork...</p>}
      {nft.busy && <p className="nft-loading" role="status"><LoaderCircle size={18} className="nft-spin" /> {nft.stage || 'Checking mainnet ownership...'}</p>}
      {nft.link && !nft.busy && assets.length === 0 && !nft.error && <div className="nft-empty"><h3>No Crypto UFOs in this wallet</h3><p>Switch to the wallet holding your collection.</p><button className="nft-button" onClick={() => setWalletPicker(true)}><WalletIcon size={16} /> Change holding wallet</button></div>}
      <div className="nft-grid">{assets.map((asset) => <button key={asset.id} className={`nft-card ${selectedAsset?.id === asset.id ? 'selected' : ''}`} aria-pressed={selectedAsset?.id === asset.id} disabled={!nft.link || nft.busy} onClick={() => setSelected(asset.id)}><div className="nft-art"><NftImage asset={asset} />{nft.flagship?.id === asset.id && <span className="nft-assigned"><Rocket size={12} /> FLAGSHIP</span>}</div><div className="nft-card-caption"><strong>{asset.name}</strong><span>{shortNftAddress(asset.id)}</span></div></button>)}</div>
      {!nft.link && !collectionBusy && !collectionError && <div className="nft-pagination"><button className="nft-button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page}</span><button className="nft-button" disabled={!hasMore} onClick={() => setPage((value) => value + 1)}>Next</button></div>}
      <footer className="nft-collection-address"><span>Collection</span><a href={`https://solscan.io/account/${COLLECTION}`} target="_blank" rel="noopener noreferrer">{shortNftAddress(COLLECTION)} <ExternalLink size={12} /></a></footer>
    </section><aside className="nft-sidebar"><section><h2>Linked Accounts</h2><div className="nft-account"><span>Game account</span><strong>{publicKey ? shortNftAddress(publicKey.toBase58()) : 'Not signed in'}</strong><small>LazorKit &middot; Devnet</small></div><div className="nft-account"><span>NFT holding wallet</span><strong>{nft.link ? shortNftAddress(nft.link.owner) : 'Not linked'}</strong><small>Phantom, Solflare, Jupiter or another Solana wallet &middot; Mainnet</small></div>
      {!publicKey ? <WalletConnectControl disconnectedLabel="SIGN IN TO GAMESOL" /> : <button className="nft-button primary" disabled={nft.busy} onClick={() => setWalletPicker(true)}><Link2 size={16} /> {nft.link ? 'Change holding wallet' : 'Link holding wallet'}</button>}
      {nft.link && <div className="nft-account-actions"><button className="nft-button" disabled={nft.busy} onClick={() => void nft.refresh()}><RefreshCw size={14} /> Refresh ownership</button><button className="nft-icon-button" disabled={nft.busy} title="Unlink holding wallet on this device" aria-label="Unlink holding wallet on this device" onClick={nft.unlink}><Unlink size={16} /></button></div>}
      <p className="nft-small">Linking requests message signatures only. No NFT transfers or deposits.</p></section>
      <section className="nft-flagship"><h2>Flagship Identity</h2>{selectedAsset ? <><div className="nft-flagship-art"><NftImage asset={selectedAsset} /></div><h3>{selectedAsset.name}</h3><dl className="nft-traits">{selectedAsset.traits.map((trait, index) => <div key={`${trait.name}-${index}`}><dt>{trait.name}</dt><dd>{trait.value}</dd></div>)}</dl><button className="nft-button primary" disabled={nft.busy || nft.flagship?.id === selectedAsset.id} onClick={() => void nft.assign(selectedAsset.id)}>{nft.flagship?.id === selectedAsset.id ? <><Check size={16} /> Assigned</> : <><Rocket size={16} /> Assign to flagship</>}</button>{nft.flagship && <button className="nft-button" disabled={nft.busy} onClick={() => void nft.assign(null)}>Remove identity</button>}</> : <p className="nft-small">Link your holding wallet and select your UFO.</p>}<p className="nft-small">Cosmetic identity. Combat stats stay unchanged.</p></section>
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
  return <div ref={ref} className="nft-wallet-dialog" role="dialog" aria-modal="true" aria-labelledby="nft-wallet-title"><header><h2 id="nft-wallet-title">Link your NFT holding wallet</h2><button className="nft-icon-button" disabled={nft.busy} onClick={onClose} aria-label="Close wallet picker"><X size={18} /></button></header><p>Your GAMESOL passkey stays connected. Choose the separate wallet holding your mainnet Crypto UFOs.</p>{nft.wallets.map((wallet) => <button className="nft-wallet-option" key={wallet.name} disabled={nft.busy} onClick={() => void nft.connect(wallet).then((linked) => { if (linked) onClose(); })}><img src={wallet.icon} alt="" /><span>{wallet.name}</span><Link2 size={16} /></button>)}{nft.wallets.length === 0 && <div className="nft-empty"><p>No compatible Solana wallets detected in this browser.</p><div className="nft-install-links"><a href="https://phantom.com" target="_blank" rel="noopener noreferrer">Phantom <ExternalLink size={12} /></a><a href="https://solflare.com" target="_blank" rel="noopener noreferrer">Solflare <ExternalLink size={12} /></a><a href="https://jup.ag/mobile" target="_blank" rel="noopener noreferrer">Jupiter <ExternalLink size={12} /></a></div><p>Open the game in your wallet's browser or a browser with its extension.</p></div>}{nft.busy && <p role="status"><LoaderCircle size={16} className="nft-spin" /> {nft.stage}</p>}{nft.error && <p className="nft-error" role="alert">{nft.error}</p>}<small>Both wallets approve a domain-bound link. Neither approval transfers funds or NFTs.</small></div>;
}

export default function CryptoUfosPage() {
  return <main className="nft-page"><header className="nft-game-header"><a href="/app"><img src={gamesolLogo} alt="GAMESOL" /><span>GAMESOL</span></a><a href="/app">Return to universe</a></header><CryptoUfosPanel /></main>;
}
