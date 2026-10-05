The browser suite uses installed Google Chrome and the built production app. Run `npm run build` before `npm run test:browser`.

Chrome DevTools dispatches two simultaneous touch contacts to the controller. This verifies browser Pointer Events, separate capture ownership, neutral release/cancel, and the relayed simulation flow. It is an emulation check; it does not replace an actual Android device test.

The suite preserves screenshots and traces on failures. Successful runs also save desktop, mobile, Classic, fullscreen, collision, and controller screenshots under `test-results/` for visual inspection. Fullscreen checks cover native and in-page expansion, restoration of desktop controls, live compact readings, and instrument placement in narrow or short windows.

Run `npm run test:hosted` to test the hosted wireless flow with a separate production server on port **8097**. It verifies public pairing, independent stations, revocation, and keyboard flight when pairing is unavailable. Loopback HTTP emulates the deployment; real hosting uses HTTPS and still needs physical-device and network-latency checks.
