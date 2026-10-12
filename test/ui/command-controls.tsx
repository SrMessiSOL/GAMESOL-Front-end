import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Hammer, RotateCcw } from 'lucide-react';
import { STORE_PACKS, type StorePack } from '../../src/store-catalog';
import { StorePackCard, StorePurchaseReview } from '../../src/StoreControls';
import { CommandActionButton, CommandQuantity } from '../../src/design-system/command-controls';
import '../../src/index.css';
import '../../src/planet-world.css';
import '../../src/planet-world-extra.css';
import '../../src/planet-world-local.css';
import '../../src/game-polish.css';
import '../../src/command-workspace.css';

function Checks() {
  const [quantity, setQuantity] = useState(1);
  const [valid, setValid] = useState(true);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState('No actions recorded');
  const [review, setReview] = useState<StorePack | null>(null);
  const [purchased, setPurchased] = useState<string[]>([]);
  const [purchasePending, setPurchasePending] = useState<string | null>(null);
  const packs = STORE_PACKS.filter((pack) => pack.period === 1 && [0, 4, 16].includes(pack.id));
  return <main style={{ maxWidth: 960, padding: 20, margin: 'auto', color: '#dceef3', fontFamily: 'Arial', boxSizing: 'border-box' }}>
    <header><h1 style={{ fontSize: 20 }}>Component checks</h1><p style={{ color: '#e2ba7a' }}>TEST ONLY: sample balance and destination. No wallet, network or transactions.</p></header>
    <section className="planet-world" style={{ position: 'relative', height: 'auto', minHeight: 0, width: 'auto', overflow: 'visible', background: 'none' }}>
      <section className="pw-shipyard-command">
      <div className="pw-production-control"><div><b>Fleet quantity</b></div><CommandQuantity label="Fleet production quantity" value={quantity} onChange={setQuantity} onValidityChange={setValid} disabled={pending} /></div>
      <div className="pw-command-list pw-ship-list"><article className="is-ready"><div className="pw-row-art" aria-hidden="true" /><div><h3>Layout-test hull</h3><p>UI-only production action</p></div><CommandActionButton tone="primary" pending={pending} pendingLabel="Commissioning..." disabled={!valid} icon={<Hammer />} onClick={() => {
        setPending(true); setResult('Pending test action');
        window.setTimeout(() => { setPending(false); setResult(`Recorded test quantity ${quantity}`); }, 700);
      }}>Build {quantity}</CommandActionButton></article></div>
      <p role="status">{result}</p>
      </section>
      <section className="pw-store-command">
      <div className="command-store-catalog"><section><header><h3>Store states</h3><small>Canonical pack data / simulated eligibility</small></header><div>{packs.map((pack) => <StorePackCard key={pack.id} pack={pack} worldName="LayoutTestDestinationName1234567" balance={3_000_000n} resetLabel="in 23h" purchased={purchased.includes(`${pack.period}:${pack.id}`)} pending={purchasePending === `${pack.period}:${pack.id}`} disabled={purchasePending !== null} onReview={setReview} />)}</div></section></div>
      </section>
      <div className="command-workspace-error" role="alert"><div><strong>Test-only loading failure</strong><p>Retry must remain reachable on mobile.</p></div><CommandActionButton icon={<RotateCcw />} onClick={() => setResult('Recorded test retry')}>Retry</CommandActionButton></div>
    </section>
    {review && <StorePurchaseReview pack={review} worldName="LayoutTestDestinationName1234567" balance={3_000_000n} onClose={() => setReview(null)} onConfirm={() => {
      const key = `${review.period}:${review.id}`; setReview(null); setPurchasePending(key); setResult('Pending test purchase');
      window.setTimeout(() => { setPurchased((current) => [...current, key]); setPurchasePending(null); setResult('Recorded test purchase; no transaction'); }, 700);
    }} />}
  </main>;
}
document.body.style.background = '#081119'; document.body.style.margin = '0';
const root = createRoot(document.getElementById('root')!);
root.render(<Checks />);
import.meta.hot?.dispose(() => root.unmount());
