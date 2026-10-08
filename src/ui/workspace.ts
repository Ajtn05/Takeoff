import { elementLookup } from './dom';
import { setIconButton } from './icons';

import { VIEW_LAYOUTS, type ViewLayout } from './layouts';
import { readPreference, savePreference } from './storage';

type WorkspaceSettings = {
  layout: ViewLayout;
  split: number;
  stackedSplit: number;
  glass: boolean;
  collapsed: boolean;
};

const storageKey = 'trainer-workspace-v1';
const defaults: WorkspaceSettings = {
  layout: 'split',
  split: 62,
  stackedSplit: 50,
  glass: true,
  collapsed: false,
};
const layouts = VIEW_LAYOUTS.map((layout) => layout.id);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function bindWorkspace(root: HTMLElement): { setFullscreen: (active: boolean) => void } {
  const getElement = elementLookup(root);
  const stage = getElement('stage');
  const panel = getElement('flight-panel');
  const column = getElement('camera-column');
  const camera = getElement('camera-view');
  const divider = getElement('view-divider');
  const body = getElement('flight-panel-body');
  const flightConsole = getElement('flight-console');
  const actions = root.querySelector<HTMLElement>('.flight-actions')!;
  const status = getElement('flight-status');
  const statusHome = status.parentElement!;
  const transport = getElement('transport-controls');
  const utility = getElement('utility-controls');
  const assistance = getElement('assistance-controls');
  const assistanceHome = assistance.parentElement!;
  const reset = getElement('reset');
  const pause = getElement('pause');
  const fullscreenButton = getElement('simulator-fullscreen');
  const consoleHome = document.createComment('Flight console');
  flightConsole.before(consoleHome);
  let fullscreen = false;
  let fullscreenCollapsed = true;
  const settings = { ...defaults };
  try {
    const saved = JSON.parse(readPreference(storageKey) ?? '{}') as Partial<WorkspaceSettings>;
    if (layouts.includes(saved.layout as ViewLayout)) settings.layout = saved.layout!;
    for (const key of ['split', 'stackedSplit'] as const) {
      if (typeof saved[key] === 'number' && Number.isFinite(saved[key])) {
        settings[key] = clamp(saved[key], 25, 75);
      }
    }
    if (typeof saved.glass === 'boolean') settings.glass = saved.glass;
    if (typeof saved.collapsed === 'boolean') settings.collapsed = saved.collapsed;
  } catch {
    /* Defaults also work when browser storage is unavailable. */
  }
  const save = () => savePreference(storageKey, JSON.stringify(settings));
  const vertical = () =>
    settings.layout === 'stacked' ||
    (settings.layout === 'split' && matchMedia('(max-width: 760px)').matches);
  const ratio = () => (vertical() ? settings.stackedSplit : settings.split);
  const docked = () => settings.layout === 'classic' && !fullscreen;
  const fitClassicCamera = () => {
    if (!docked()) {
      camera.style.removeProperty('width');
      return;
    }
    const height = Math.max(
      0,
      column.clientHeight -
        column.querySelector<HTMLElement>('.camera-title')!.offsetHeight -
        panel.offsetHeight,
    );
    camera.style.width = `${Math.min(column.clientWidth, (height * 16) / 9)}px`;
  };
  const updatePanelSize = () => {
    root.style.setProperty('--flight-data-height', `${panel.offsetHeight}px`);
    fitClassicCamera();
  };
  const updateRatio = () => {
    stage.style.setProperty('--view-split', `${ratio()}%`);
    divider.setAttribute('aria-valuenow', String(Math.round(ratio())));
    divider.setAttribute('aria-orientation', vertical() ? 'horizontal' : 'vertical');
    divider.setAttribute(
      'aria-valuetext',
      `Observer ${Math.round(ratio())} percent, camera ${Math.round(100 - ratio())} percent`,
    );
    getElement('split-value').textContent = `${Math.round(ratio())} / ${Math.round(100 - ratio())}`;
  };
  const apply = () => {
    stage.dataset.layout = settings.layout;
    root.dataset.layout = settings.layout;
    getElement<HTMLSelectElement>('view-layout').value = settings.layout;
    root
      .querySelectorAll<HTMLButtonElement>('[data-layout-option]')
      .forEach((button) =>
        button.setAttribute(
          'aria-pressed',
          String(button.dataset.layoutOption === settings.layout),
        ),
      );
    panel.classList.toggle('is-glass', settings.glass);
    const collapsed = fullscreen ? fullscreenCollapsed : settings.collapsed;
    panel.classList.toggle('is-collapsed', collapsed);
    body.hidden = collapsed;
    getElement('panel-collapse').setAttribute('aria-expanded', String(!collapsed));
    setIconButton(
      getElement<HTMLButtonElement>('panel-collapse'),
      collapsed ? 'expand' : 'collapse',
      collapsed ? 'Expand flight parameters' : 'Collapse flight parameters',
    );
    getElement('panel-glass').setAttribute('aria-pressed', String(settings.glass));
    setIconButton(
      getElement<HTMLButtonElement>('panel-glass'),
      'contrast',
      'Transparent instrument panel',
      settings.glass ? 'Glass panel · switch to solid' : 'Solid panel · switch to glass',
    );
    if (docked()) {
      if (panel.parentElement !== column) column.append(panel);
    } else if (panel.parentElement !== stage) stage.append(panel);
    const adjustable =
      !fullscreen && (settings.layout === 'split' || settings.layout === 'stacked');
    divider.hidden = !adjustable;
    getElement('split-controls').hidden = !adjustable;
    updateRatio();
    updatePanelSize();
    save();
  };
  getElement<HTMLSelectElement>('view-layout').onchange = (event) => {
    settings.layout = (event.target as HTMLSelectElement).value as ViewLayout;
    apply();
  };
  root.querySelectorAll<HTMLButtonElement>('[data-layout-option]').forEach((button) => {
    button.onclick = () => {
      settings.layout = button.dataset.layoutOption as ViewLayout;
      apply();
    };
  });
  getElement('panel-collapse').onclick = () => {
    if (fullscreen) fullscreenCollapsed = !fullscreenCollapsed;
    else settings.collapsed = !settings.collapsed;
    apply();
  };
  getElement('panel-glass').onclick = () => {
    settings.glass = !settings.glass;
    apply();
  };
  getElement('workspace-reset').onclick = () => {
    Object.assign(settings, defaults);
    apply();
  };
  getElement('split-reset').onclick = () => {
    if (vertical()) settings.stackedSplit = 50;
    else settings.split = 50;
    updateRatio();
    save();
  };
  const setRatio = (value: number) => {
    if (vertical()) settings.stackedSplit = clamp(value, 25, 75);
    else settings.split = clamp(value, 25, 75);
    updateRatio();
  };
  let resizing: number | undefined;
  const resize = (event: PointerEvent) => {
    const rect = stage.getBoundingClientRect();
    setRatio(
      vertical()
        ? ((event.clientY - rect.top) / rect.height) * 100
        : ((event.clientX - rect.left) / rect.width) * 100,
    );
  };
  divider.onpointerdown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    resizing = event.pointerId;
    divider.setPointerCapture(event.pointerId);
    root.classList.add('is-resizing');
    resize(event);
  };
  divider.onpointermove = (event) => {
    if (event.pointerId === resizing) resize(event);
  };
  const finishResize = (event: PointerEvent) => {
    if (event.pointerId !== resizing) return;
    resizing = undefined;
    root.classList.remove('is-resizing');
    save();
  };
  divider.onpointerup = finishResize;
  divider.onpointercancel = finishResize;
  divider.onlostpointercapture = finishResize;
  divider.onkeydown = (event) => {
    const decrease = vertical() ? 'ArrowUp' : 'ArrowLeft';
    const increase = vertical() ? 'ArrowDown' : 'ArrowRight';
    if (![decrease, increase, 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    setRatio(
      event.key === 'Home'
        ? 25
        : event.key === 'End'
          ? 75
          : ratio() + (event.key === increase ? 2 : -2),
    );
    save();
  };
  new ResizeObserver(() => {
    updateRatio();
    updatePanelSize();
  }).observe(stage);
  new ResizeObserver(updatePanelSize).observe(panel);
  new ResizeObserver(fitClassicCamera).observe(column);
  matchMedia('(max-width: 760px)').addEventListener('change', updateRatio);
  apply();
  return {
    setFullscreen: (active) => {
      if (fullscreen === active) return;
      fullscreen = active;
      document.body.classList.toggle('flight-fullscreen', active);
      if (active) {
        fullscreenCollapsed = true;
        stage.append(flightConsole);
        flightConsole.prepend(status);
        actions.prepend(reset, pause);
        actions.append(fullscreenButton);
        flightConsole.append(assistance);
      } else {
        consoleHome.after(flightConsole);
        statusHome.insertBefore(status, getElement('workspace-reset'));
        transport.append(reset, pause);
        utility.prepend(fullscreenButton);
        assistanceHome.append(assistance);
      }
      apply();
    },
  };
}
