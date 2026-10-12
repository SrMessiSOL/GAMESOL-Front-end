export type TransitPhase = 'idle' | 'covering' | 'loading' | 'revealing' | 'error';
export type TransitState = { phase: TransitPhase; id: number; title: string; detail: string };
export type TransitEvent = { type: 'begin'; id: number; title: string; detail: string }
  | { type: 'covered' | 'ready' | 'done' | 'timeout'; id: number };
export const INITIAL_TRANSIT: TransitState = { phase: 'idle', id: 0, title: '', detail: '' };

export function transitReducer(state: TransitState, event: TransitEvent): TransitState {
  if (event.type === 'begin') return state.phase === 'idle'
    ? { phase: 'covering', id: event.id, title: event.title, detail: event.detail } : state;
  if (event.id !== state.id) return state;
  if (event.type === 'covered' && state.phase === 'covering') return { ...state, phase: 'loading' };
  if (event.type === 'ready' && state.phase === 'loading') return { ...state, phase: 'revealing' };
  if (event.type === 'done' && state.phase === 'revealing') return { ...state, phase: 'idle' };
  if (event.type === 'timeout' && state.phase === 'loading') return { ...state, phase: 'error' };
  return state;
}

export function easeSceneProgress(progress: number) {
  const t = Math.max(0, Math.min(1, progress));
  return t * t * (3 - 2 * t);
}

export function motionDuration(milliseconds: number) {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : milliseconds;
}
