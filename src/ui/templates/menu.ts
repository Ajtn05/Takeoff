import { icon } from '../icons';
import { html } from '../markup';
import { takeoffWordmark } from './common';
import campusPreview from '../../../docs/images/map-ateneo.png';

export function menuMarkup(bestScore: number): string {
  return html` <main class="launch-menu">
    <header class="launch-header">
      ${takeoffWordmark()}<span>Drone flight & photography simulator</span>
    </header>
    <section class="launch-intro">
      <h1>Where will you take it?</h1>
      <p>Chase a high score or find a new perspective. Choose your flight and make it yours.</p>
    </section>
    <section class="mode-choices" aria-label="Choose a mode">
      <a class="mode-card game-card" href="/game" aria-label="Play game">
        <div class="mode-art run-art" aria-hidden="true">
          <img class="mode-preview" src="/images/flight-rush.svg" alt="" />
          <span class="art-badge">${icon('play')} Endless course</span>
          <span class="preview-caption">Fly the route.</span>
        </div>
        <div class="mode-card-body">
          <div class="mode-card-heading">
            <h2>Flight Rush</h2>
            <span class="mode-kind">Game</span>
          </div>
          <p>Thread the gates, build your streak, and see how far you can fly.</p>
          <div class="mode-card-meta">
            <span>${icon('speed')} Beat your best</span><strong>Play game ${icon('play')}</strong>
          </div>
        </div>
      </a>
      <a class="mode-card practice-card" href="/practice" aria-label="Open practice tool">
        <div class="mode-art practice-art" aria-hidden="true">
          <img class="mode-preview campus-preview" src="${campusPreview}" alt="" />
          <span class="art-badge">${icon('camera')} Free flight & photography</span>
          <span class="preview-caption">Find the shot.</span>
          <span class="preview-location">${icon('pin')} Ateneo de Manila</span>
        </div>
        <div class="mode-card-body">
          <div class="mode-card-heading">
            <h2>Your flight station</h2>
            <span class="mode-kind">Practice</span>
          </div>
          <p>Learn the controls, explore four maps, and bring home the shot.</p>
          <div class="mode-card-meta">
            <span>${icon('map')} Explore at your pace</span
            ><strong>Open practice ${icon('play')}</strong>
          </div>
        </div>
      </a>
    </section>
    <footer class="launch-footer">
      <span>${icon('phone')} Fly with your keyboard or pair a phone.</span
      ><span>Flight Rush personal best <strong>${bestScore.toLocaleString()}</strong></span>
    </footer>
  </main>`;
}
