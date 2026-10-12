import { useEffect, useId, useState, type ReactNode, type ComponentProps } from 'react';
import { LoaderCircle, Minus, Plus } from 'lucide-react';
import { GameButton, GameIconButton } from './game-ui';
import { isWholeQuantity, MAX_ORDER_QUANTITY } from '../command-validation';
import './command-controls.css';

export function CommandActionButton({ pending = false, pendingLabel = 'Processing...', icon, children, disabled, className = '', ...props }:
  ComponentProps<typeof GameButton> & { pending?: boolean; pendingLabel?: string; icon?: ReactNode }) {
  return <GameButton {...props} className={`command-action ${className}`} disabled={disabled || pending} aria-busy={pending}>
    <span className="command-action-icon" aria-hidden="true">{pending ? <LoaderCircle className="command-spin" /> : icon}</span>
    <span>{pending ? pendingLabel : children}</span>
  </GameButton>;
}

export function CommandQuantity({ label, value, onChange, onValidityChange, disabled = false }: {
  label: string; value: number; onChange: (value: number) => void; onValidityChange: (valid: boolean) => void; disabled?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  const valid = isWholeQuantity(draft);
  useEffect(() => { setDraft(String(value)); onValidityChange(isWholeQuantity(value)); }, [value, onValidityChange]);
  const choose = (quantity: number) => {
    if (disabled || !isWholeQuantity(quantity)) return;
    setDraft(String(quantity)); onValidityChange(true); onChange(quantity);
  };
  return <div className="command-quantity">
    <div className="command-quantity-stepper">
      <GameIconButton label={`Decrease ${label.toLowerCase()}`} disabled={disabled || !valid || value <= 1} onClick={() => choose(value - 1)}><Minus aria-hidden="true" /></GameIconButton>
      <input id={id} aria-label={label} aria-invalid={!valid} aria-describedby={!valid ? `${id}-error` : undefined} type="number" inputMode="numeric" min={1} max={MAX_ORDER_QUANTITY} step={1} disabled={disabled} value={draft} onChange={(event) => {
        const next = event.target.value;
        setDraft(next); const okay = isWholeQuantity(next); onValidityChange(okay);
        if (okay) onChange(Number(next));
      }} />
      <GameIconButton label={`Increase ${label.toLowerCase()}`} disabled={disabled || !valid || value >= MAX_ORDER_QUANTITY} onClick={() => choose(value + 1)}><Plus aria-hidden="true" /></GameIconButton>
    </div>
    <div className="command-quantity-presets" role="group" aria-label={`${label} presets`}>{[1, 5, 10].map((quantity) => <GameButton key={quantity} aria-pressed={valid && value === quantity} disabled={disabled} onClick={() => choose(quantity)}>{quantity}</GameButton>)}</div>
    {!valid && <small id={`${id}-error`} role="alert">Enter a whole quantity from 1 to {MAX_ORDER_QUANTITY.toLocaleString('en-US')}.</small>}
  </div>;
}
