import React, { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { X } from "lucide-react";
import "./game-ui.css";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "default" | "primary" | "governance";
};

export const GameButton = forwardRef<HTMLButtonElement, ButtonProps>(function GameButton(
  { className = "", tone = "default", type = "button", ...props },
  ref,
) {
  return <button ref={ref} type={type} className={`gds-button is-${tone} ${className}`.trim()} {...props} />;
});

export const GameIconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string }>(function GameIconButton(
  { className = "", label, title, type = "button", ...props },
  ref,
) {
  return <button ref={ref} type={type} className={`gds-icon-button ${className}`.trim()} aria-label={label} title={title ?? label} {...props} />;
});

export function GameWorkspace({
  children,
  className = "",
  titleId,
  kicker,
  title,
  description,
  closeLabel,
  closeRef,
  workspaceRef,
  onClose,
}: {
  children: ReactNode;
  className?: string;
  titleId: string;
  kicker: string;
  title: string;
  description?: string;
  closeLabel: string;
  closeRef?: React.Ref<HTMLButtonElement>;
  workspaceRef?: React.Ref<HTMLElement>;
  onClose: () => void;
}) {
  const descriptionId = description ? `${titleId}-description` : undefined;
  return <section ref={workspaceRef} className={`gds-workspace ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
    <header className="gds-workspace-header">
      <div className="gds-workspace-heading">
        <span className="gds-workspace-kicker">{kicker}</span>
        <h2 className="gds-workspace-title" id={titleId}>{title}</h2>
        {description && <p className="gds-workspace-description" id={descriptionId}>{description}</p>}
      </div>
      <GameIconButton ref={closeRef} className="gds-workspace-close" label={closeLabel} title="Close (Esc)" onClick={onClose}><X aria-hidden="true" /></GameIconButton>
    </header>
    {children}
  </section>;
}

export function GameEmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="gds-empty-state">
    <span className="gds-empty-state-icon" aria-hidden="true">{icon}</span>
    <strong>{title}</strong>
    <p>{description}</p>
    {action}
  </div>;
}
