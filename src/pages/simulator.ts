import { bindFlightInstruments } from '../ui/flight-instruments';
import '../styles/practice.css';
import { FlightClock, MAX_FRAME_MS, STATUS_INTERVAL_MS } from '../flight/clock';
import { type Action, type ServerMessage, type Telemetry } from '../../shared/protocol';
import { KeyboardInput, RemoteInput } from '../flight/input';
import { initialState, stepFlight, takeoff, land, aircraftEnvelope } from '../flight/simulation';
import { PhonePairing } from '../network/pairing';
import { PRACTICE_PAIRING_COPY } from '../ui/pairing-copy';
import { practiceMarkup } from '../ui/templates/practice';
import { elementLookup, requiredElement } from '../ui/dom';
import { bindToast } from '../ui/toast';
import { PhotoGallery } from '../ui/photo-gallery';
import { readPreference, savePreference } from '../ui/storage';
import { TrainingWorld } from '../rendering/world';
import { bindFullscreen } from '../ui/fullscreen';
import {
  flightObstacles,
  loadCampus,
  PRACTICE_MAP,
  RALLY_MAP,
  SILVERSTONE_MAP,
  type TrainingMap,
} from '../maps/maps';
import { bindWorkspace } from '../ui/workspace';
import { setIconButton } from '../ui/icons';
import { advanceCourse, PRACTICE_COURSES } from '../maps/practice';
import { bindAssistance } from '../ui/assistance';
import {
  parseDroneSettings,
  PROFILE_STORAGE_KEY,
  DRONE_PRESETS,
  type DroneSettings,
} from '../flight/profiles';
import {
  advanceRally,
  initialRallySession,
  rallyCarObstacle,
  recordTracking,
  type RallySession,
} from '../maps/rally';
import '../styles/workspace.css';

