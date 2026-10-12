import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Hammer, RotateCcw, Zap, CheckCircle2 } from 'lucide-react';
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
      <section className="pw-research-command">
        <h2>Construction and research checks</h2>
        <CommandActionButton tone="primary" className="pw-primary-action" icon={<Hammer />} pending={pending} pendingLabel="Starting upgrade..." onClick={() => { setPending(true); setResult('Pending test upgrade'); }}>Upgrade to level 12</CommandActionButton>
        <div className="pw-command-list pw-research-list"><article className="is-ready"><div className="pw-row-art" aria-hidden="true" /><div><h3>Layout-test technology</h3><p>Level 11 to 12</p></div><CommandActionButton tone="primary" icon={<Zap />} pending={pending} pendingLabel="Starting research..." onClick={() => { setPending(true); setResult('Pending test research'); }}>Research level 12</CommandActionButton></article></div>
        {[false, true].map((ready) => <section key={String(ready)} className="pw-inline-queue"><div><span>Construction queue</span><strong>Layout-test research laboratory upgrade</strong><div className={`pw-inline-queue-progress${ready ? ' ready' : ''}`} role="progressbar" aria-label="Construction progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={ready ? 100 : 47}><i style={{ width: ready ? '100%' : '47%' }} /></div></div><div className="pw-inline-queue-control"><div className="pw-inline-queue-meta"><b>{ready ? 'READY' : '2h 13m'}</b><em>{ready ? 100 : 47}%</em></div><div className="pw-inline-queue-actions"><CommandActionButton icon={<Zap />} pending={pending} pendingLabel="Accelerating..." disabled={ready} onClick={() => { setPending(true); setResult('Pending test acceleration'); }}>Finish with AM</CommandActionButton><CommandActionButton tone="primary" icon={<CheckCircle2 />} pending={pending} pendingLabel="Finishing..." disabled={!ready} onClick={() => { setPending(true); setResult('Pending test finish'); }}>Finish</CommandActionButton></div></div></section>)}
        <CommandActionButton icon={<RotateCcw />} onClick={() => { setPending(false); setResult('Reset test actions'); }}>Reset test actions</CommandActionButton>
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
