# Codebase guide

Takeoff uses TypeScript, native DOM components, Three.js, and a Node HTTP/WebSocket server. Start with `src/main.ts`, which loads the page for the current route.

| Location             | Responsibility                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| `src/pages/`         | Compose pages, bind user actions, and coordinate flight state.                                  |
| `src/flight/`        | Flight physics, aircraft profiles, input handling, and fixed simulation timing.                 |
| `src/game/`          | Flight Rush rules, scoring, and saved best scores.                                              |
| `src/maps/`          | Map data, practice courses, race circuits, terrain sampling, and collision geometry.            |
| `src/network/`       | WebSocket transport and shared phone pairing, including QR codes and USB setup.                 |
| `src/rendering/`     | Cameras, aircraft models, map scenery, material caching, and shared viewport rendering.         |
| `src/ui/`            | Display components, dialogs, workspace controls, DOM lookup, and preferences.                   |
| `src/ui/templates/`  | Page and dialog markup, plus reusable controls.                                                 |
| `src/styles/`        | Shared base styles and styles loaded by each page.                                              |
| `server/`            | HTTP routing, origin checks, static files, session links, controller relay, and USB forwarding. |
| `shared/protocol.ts` | Message types, timeouts, and runtime validation used by both clients and the server.            |
| `scripts/`           | Offline importers for bundled campus and elevation data.                                        |
| `tests/`             | Flight and relay tests; `tests/browser/` covers user workflows.                                 |

Keep physics and scoring independent of the DOM. Pages coordinate behavior; display components receive the readings they render. Put reusable UI and networking behavior in their existing shared modules. Import directly from the module that owns a feature.

The `html` template tag keeps markup readable and lets Prettier format it. Use it for authored markup; use DOM properties such as `textContent` for external strings. DOM lookup is scoped to each page and caches elements used repeatedly during rendering. Map builders reuse materials and batch static geometry; preserve those ownership rules when adding scenery.

Run `npm run format` to apply formatting and `npm run format:check` to verify it. `.editorconfig` defines editor whitespace, and TypeScript checks strict types, unused declarations, filename casing, and switch fallthrough.

Before finishing a change, run `npm run check`, `npm test`, and `npm run build`. Run `npm run test:browser` after changing UI, rendering, pairing, or flight workflows. The browser suite starts a production server on port 8081 and uses Chrome by default.
