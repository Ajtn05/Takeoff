import { icon } from '../icons';
import { VIEW_LAYOUTS } from '../layouts';
import { html } from '../markup';

export const guideDialog = () =>
  html` <dialog id="guide-dialog" class="station-dialog guide-dialog" aria-labelledby="guide-title">
    <header class="dialog-header">
      <div>
        <span class="dialog-eyebrow">TAKEOFF</span>
        <h2 id="guide-title">Guide</h2>
      </div>
      <button id="close-guide" class="icon-button" aria-label="Close guide">×</button>
    </header>
    <div class="guide-body">
      <div class="guide-tabs" role="tablist" aria-label="Guide topics">
        ${[
          ['startup', 'Startup'],
          ['controls', 'Controls'],
          ['connection', 'Connection'],
          ['layout', 'Layout'],
        ]
          .map(
            ([id, label], index) =>
              `<button id="guide-tab-${id}" role="tab" aria-controls="guide-${id}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">${label}</button>`,
          )
          .join('')}
      </div>
      <div id="guide-content" class="guide-content">
        <section
          id="guide-startup"
          role="tabpanel"
          aria-labelledby="guide-tab-startup"
          tabindex="0"
        >
          <h3>Your first flight</h3>
          <p>
            The laptop runs the flight and shows both views. You can fly immediately with the
            keyboard.
          </p>
          <ol class="guide-steps">
            <li>
              <strong>Choose your location.</strong> Pick a map and a practice route or photo spot.
              For obstacle routes, start with the 5 m/s speed limit.
            </li>
            <li>
              <strong>Choose your controls.</strong> Keep Keyboard selected, or pair a phone from
              the phone icon in the toolbar.
            </li>
            <li>
              <strong>Take off.</strong> Close any open dialog and press <kbd>T</kbd> or
              ${icon('takeoff')}. The drone climbs automatically to a 3 m hover.
            </li>
            <li>
              <strong>Move and frame a photo.</strong> Use the arrow keys to move, <kbd>W</kbd> /
              <kbd>S</kbd> for altitude, and <kbd>A</kbd> / <kbd>D</kbd> to turn. Tilt the camera
              with <kbd>R</kbd> / <kbd>F</kbd>, then press <kbd>C</kbd> to capture.
            </li>
            <li>
              <strong>Finish your flight.</strong> Return over the pad and press <kbd>L</kbd> to
              land. Landing descends at your current position.
            </li>
          </ol>
          <p class="guide-note">
            <kbd>Space</kbd> pauses or resumes. Opening Guide, pairing, or drone parameters pauses
            the flight. After closing, press <kbd>Space</kbd> to resume, or <kbd>T</kbd> to take off
            from the ground. After a collision, use Reset flight.
          </p>
          <p>
            <strong>Tracking practice:</strong> choose
            <strong>Rally circuit · Tracking</strong> from the map menu. Take off to start the car,
            then climb to 10–20 m and follow it through fast straights and hairpins. Turn with
            <kbd>A</kbd> / <kbd>D</kbd> and tilt with <kbd>R</kbd> / <kbd>F</kbd> to keep it in the
            camera frame. The panel shows the car’s lap and speed, time in frame, and your current
            and best tracking streak. Pause freezes the car; Reset flight restarts the lap and
            clears tracking statistics.
          </p>
          <p>
            <strong>Formula One:</strong> choose <strong>Silverstone · Formula One</strong> for the
            approximate full-size Grand Prix circuit, with a moving open-wheel car. Select
            <strong>Tracking helicopter</strong> in Drone parameters for a 90 m/s aircraft that can
            keep pace with the car. The speed menu includes 85 m/s to match its maximum pace.
            Silverstone has 1 km of open approach space beyond the circuit on every side. Use Map
            overview to learn the corners, then turn and tilt to frame the car. All maps have a 300
            m simulator ceiling.
          </p>
          <details>
            <summary>Starting a local server</summary>
            <p>
              With Node.js 22.12 or newer installed, run these commands in the Takeoff project
              folder:
            </p>
            <pre>
npm ci
npm run build
npm start</pre>
            <p>
              Open
              <a href="http://127.0.0.1:8080" target="_blank" rel="noopener noreferrer"
                >127.0.0.1:8080</a
              >. Leave the terminal running. Future sessions only need <code>npm start</code> unless
              you change the app.
            </p>
          </details>
        </section>
        <section
          id="guide-controls"
          role="tabpanel"
          aria-labelledby="guide-tab-controls"
          tabindex="0"
          hidden
        >
          <h3>Flight controls</h3>
          <p>
            Movement follows the drone’s heading. When it faces you, its right appears to your left
            in the observer view. Release movement keys or center the sticks to brake into a hover.
            The phone table below uses the default Mode 2; follow the phone’s axis labels if you
            select another stick mode.
          </p>
          <div class="guide-table-wrap">
            <table class="guide-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Keyboard</th>
                  <th>Phone · Mode 2</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>Climb / descend</th>
                  <td><kbd>W</kbd> / <kbd>S</kbd></td>
                  <td>Left stick up / down</td>
                </tr>
                <tr>
                  <th>Turn left / right</th>
                  <td><kbd>A</kbd> / <kbd>D</kbd></td>
                  <td>Left stick left / right</td>
                </tr>
                <tr>
                  <th>Forward / backward</th>
                  <td><kbd>↑</kbd> / <kbd>↓</kbd></td>
                  <td>Right stick up / down</td>
                </tr>
                <tr>
                  <th>Move left / right</th>
                  <td><kbd>←</kbd> / <kbd>→</kbd></td>
                  <td>Right stick left / right</td>
                </tr>
                <tr>
                  <th>Camera tilt up / down</th>
                  <td><kbd>R</kbd> / <kbd>F</kbd></td>
                  <td>Hold the Tilt buttons</td>
                </tr>
                <tr>
                  <th>Take off / land</th>
                  <td><kbd>T</kbd> / <kbd>L</kbd></td>
                  <td>Take off / Land</td>
                </tr>
                <tr>
                  <th>Capture photo</th>
                  <td><kbd>C</kbd></td>
                  <td>Shutter button</td>
                </tr>
                <tr>
                  <th>Pause / resume</th>
                  <td><kbd>Space</kbd></td>
                  <td>Pause controls / Enable controls, then Resume game</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Mode 2 is the default phone layout: Throttle and Yaw on the left, Pitch and Roll on the
            right. Use Stick mode on the phone to practice Mode 1 (left: Pitch / Yaw; right:
            Throttle / Roll) or Mode 3 (left: Pitch / Roll; right: Throttle / Yaw). Changing mode
            pauses controls; enable them again, then tap Resume game on the phone.
          </p>
          <p>
            Keyboard flight works when focus is outside menus, sliders, and dialogs. Click the
            flight workspace to return focus. Select a photo thumbnail to download its 1280 × 720
            PNG.
          </p>
          <div class="guide-tools">
            <span>${icon('reset')} Reset flight</span><span>${icon('play')} Start / resume</span
            ><span>${icon('pause')} Pause</span><span>${icon('takeoff')} Take off</span
            ><span>${icon('land')} Land</span><span>${icon('camera')} Capture photo</span
            ><span>${icon('phone')} Pair phone</span><span>${icon('tune')} Drone parameters</span>
          </div>
          <p>
            Drone parameters change speed, turn rate, acceleration, braking, and camera response.
            Choose a preset or tune your own settings; they are saved in this browser. The speed
            menu above the views adds a temporary horizontal speed cap.
          </p>
        </section>
        <section
          id="guide-connection"
          role="tabpanel"
          aria-labelledby="guide-tab-connection"
          tabindex="0"
          hidden
        >
          <h3>Connect a phone</h3>
          <p>
            The phone becomes a two-stick controller with Mode 2 as the default. Keep both pages
            open; one phone controls a station at a time.
          </p>
          <ol class="guide-steps">
            <li>
              Open ${icon('phone')} <strong>Pair phone</strong> and choose an available connection.
            </li>
            <li>
              Scan the QR code, or copy the complete phone link and open it in the phone browser.
            </li>
            <li>
              Rotate the phone to landscape, choose your Stick mode, center both sticks, and tap
              <strong>Enable controls</strong>.
            </li>
            <li>
              Close the pairing dialog on the laptop. Phone is selected automatically. Tap
              <strong>Take off</strong> on either device.
            </li>
          </ol>
          <h4>Hosted wireless</h4>
          <p>
            Both devices need internet access. The same Wi-Fi, different networks, or mobile data
            work. Choose Wireless in pairing. A hosted station offers wireless pairing; a USB cable
            can supply internet through tethering but does not enable direct USB controls.
          </p>
          <h4>Local Wi-Fi</h4>
          <p>
            Put both devices on the same network. Start the local server with
            <code>npm run start:lan</code>, then choose a Wi-Fi address in pairing. Allow the local
            server through the laptop firewall. Guest networks may block connections between
            devices.
          </p>
          <h4>Local Android USB</h4>
          <p>
            Install Android SDK Platform-Tools on the laptop. Enable USB debugging on the phone,
            connect a data cable, and accept the debugging prompt. In pairing, choose USB cable and
            select <strong>Connect USB phone</strong> before opening the link.
          </p>
          <p class="guide-note">
            If controls pause or the connection drops, center the sticks and tap Enable controls
            again. Then take off from the ground, or tap Resume game in the phone's Game paused
            prompt. Start practice on the laptop also resumes flight. Close open laptop dialogs and
            return to its page before resuming. A collision requires Reset flight. Revoke phone &
            renew link pairs a replacement phone. Reloading the laptop or restarting the server
            needs a new link.
          </p>
          <button id="guide-pair" class="button">${icon('phone')}<span>Open pairing</span></button>
        </section>
        <section
          id="guide-layout"
          role="tabpanel"
          aria-labelledby="guide-tab-layout"
          tabindex="0"
          hidden
        >
          <h3>Arrange your workspace</h3>
          <p>
            The Observer shows the drone in the world. Camera shows the stabilized view used for
            your photos, always in a 16:9 frame.
          </p>
          <dl class="guide-layouts">
            ${VIEW_LAYOUTS.map(({ icon: name, label, description }) => `<div><dt>${icon(name)} ${label}</dt><dd>${description}</dd></div>`).join('')}
          </dl>
          <h4>Observer cameras</h4>
          <p>
            <strong>Fixed view:</strong> drag to orbit, Shift-drag or right-drag to pan, and scroll
            to zoom. On touch screens, drag with one finger to orbit; use two fingers to pan or
            pinch to zoom. The viewpoint stays where you leave it. Focus the observer and use Alt +
            arrow keys to pan, Alt + Shift + arrow keys to rotate, and Alt + <kbd>+</kbd> /
            <kbd>−</kbd> to zoom. The reset icon beside the camera menu restores the launch
            viewpoint.
          </p>
          <p>
            <strong>Follow drone:</strong> the observer tracks the drone.
            <strong>Map overview:</strong> see the map from above with north at the top. Switching
            back to Fixed view restores your chosen viewpoint; changing the location sets a new
            launch viewpoint.
          </p>
          <h4>Instruments and display tools</h4>
          <div class="guide-tools">
            <span>${icon('equalize')} Equalize view sizes</span
            ><span>${icon('reset')} Reset workspace</span
            ><span>${icon('contrast')} Glass / solid instruments</span
            ><span>${icon('collapse')} Collapse instruments</span
            ><span>${icon('aids')} Observer aids</span><span>${icon('grid')} Thirds grid</span
            ><span>${icon('tree')} Campus trees</span><span>${icon('quality')} Low graphics</span
            ><span>${icon('fullscreen')} Fullscreen</span>
          </div>
          <p>
            ALT is height above the local ground, SPD is horizontal speed, HDG is heading, GMB is
            camera tilt, and V/S is vertical speed. Layout, divider size, and instrument preferences
            are saved in this browser. Fullscreen keeps flight controls, Guide, and drone parameters
            accessible. Exit with the fullscreen button or Escape.
          </p>
        </section>
      </div>
    </div>
    <footer class="dialog-footer">
      Flight stays paused while you read. Close Guide to return to practice.
    </footer>
  </dialog>`;
