import { icon } from '../icons';
import { html } from '../markup';

export function takeoffWordmark(): string {
  return html`<a class="takeoff-wordmark" href="/" aria-label="Takeoff main menu">
    ${icon('aids')} TAKEOFF
  </a>`;
}

export function controlSourceSelector(): string {
  return html`<select id="source" aria-label="Control source">
    <option value="keyboard">Keyboard</option>
    <option value="phone">Phone</option>
  </select>`;
}

export function toastMarkup(): string {
  return html`<div id="toast" class="toast" role="status"></div>`;
}
