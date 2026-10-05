# Takeoff UI design

Takeoff is a flight and photography simulator. Its identity should come from the observer view, camera composition, flight instruments, and controller workflow. The desktop header stays limited to its logo and title. Preserve adjustable layouts, floating instruments, the optional glass surface, and compact icon controls.

The controls should feel like cockpit or amplifier components: distinct control banks, raised keys, restrained faceplate gradients, and recessed numeric displays. Use these details to show grouping, depth, and interaction. Add no visible group labels merely to explain the styling. Fullscreen is a flight workspace: hide desktop setup and branding, fill the window with the observer and camera views, and retain compact instruments and flight actions. A collapsed instrument panel continues to show altitude, speed, and heading. Collision recovery has a persistent reset prompt in both modes.

## Research: what people call “AI tells”

These are recurring design habits, not a reliable way to identify whether a page was made with AI. A font, dark theme, or translucent panel is not inherently a problem.

Anthropic describes how underspecified frontend requests converge on familiar fonts, purple gradients, and predictable layouts. Its advice is to give explicit, context-specific direction, and it cautions that replacing one familiar style can produce another repeated default. For Takeoff, the useful response is to design around flight tasks, rather than adopt a different fashionable template. [Anthropic, Improving frontend design through Skills](https://claude.com/blog/improving-frontend-design-through-skills)

Our review of Takeoff identified small text, blue tint across nearly every surface, excessive monospace labels, and decorative camera brackets as the relevant risks. The app already avoids marketing heroes, repeated feature cards, promotional copy, and invented statistics.

| Pattern to avoid | Decision for Takeoff |
| --- | --- |
| A generic landing-page structure | Open directly into the flight workspace. Give the views most of the available space. |
| Accent color applied everywhere | Use neutral graphite surfaces. Cyan identifies selected controls, focus, and the primary action; amber and red indicate actual flight states. |
| Tiny labels and tracked capitals used to suggest technical depth | Use readable sans-serif labels. Keep monospace and tabular numerals for telemetry and performance measurements. |
| Decorative HUD furniture | Retain the composition grid, center mark, and framing feedback. Avoid corner brackets, fake scan lines, ornamental gauges, and invented station identifiers. |
| Decorative effects without a functional role | Confine glass to flight instruments. Use dark backing for legibility, subtle neutral bevels to identify controls, and shadows to separate movable panels. |
| Icons that require guesswork | Use consistent SVG icons, accessible names, keyboard focus, and descriptive context. Keep flight state, connection state, units, and menu values visible. |
| A polished screenshot with incomplete behavior | Check resizing, fullscreen, keyboard use, touch input, disabled actions, disconnection, and real photo export. |

## Interaction and readability

Nielsen Norman Group recommends visible labels for ambiguous icons and warns that hover-only help increases effort and does not translate to touch. Takeoff deliberately keeps the user's requested icon toolbar; this is a compactness tradeoff, not an accessibility improvement. Tooltips explain names and shortcuts. Essential state remains visible, and the narrow-screen layout selector uses text. Phone flight actions retain text labels. [Icon usability](https://www.nngroup.com/articles/icon-usability/), [Tooltip guidelines](https://www.nngroup.com/articles/tooltip-guidelines/)

Use these criteria when changing the UI:

- Aim for at least 4.5:1 text contrast on the actual background for normal text. For translucent instruments, check a white background as well as the dark workspace. [W3C text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- Essential icons, selected-state indicators, and authored focus indicators should have at least 3:1 contrast against adjacent surfaces. Decorative separators need not be as prominent as controls. [W3C non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- Keep toolbar targets at 36 px and instrument buttons at 30 px. W3C's minimum target criterion is 24 × 24 CSS px, with defined exceptions; touch controls can benefit from larger targets. [W3C target sizes](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- Use the desktop's 11 px and 12 px label tokens consistently. Do not shrink status or controls to 7–9 px to fit a layout. Numeric telemetry stays larger; compact unit suffixes are secondary.
- Use the native sans-serif stack for UI text and the native monospace stack for readings. This keeps local operation independent of a remote font service. A new typeface needs a legibility or identity reason, not a blacklist of popular fonts.
- Preserve state and preferences through layout changes. Add motion only when it communicates a real event; respect reduced-motion preferences.

## Review procedure

Build the app, run the relevant browser checks, and inspect desktop, narrow-screen, and short-window screenshots. Check instrument readings with the longest expected values, not only `0.0`. Review both solid and glass panels, including placement over bright terrain. Keep the README screenshot current.

Both views share one WebGL canvas behind the HTML. Keep the observer and camera view containers transparent; change unused view space through the renderer's clear color. An opaque container can hide the camera even when visibility and capture checks pass.

The October 2026 review checks control text, status, telemetry, instrument labels, and footer text at desktop and narrow widths. Check glass instruments over white as well as dark surfaces. Long readings (`80.0 m`, `20.0 m/s`, `359°`, and `−90°`) must fit without overlap. Expanded instruments adapt their columns to panel width; compact instruments retain three core readings. Browser checks exercise sizing, fullscreen restoration, and collision reset.

These checks cover specific usability and design concerns. They do not constitute a complete WCAG audit or a validated test of whether a design “looks AI-generated.”
