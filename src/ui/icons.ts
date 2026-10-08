const paths = {
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  fullscreen: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  minimize: '<path d="M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/>',
  camera:
    '<path d="m8 5 2-2h4l2 2h4a2 2 0 0 1 2 2v12H2V7a2 2 0 0 1 2-2Z"/><circle cx="12" cy="12" r="4"/>',
  observer:
    '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  split: '<rect x="2" y="4" width="20" height="16" rx="1"/><path d="M14 4v16"/>',
  stacked: '<rect x="2" y="4" width="20" height="16" rx="1"/><path d="M2 12h20"/>',
  classic: '<rect x="2" y="4" width="20" height="16" rx="1"/><path d="M14 4v16m0-8h8m-8 4h8"/>',
  equalize: '<path d="M3 7h18M3 17h18M12 3v18"/>',
  takeoff: '<path d="M4 20h16M12 16V3m-5 5 5-5 5 5"/>',
  land: '<path d="M4 20h16M12 3v13m-5-5 5 5 5-5"/>',
  aids: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
  quality:
    '<rect x="6" y="6" width="12" height="12" rx="1"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4M10 10h4v4h-4z"/>',
  tree: '<path d="M12 21v-9M8 21h8M12 15l-4-4m4 2 4-4M5 12a4 4 0 0 1-1-7 4 4 0 0 1 7-2 4 4 0 0 1 6 1 4 4 0 1 1 2 8Z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  guide: '<path d="M12 5v16M12 5C8 2 4 3 2 4v15c3-1 6-1 10 2 4-3 7-3 10-2V4c-2-1-6-2-10 1Z"/>',
  tune: '<path d="M4 3v5m0 4v9M12 3v10m0 4v4M20 3v2m0 4v12M1 8h6m2 9h6m2-12h6"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z M9 3v16m6-14v16"/>',
  speed: '<path d="M4 18a9 9 0 1 1 16 0M12 13l5-5M7 17h10"/>',
  pin: '<path d="M19 9c0 5-7 12-7 12S5 14 5 9a7 7 0 0 1 14 0Z"/><circle cx="12" cy="9" r="2"/>',
  contrast:
    '<circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none"/>',
  collapse: '<path d="m6 15 6-6 6 6"/>',
  expand: '<path d="m6 9 6 6 6-6"/>',
  warning: '<path d="m12 3 10 18H2Z"/><path d="M12 9v5m0 3v1"/>',
  frame: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><circle cx="12" cy="12" r="3"/>',
} as const;

export type IconName = keyof typeof paths;
export function icon(name: IconName): string {
  return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
}

export function setIconButton(
  button: HTMLButtonElement,
  name: IconName,
  label: string,
  hint = label,
): void {
  if (button.dataset.icon !== name) {
    button.innerHTML = icon(name);
    button.dataset.icon = name;
  }
  button.setAttribute('aria-label', label);
  if (button.closest('.flight-panel')) button.title = hint;
  else button.dataset.tooltip = hint;
}
