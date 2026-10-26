import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

async function start() {
  if (import.meta.env.DEV && window.location.pathname === '/fleet-assets') {
    const { default: FleetAssetReview } = await import('./FleetAssetReview');
    ReactDOM.createRoot(document.getElementById('root')!).render(<FleetAssetReview />);
    return;
  }
  if (window.location.pathname !== '/') {
    await import('./game-bootstrap');
    return;
  }
  document.documentElement.classList.add('public-document');
  const { default: PublicWorld } = await import('./PublicWorld');
  ReactDOM.createRoot(document.getElementById('root')!).render(<PublicWorld />);
}

void start().catch(() => {
  const root = document.getElementById('root');
  if (!root) return;
  const message = document.createElement('p');
  message.textContent = 'GAMESOL could not load. Please refresh to try again.';
  const game = document.createElement('a');
  game.href = '/app';
  game.textContent = 'Open the game';
  root.replaceChildren(message, game);
});
