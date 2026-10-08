import { icon } from '../icons';
import { html } from '../markup';
import { takeoffWordmark } from './common';

export function menuMarkup(bestScore: number): string {
  return html` <main class="launch-menu">
    <header class="launch-header">
      ${takeoffWordmark()}<span>YOUR NEXT FLIGHT STARTS HERE</span>
    </header>
    <section class="launch-intro">
      <span class="eyebrow">FLY THE ROUTE. FIND THE SHOT.</span>
      <h1>Where will you<br /><em>take it?</em></h1>
      <p>
        One drone. Two ways to fly.<br />Chase a high score or take your time behind the sticks.
      </p>
    </section>
    <section class="mode-choices" aria-label="Choose a mode">
      <a class="mode-card game-card" href="/game" aria-label="Play game">
        <div class="mode-art run-art" aria-hidden="true">
          <div class="art-grid"></div>
          <i class="art-gate gate-one"></i><i class="art-gate gate-two"></i
          ><i class="art-gate gate-three"></i><span class="art-flight">${icon('aids')}</span
          ><span class="art-badge">ENDLESS FLIGHT</span>
        </div>
        <div class="mode-card-body">
          <span class="eyebrow">01 / GAME</span>
          <h2>Flight Rush ${icon('play')}</h2>
          <p>
            Thread the gates. Master every move. Keep your streak alive as the course picks up
            speed.
          </p>
          <div class="mode-card-meta">
            <span>3rd-person chase · Scored runs</span><strong>PLAY ${icon('play')}</strong>
          </div>
        </div>
      </a>
      <a class="mode-card practice-card" href="/practice" aria-label="Open practice tool">
        <div class="mode-art practice-art" aria-hidden="true">
          <div class="art-grid"></div>
          <i class="art-building building-one"></i><i class="art-building building-two"></i
          ><i class="art-building building-three"></i><span class="art-frame">${icon('frame')}</span
          ><span class="art-badge">ROOM TO EXPLORE</span>
        </div>
        <div class="mode-card-body">
          <span class="eyebrow">02 / PRACTICE TOOL</span>
          <h2>Your flight station ${icon('observer')}</h2>
          <p>
            Explore the maps, learn the controls, follow a car, and find your next camera angle.
          </p>
          <div class="mode-card-meta">
            <span>Free flight · Photography · Routes</span><strong>EXPLORE ${icon('play')}</strong>
          </div>
        </div>
      </a>
    </section>
    <footer class="launch-footer">
      <span>${icon('phone')} Keyboard or paired phone. Same controls in both modes.</span
      ><span>FLIGHT RUSH BEST <strong>${bestScore.toLocaleString()}</strong></span>
    </footer>
  </main>`;
}
