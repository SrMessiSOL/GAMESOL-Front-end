export type PaymentTestPhase = 'approval' | 'execution' | null;

// Fault injection is opt-in at build time and limited to disposable devnet Previews.
export function paymentTestPhase(enabled: string | undefined, hostname: string, search: string, genesis: string): PaymentTestPhase {
  const preview = hostname === 'gamesol-devnet-qa.vercel.app'
    || /^frontend-[a-z0-9]+-srmessisols-projects\.vercel\.app$/.test(hostname);
  if (enabled !== '1' || !preview
    || genesis !== 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG') return null;
  const phase = new URLSearchParams(search).get('paymentTestPause');
  return phase === 'approval' || phase === 'execution' ? phase : null;
}