export async function mount(app: HTMLElement): Promise<void> {
  app.innerHTML = practiceMarkup();
  const getElement = elementLookup(app);
  const station = requiredElement(app, '.simulator');
  const renderInstruments = bindFlightInstruments(app);
  const setMapTip = (tip: string) => {
    const hint = `${tip} ${getElement('map-boundary').textContent}`;
    getElement('map-tip').dataset.tooltip = hint;
    getElement('map-tip').setAttribute('aria-description', hint);
  };
  const workspace = bindWorkspace(station);
  const world = new TrainingWorld(
    getElement('stage'),
    getElement('observer-view'),
    getElement('camera-view'),
  );
  let activeMap: TrainingMap = PRACTICE_MAP;
  let spot = activeMap.spots[0];
  let loadingMap = false;
  let treesVisible = readPreference('trainer-trees-visible') !== 'false';
  world.setTreesVisible(treesVisible);
  let obstacles = flightObstacles(activeMap, treesVisible);
  let droneSettings = parseDroneSettings(readPreference(PROFILE_STORAGE_KEY));
  const envelope = () => aircraftEnvelope(droneSettings.aircraftType);
  world.setAircraftType(droneSettings.aircraftType);
  const profile = { ...droneSettings.profile };
  const updateSpeedMenu = () => {
    const select = getElement<HTMLSelectElement>('flight-speed');
    select.replaceChildren();
    const choices =
      droneSettings.aircraftType === 'helicopter'
        ? [5, 10, 20, 50, 85, droneSettings.profile.speed]
        : [5, 10, droneSettings.profile.speed];
    for (const speed of [...new Set(choices)]
      .filter((speed) => speed <= droneSettings.profile.speed)
      .sort((a, b) => a - b)) {
      select.add(new Option(`${speed} m/s`, String(speed)));
    }
    select.value = String(droneSettings.profile.speed);
  };
  const updateCameraSpecs = () => {
    world.setCameraFov(profile.fov);
    const label = `16:9 · ${profile.fov}° vertical field of view · 1280 × 720 PNG captures`;
    const specs = requiredElement(app, '.camera-spec');
    specs.title = label;
    specs.setAttribute('aria-label', label);
  };
  updateSpeedMenu();
  updateCameraSpecs();
  let state = initialState(spot.pad, spot.heading, activeMap.ground, envelope());
  let paused = true;
  let reason = 'Take off to begin.';
  let course = PRACTICE_COURSES.find((route) => route.id === spot.courseId);
  let nextGate = 0;
  let rally: RallySession | undefined;
  const updateCourse = () => {
    const panel = getElement('course-progress');
    panel.hidden = !course && !rally;
    panel.setAttribute('aria-live', rally ? 'off' : 'polite');
    panel.dataset.complete = String(Boolean(course && nextGate === course.gates.length));
    if (rally) {
      const pose = activeMap.circuit!.pose(rally.distance);
      getElement('course-name').textContent =
        activeMap.id === 'silverstone' ? 'Formula One tracking' : 'Rally tracking';
      getElement('course-count').textContent =
        `Lap ${pose.lap} · ${activeMap.id === 'silverstone' ? `${(pose.speed * 3.6).toFixed(0)} km/h` : `${pose.speed.toFixed(0)} m/s`}`;
      const percent = rally.flyingTime
        ? Math.round((rally.framedTime / rally.flyingTime) * 100)
        : 0;
      getElement('course-next').textContent = rally.flyingTime
        ? `In frame ${percent}% · Streak ${rally.streak.toFixed(1)} s · Best ${rally.bestStreak.toFixed(1)} s`
        : 'Take off to start · Keep the car in frame';
      return;
    }
    if (!course) return;
    getElement('course-name').textContent = course.name;
    getElement('course-count').textContent = `${nextGate} / ${course.gates.length}`;
    const gate = course.gates[nextGate];
    getElement('course-next').textContent = gate
      ? `Next: ${String(nextGate + 1).padStart(2, '0')} · ${(gate.center[1] - envelope().restHeight).toFixed(1)} m AGL · ${gate.width.toFixed(1)} m opening`
      : 'Course complete · Reset to fly again';
    world.setCourseProgress(nextGate);
  };
  let source: 'keyboard' | 'phone' = 'keyboard';
  let connectedPhone = false;
  let pairing: PhonePairing | undefined;
  let receiptToFrameMs = 0;
  let renderedSequence = -1;
  const remote = new RemoteInput();
  const toast = bindToast(getElement('toast'));
  bindFullscreen(getElement<HTMLButtonElement>('simulator-fullscreen'), station, {
    onError: toast,
    expandWithinPage: true,
    onChange: (active, expanded) => {
      workspace.setFullscreen(active);
      setIconButton(
        getElement<HTMLButtonElement>('simulator-fullscreen'),
        active ? 'minimize' : 'fullscreen',
        active ? (expanded ? 'Exit expanded view' : 'Exit fullscreen') : 'Fullscreen',
      );
    },
  });
  const pause = (message: string, notify = true) => {
    paused = true;
    reason = message;
    keyboard.clear();
    if (notify && remote.ready) {
      remote.ready = false;
      pairing?.send({ type: 'suspend', reason: message });
    }
  };
  const startBlock = (): string | undefined => {
    if (loadingMap) return 'Wait for the location to finish loading.';
    if (document.hidden) return 'Return to the laptop page before starting.';
    if (app.querySelector('dialog[open]'))
      return 'Close the open dialog on the laptop before starting.';
    if (state.mode === 'collided') return 'Reset the flight after a collision.';
    if (source === 'phone' && (!connectedPhone || !remote.fresh(performance.now())))
      return 'Pair a phone and enable its controls before starting.';
  };
  const start = () => {
    const blocked = startBlock();
    if (blocked) return { ok: false, message: blocked };
    keyboard.clear();
    paused = false;
    reason = 'Practice in progress.';
    return { ok: true, message: reason };
  };
  const gallery = new PhotoGallery(
    getElement('photos'),
    getElement('photo-count'),
    getElement('camera-view'),
  );
  const perform = async (action: Action): Promise<{ ok: boolean; message: string }> => {
    if (action === 'resume') return start();
    if (action === 'takeoff' && state.mode === 'grounded' && paused) {
      const result = start();
      if (!result.ok) return result;
    }
    if (paused || state.mode === 'collided')
      return { ok: false, message: 'Resume the game before using flight or camera actions.' };
    if (action === 'takeoff')
      return {
        ok: takeoff(state),
        message:
          state.mode === 'taking-off'
            ? 'Taking off to 3 m.'
            : 'Takeoff is available on the ground.',
      };
    if (action === 'land')
      return {
        ok: land(state),
        message:
          state.mode === 'landing'
            ? 'Landing at the current position.'
            : 'Finish takeoff before landing.',
      };
    try {
      const captureNumber = gallery.add(await world.capture());
      return {
        ok: true,
        message: `Photo ${captureNumber} saved. Download it from the laptop gallery.`,
      };
    } catch {
      return { ok: false, message: 'Photo could not be captured. Try again.' };
    }
  };
  const togglePause = () => {
    if (!paused) {
      pause('Practice paused. Center the sticks before resuming.');
      return;
    }
    const result = start();
    if (!result.ok) toast(result.message);
  };
  const keyboard = new KeyboardInput((action) => {
    if (action === 'pause') togglePause();
    else if (source === 'keyboard') void perform(action).then((result) => toast(result.message));
  });
  const localAction = (action: Action) =>
    void perform(action).then((result) => toast(result.message));
  getElement('pause').onclick = togglePause;
  getElement('takeoff').onclick = () => localAction('takeoff');
  getElement('land').onclick = () => localAction('land');
  getElement('capture').onclick = () => localAction('capture');
  const resetFlight = (message: string) => {
    const collided = state.mode === 'collided';
    pause(message);
    state = initialState(spot.pad, spot.heading, activeMap.ground, envelope());
    world.resetTrail();
    rally = activeMap.circuit ? initialRallySession() : undefined;
    world.updateRally(0);
    nextGate = 0;
    updateCourse();
    getElement('collision-prompt').hidden = true;
    if (collided) getElement('stage').focus({ preventScroll: true });
  };
  const reset = () =>
    resetFlight(
      source === 'phone'
        ? 'Flight reset. Enable phone controls to take off.'
        : 'Flight reset. Take off when ready.',
    );
  getElement('reset').onclick = getElement('collision-reset').onclick = reset;
  getElement<HTMLSelectElement>('source').onchange = (event) => {
    pause('Control source changed. Start practice to resume.');
    source = (event.target as HTMLSelectElement).value as typeof source;
  };
  const setObserverMode = (value: 'fixed' | 'follow' | 'overview') => {
    world.setObserverMode(value);
    getElement<HTMLSelectElement>('observer-mode').value = value;
    getElement('stage').classList.toggle('map-overview', value === 'overview');
    getElement('observer-reset').hidden = getElement('fixed-view-hint').hidden = value !== 'fixed';
  };
  setObserverMode('fixed');
  getElement<HTMLSelectElement>('observer-mode').onchange = (event) =>
    setObserverMode((event.target as HTMLSelectElement).value as 'fixed' | 'follow' | 'overview');
  getElement('observer-reset').onclick = () => world.resetFixedView();
  for (const [id, change] of [
    ['aids', (active: boolean) => (world.aids = active)],
    ['grid', (active: boolean) => (getElement('thirds').hidden = !active)],
    ['quality', (active: boolean) => world.setQuality(active)],
  ] as const) {
    getElement(id).onclick = () => {
      const active = getElement(id).getAttribute('aria-pressed') !== 'true';
      getElement(id).setAttribute('aria-pressed', String(active));
      change(active);
    };
  }
  getElement('trees').setAttribute('aria-pressed', String(treesVisible));
  getElement('trees').onclick = () => {
    treesVisible = !treesVisible;
    world.setTreesVisible(treesVisible);
    obstacles = flightObstacles(activeMap, treesVisible);
    getElement('trees').setAttribute('aria-pressed', String(treesVisible));
    savePreference('trainer-trees-visible', String(treesVisible));
  };
  getElement<HTMLSelectElement>('flight-speed').onchange = (event) => {
    profile.speed = Number((event.target as HTMLSelectElement).value);
  };
  getElement<HTMLInputElement>('gimbal').oninput = (event) => {
    if (source === 'keyboard') state.gimbal = Number((event.target as HTMLInputElement).value);
  };
  const applyMap = () => {
    course = PRACTICE_COURSES.find((route) => route.id === spot.courseId);
    getElement('stage').dataset.tracking = String(Boolean(activeMap.circuit));
    world.setMap(activeMap, spot);
    resetFlight('Location changed. Take off when ready.');
    obstacles = flightObstacles(activeMap, treesVisible);
    getElement('trees').hidden = activeMap.id !== 'ateneo';
    getElement('map-credit').hidden = activeMap.id !== 'ateneo';
    getElement('silverstone-credit').hidden = activeMap.id !== 'silverstone';
    const b = activeMap.bounds;
    getElement('map-boundary').textContent =
      `${activeMap.id === 'ateneo' ? 'Loyola Heights campus' : `${b.maxX - b.minX} × ${b.maxZ - b.minZ} m`} · ${b.ceiling} m ceiling`;
    setMapTip(spot.tip);
    setObserverMode(activeMap.id === 'ateneo' || Boolean(course) ? 'follow' : 'fixed');
    populateSpots();
  };
  const populateSpots = () => {
    const select = getElement<HTMLSelectElement>('photo-spot');
    select.replaceChildren();
    activeMap.spots.forEach((site) => {
      const option = document.createElement('option');
      option.value = site.id;
      option.textContent = site.name;
      select.append(option);
    });
    select.value = spot.id;
    select.setAttribute(
      'aria-label',
      activeMap.id === 'ateneo' ? 'Choose a photo spot' : 'Choose a practice route',
    );
    getElement('spot-control').title =
      activeMap.id === 'ateneo' ? 'Launch location' : 'Practice route';
  };
  populateSpots();
  setMapTip(spot.tip);
  updateCourse();
  getElement<HTMLSelectElement>('map').onchange = async (event) => {
    const select = event.target as HTMLSelectElement;
    const previous = activeMap;
    loadingMap = true;
    select.disabled = true;
    getElement<HTMLSelectElement>('photo-spot').disabled = true;
    pause('Loading practice location…');
    setMapTip('Loading practice location…');
    try {
      activeMap =
        select.value === 'ateneo'
          ? await loadCampus()
          : select.value === 'rally'
            ? RALLY_MAP
            : select.value === 'silverstone'
              ? SILVERSTONE_MAP
              : PRACTICE_MAP;
      spot = activeMap.spots[0];
      applyMap();
    } catch (error) {
      activeMap = previous;
      select.value = previous.id;
      setMapTip(spot.tip);
      pause('Map could not be loaded. Start practice to resume.');
      toast(error instanceof Error ? error.message : 'Map could not be loaded.');
    } finally {
      loadingMap = false;
      select.disabled = false;
      getElement<HTMLSelectElement>('photo-spot').disabled = false;
    }
  };
  getElement<HTMLSelectElement>('photo-spot').onchange = (event) => {
    spot = activeMap.spots.find((site) => site.id === (event.target as HTMLSelectElement).value)!;
    applyMap();
  };
  window.addEventListener('blur', () => {
    if (source === 'keyboard') pause('Laptop lost focus. Start practice to resume.');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause('Laptop page hidden. Start practice to resume.');
  });
  window.addEventListener('pagehide', () => {
    pause('Simulator page closed.');
    pairing?.close();
    gallery.dispose();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) location.reload();
  });
  window.addEventListener('trainer-context-lost', () =>
    pause('Graphics context lost. Reload the simulator.'),
  );
  const showPair = () => pairing?.show();
  bindAssistance(station, {
    settings: () => droneSettings,
    pause,
    pair: showPair,
    apply: (settings: DroneSettings) => {
      const typeChanged = settings.aircraftType !== droneSettings.aircraftType;
      droneSettings = settings;
      Object.assign(profile, settings.profile);
      updateSpeedMenu();
      updateCameraSpecs();
      world.setAircraftType(settings.aircraftType);
      if (typeChanged) resetFlight('Aircraft changed. Take off when ready.');
      savePreference(PROFILE_STORAGE_KEY, JSON.stringify(settings));
      const name =
        DRONE_PRESETS.find((preset) => preset.id === settings.presetId)?.name ??
        `Custom ${settings.aircraftType === 'helicopter' ? 'helicopter' : 'drone'}`;
      toast(
        `${name} settings applied. ${typeChanged ? 'Take off when ready.' : 'Start practice to resume.'}`,
      );
    },
  });
  const onMessage = (message: ServerMessage) => {
    if (message.type === 'connection') {
      const newlyPaired = message.connected && !connectedPhone;
      connectedPhone = message.connected;
      remote.reset(message.generation, message.ready);
      if (newlyPaired) {
        source = 'phone';
        getElement<HTMLSelectElement>('source').value = source;
      }
      if (source === 'phone' || newlyPaired) pause(message.reason, false);
      getElement<HTMLButtonElement>('pause').disabled = paused && source === 'phone';
      getElement('connection-status').textContent = message.connected
        ? message.ready
          ? 'Phone controls ready'
          : 'Phone paired'
        : 'Keyboard · ready';
    }
    if (
      message.type === 'input' &&
      remote.accept(message.generation, message.seq, message.controls, performance.now())
    ) {
      if (paused && source === 'phone') getElement<HTMLButtonElement>('pause').disabled = false;
    }
    if (message.type === 'action') {
      if (message.generation !== remote.generation) return;
      if (source !== 'phone' || !remote.fresh(performance.now())) {
        pairing?.send({
          type: 'ack',
          generation: message.generation,
          id: message.id,
          ok: false,
          message: 'Phone control is paused.',
        });
        return;
      }
      void perform(message.action).then((result) => {
        toast(result.message);
        pairing?.send({ type: 'ack', generation: message.generation, id: message.id, ...result });
      });
    }
  };
  pairing = new PhonePairing(app, {
    copy: PRACTICE_PAIRING_COPY,
    receive: onMessage,
    pause,
    toast,
    unavailable: () => {
      getElement('connection-status').textContent = 'Keyboard · phone pairing unavailable';
    },
  });
  void pairing.connect();
  let previous = performance.now();
  let lastStatus = 0;
  let frames = 0;
  let fps = 0;
  let fpsAt = previous;
  const altitude = () =>
    Math.max(0, state.y - activeMap.ground(state.x, state.z) - envelope().restHeight);
  const telemetry = (): Telemetry => ({
    altitude: altitude(),
    heading: (state.heading * 180) / Math.PI,
    speed: Math.hypot(state.vx, state.vz),
    gimbal: state.gimbal,
    mode: state.mode,
    paused,
    reason,
    captures: gallery.total,
    receiptToFrameMs,
    lastInputSeq: remote.sequence,
  });
  const clock = new FlightClock();
  const frame = (now: number) => {
    const elapsed = now - previous;
    previous = now;
    if (elapsed > MAX_FRAME_MS && !paused) pause('Display stalled. Start practice to resume.');
    if (!paused && source === 'phone' && !remote.fresh(now))
      pause('Controller input expired. Enable controls again.');
    let trackingSeconds = 0;
    clock.advance(elapsed, paused, (seconds) => {
      const before = { x: state.x, y: state.y, z: state.z };
      const wasFlying = state.mode === 'flying';
      const circuit = activeMap.circuit;
      if (rally && wasFlying) advanceRally(rally, seconds, circuit!.pose);
      const flightObstaclesNow = rally
        ? [
            ...obstacles,
            rallyCarObstacle(circuit!.pose(rally.distance), circuit!.car, circuit!.carName),
          ]
        : obstacles;
      stepFlight(
        state,
        source === 'phone' ? remote.controls : keyboard.read(),
        seconds,
        profile,
        flightObstaclesNow,
        activeMap.bounds,
        activeMap.ground,
        envelope(),
      );
      if (state.mode === 'collided') {
        pause(`Collision with ${state.collision}. Reset the flight to try again.`);
        getElement('collision-details').textContent =
          `Hit ${state.collision}. Reset to the launch point.`;
        getElement('collision-prompt').hidden = false;
        getElement('collision-reset').focus({ preventScroll: true });
        return false;
      }
      if (course && wasFlying && state.mode === 'flying') {
        const advanced = advanceCourse(course, nextGate, before, state);
        if (advanced !== nextGate) {
          nextGate = advanced;
          updateCourse();
        }
      }
      if (rally && wasFlying && state.mode === 'flying') trackingSeconds += seconds;
      return true;
    });
    if (rally) world.updateRally(rally.distance);
    world.update(state, paused ? 0 : now);
    world.render();
    if (rally && trackingSeconds) recordTracking(rally, trackingSeconds, world.subjectInFrame());
    if (remote.sequence !== renderedSequence && remote.receivedAt > 0) {
      receiptToFrameMs = Math.max(0, performance.now() - remote.receivedAt);
      renderedSequence = remote.sequence;
    }
    frames++;
    if (now - fpsAt >= 1000) {
      fps = Math.round((frames * 1000) / (now - fpsAt));
      frames = 0;
      fpsAt = now;
    }
    if (now - lastStatus > STATUS_INTERVAL_MS) {
      lastStatus = now;
      const status = telemetry();
      pairing?.send({ type: 'status', status });
      renderInstruments({
        status,
        verticalSpeed: state.vy,
        ceiling: activeMap.bounds.ceiling,
        speedLimit: profile.speed,
        source,
        blocked: Boolean(startBlock()),
        framed: world.subjectInFrame(),
        fps,
      });
      if (rally) updateCourse();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
