import { icon, type IconName } from './icons';
import { html } from './markup';

export const iconControl = (
  id: string,
  name: IconName,
  label: string,
  attributes = '',
  hint = label,
  classes = 'button quiet icon-control',
) =>
  html`<button
    id="${id}"
    class="${classes}"
    aria-label="${label}"
    data-tooltip="${hint}"
    ${attributes}
  >
    ${icon(name)}
  </button>`;
