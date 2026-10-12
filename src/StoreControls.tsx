import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, FlaskConical, Gem, Pickaxe, Shield, ShoppingCart, X } from 'lucide-react';
import type { StorePack } from './store-catalog';
import { formatUsdc, storePurchaseEligibility } from './command-validation';
import { CommandActionButton } from './design-system/command-controls';
import { GameButton, GameIconButton } from './design-system/game-ui';
import usdcCoin from './assets/ui/usdc.svg';
import './store-controls.css';

function PackContents({ pack }: { pack: StorePack }) {
  return <div className="command-pack-contents">
    {pack.reward.metal > 0 && <span className="metal"><Pickaxe aria-hidden="true" /><b>{pack.reward.metal.toLocaleString()}</b> Metal</span>}
    {pack.reward.crystal > 0 && <span className="crystal"><Gem aria-hidden="true" /><b>{pack.reward.crystal.toLocaleString()}</b> Crystal</span>}
    {pack.reward.deuterium > 0 && <span className="deuterium"><FlaskConical aria-hidden="true" /><b>{pack.reward.deuterium.toLocaleString()}</b> Deuterium</span>}
    {Boolean(pack.shieldSeconds) && <span className="shield"><Shield aria-hidden="true" /><b>{pack.shieldSeconds! / 3600}h</b> protection</span>}
  </div>;
}

export function StorePackCard({ pack, purchased, balance, worldName, pending = false, disabled = false, resetLabel, onReview }: {
  pack: StorePack; purchased: boolean; balance: bigint; worldName: string; pending?: boolean; disabled?: boolean; resetLabel: string; onReview: (pack: StorePack) => void;
}) {
  const eligibility = storePurchaseEligibility({ enabled: true, purchased, balance, price: pack.priceUsdc, pending });
  const price = formatUsdc(pack.priceUsdc);
  return <article className={`command-store-pack${purchased ? ' is-purchased' : ''}`}>
    <div className="command-pack-copy"><h3>{pack.title}</h3><p>{pack.hint}</p><span className="command-pack-price"><img src={usdcCoin} alt="USDC" /><strong>{price}</strong></span></div>
    <div className="command-pack-delivery"><small title={worldName}>To {worldName}</small><PackContents pack={pack} /></div>
    <footer>
      <CommandActionButton icon={purchased ? <Check /> : <ShoppingCart />} pending={pending} pendingLabel="Purchasing..." disabled={disabled || !eligibility.allowed} title={purchased ? `Available again ${resetLabel}` : undefined} aria-label={eligibility.allowed ? `Review ${pack.title}, ${price} USDC` : `${pack.title}: ${eligibility.label}`} onClick={() => onReview(pack)}>{eligibility.label}</CommandActionButton>
      {!purchased && balance < pack.priceUsdc && !pending && <small className="command-pack-shortfall">Needs {formatUsdc(pack.priceUsdc - balance)} more USDC</small>}
      {purchased && <small>Resets {resetLabel}</small>}
    </footer>
  </article>;
}

export function StorePurchaseReview({ pack, worldName, balance, disabled = false, onClose, onConfirm }: {
  pack: StorePack; worldName: string; balance: bigint; disabled?: boolean; onClose: () => void; onConfirm: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      event.stopPropagation();
      const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? []);
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('keydown', key, true); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  const allowed = !disabled && balance >= pack.priceUsdc;
  return createPortal(<div className="command-purchase-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={ref} className="command-purchase-review" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header><h2 id={titleId}>Review purchase</h2><GameIconButton label="Close purchase review" onClick={onClose}><X aria-hidden="true" /></GameIconButton></header>
      <h3>{pack.title}</h3><p>{pack.hint}</p>
      <dl><div><dt>Total</dt><dd><img src={usdcCoin} alt="USDC" />{formatUsdc(pack.priceUsdc)}</dd></div><div><dt>Delivery world</dt><dd>{worldName}</dd></div><div><dt>Your USDC</dt><dd>{formatUsdc(balance)}</dd></div></dl>
      <PackContents pack={pack} />
      <small className="command-purchase-limit">One per {pack.group.toLowerCase()} reset. Resource storage and protection limits apply.</small>
      {balance < pack.priceUsdc && <p className="command-purchase-error" role="alert">Insufficient USDC.</p>}
      <footer><GameButton onClick={onClose}>Cancel</GameButton><CommandActionButton tone="primary" icon={<ShoppingCart />} disabled={!allowed} onClick={onConfirm}>Buy for {formatUsdc(pack.priceUsdc)} USDC</CommandActionButton></footer>
    </section>
  </div>, document.body);
}
