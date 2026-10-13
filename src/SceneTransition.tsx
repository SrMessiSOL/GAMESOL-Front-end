import { useCallback, useEffect, useReducer, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { LoaderCircle, RotateCcw } from 'lucide-react';
import { INITIAL_TRANSIT, motionDuration, transitReducer, visiblePageTimeout, type TransitState } from './scene-motion';
import './scene-transition.css';

export function useSceneTransit() {
  const [state, dispatch] = useReducer(transitReducer, INITIAL_TRANSIT);
  const commit = useRef<() => void>();
  const sequence = useRef(0);
  const locked = useRef(false);
  const begin = useCallback((action: () => void, title: string, detail = '') => {
    if (locked.current) return false;
    locked.current = true;
    commit.current = action;
    dispatch({ type: 'begin', id: ++sequence.current, title, detail });
    return true;
  }, []);
  const ready = useCallback(() => dispatch({ type: 'ready', id: sequence.current }), []);
  useEffect(() => {
    if (state.phase === 'idle') { locked.current = false; commit.current = undefined; return; }
    if (state.phase === 'covering') {
      const timer = window.setTimeout(() => {
        commit.current?.();
        dispatch({ type: 'covered', id: state.id });
      }, motionDuration(160));
      return () => window.clearTimeout(timer);
    }
    if (state.phase === 'loading') {
      return visiblePageTimeout(() => dispatch({ type: 'timeout', id: state.id }), 15000);
    }
    if (state.phase === 'revealing') {
      const timer = window.setTimeout(() => dispatch({ type: 'done', id: state.id }), motionDuration(280));
      return () => window.clearTimeout(timer);
    }
  }, [state.phase, state.id]);
  return { state, begin, ready, active: state.phase !== 'idle' };
}

// Report readiness from the rendered scene, after its suspense boundary resolves.
export function SceneReady({ sceneKey, onReady }: { sceneKey: string; onReady?: () => void }) {
  const frames = useRef(0);
  const callback = useRef(onReady);
  callback.current = onReady;
  useEffect(() => { frames.current = 0; }, [sceneKey]);
  useFrame(() => {
    if (frames.current < 2 && ++frames.current === 2) callback.current?.();
  });
  return null;
}

export function useCameraInputCancel<T>(controls: MutableRefObject<any>, transition: MutableRefObject<T | null>) {
  useEffect(() => {
    const orbit = controls.current;
    const cancel = () => { transition.current = null; };
    orbit?.addEventListener('start', cancel);
    return () => orbit?.removeEventListener('start', cancel);
  }, [controls, transition]);
}

export function SceneTransition({ state }: { state: TransitState }) {
  if (state.phase === 'idle') return null;
  return <section className={`scene-transit is-${state.phase}`} role="status" aria-live="polite" aria-busy={state.phase !== 'error'}>
    <div className="scene-transit-caption">
      {state.phase === 'error' ? <>
        <strong>Scene could not finish loading</strong>
        <button type="button" onClick={() => window.location.reload()}><RotateCcw size={16} /> Retry</button>
      </> : <><LoaderCircle size={16} aria-hidden="true" /><strong>{state.title}</strong><span>{state.detail}</span></>}
    </div>
  </section>;
}
