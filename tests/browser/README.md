The browser suite uses installed Google Chrome and the built production app. Run `npm run build` before `npm run test:browser`.

Chrome DevTools dispatches two simultaneous touch contacts to the controller. This verifies browser Pointer Events, separate capture ownership, neutral release/cancel, and the relayed simulation flow. It is an emulation check; it does not replace an actual Android device test.

The suite preserves screenshots and traces on failures. Successful runs also save the simulator, controller, and camera-only PNG under `test-results/` for visual inspection.
