# Takeoff Remote for DJI RC231 / RC-N1

This Android companion app reads the RC231's sticks, camera dial, and buttons using DJI Mobile SDK **4.18**, then sends them to Takeoff's existing authenticated WebSocket relay. The laptop renders the simulator. The app includes a live hardware monitor, QR scanning, pasted pairing links, and DJI stick Modes 1, 2, and 3.

**Status:** implemented, with automated bridge and relay checks. RC231 firmware and Android-device compatibility still require a physical remote test. An APK built without a DJI app key can pair with a laptop, but cannot read a remote or enable controls.

The latest local `artifacts/android/takeoff-remote-rc231.apk` is a signed debug build with the configured DJI app key. Version 0.2.0 is also available as `takeoff-remote-rc231-v0.2.0.apk`. Install it on the phone and keep the phone online for the first DJI registration. Physical remote compatibility still requires testing. The earlier `takeoff-remote-rc231-setup.apk` has no key and is only for inspecting the interface and pairing flow. APKs and their SHA-256 checksums are generated artifacts and are ignored by Git.

## Build an APK

Use Android Studio, an Android SDK with platform 35, and a JDK compatible with Gradle 9.7.1 (the bundled Android Studio JDK works). The app supports ARM phones running Android 8 or later. It targets Android 14, following DJI's MSDK 4.18 sample. Newer Android versions, especially devices requiring 16 KB native memory pages, need hardware verification because DJI supplies the native SDK libraries.

1. Sign in to the [DJI Developer Center](https://developer.dji.com/user/apps/) and create an **Android Mobile SDK** app with package name **`com.takeoff.rc231`**. Use Mobile SDK V4 for this build.
2. Copy `key.properties.example` to `key.properties` and enter the app key as `djiAppKey`. This file is ignored by Git. You can instead set `DJI_APP_KEY` in the build environment.
3. Open this `android` directory in Android Studio and let it locate your Android SDK. From a terminal with `ANDROID_HOME` and `JAVA_HOME` configured, run:

   ```sh
   ./gradlew :app:checkDjiKey :app:assembleDebug :bridge:test
   ```

4. Install `app/build/outputs/apk/debug/app-debug.apk` on the phone. Allow installation from the application you use to open the APK. The first DJI registration needs internet access. A build without a key displays an explicit setup message and disables remote control.

The key identifies this application to DJI; DJI verifies it with the package name. Registering a key for a different package will fail. Do not commit keys or signing files. The debug APK is for local testing; a distributable release needs your own signing configuration.

## Companion app screens

The companion uses Takeoff's dark navy panels, mint accent, and matching action icons. **Setup** contains remote connection, laptop pairing, stick mode, and camera-dial direction. Use **Show remote diagnostics** for the raw readings and button states.

Select **Controls** or **Open flight controls** to see flight telemetry, labeled left and right sticks, the camera dial, and flight actions. Axis labels and accessible descriptions follow Modes 1–3. The stick diagrams and dial display the physical remote's input; use the remote to move them. Portrait layouts keep the primary actions together; landscape places flight actions beside the stick monitor.

Switching tabs keeps the connections in place. Opening Setup pauses active controls, so return to Controls and enable again when ready. Changing orientation can recreate the Android activity and requires pairing and enabling again; the phone link and selected tab are retained.

## Connect the RC231

1. **Switch the aircraft off.** Connect the powered RC231 to the phone using the controller's phone cable under its phone holder. The bottom USB-C port is for charging/maintenance, not this connection.
2. Close DJI Fly and other DJI controller apps so they release the USB accessory. When Android asks which app should open the accessory, choose **Takeoff Remote**.
3. Open Takeoff Remote, choose **Setup**, and tap **Connect remote**. Allow the SDK permissions. Phone-state and microphone permissions are not requested. Camera permission is needed only for QR scanning.
4. Check that **RC231 connected** appears. Move both sticks and turn the dial; the labeled monitors on Controls should respond. Raw readings and button states are available in **Show remote diagnostics** on Setup. Missing readings cannot be bypassed by enabling controls.

The app reads an aircraft's remote-controller component even when the aircraft itself is disconnected. It refuses to enable if the aircraft's flight controller is connected. Its own code sends no aircraft, camera, gimbal, or firmware commands. A powered aircraft still responds directly to its remote, so keep it off throughout practice.

## Pair Takeoff

For a hosted simulator, open it on the laptop and select **Pair phone**. Both the laptop and phone need internet access.

For a local simulator, start Takeoff with `npm run start:lan` on the laptop and connect both devices to the same Wi-Fi. Choose a **Wi-Fi** address in **Pair phone**. If only the USB option appears, restart the server with LAN access enabled.

In the companion app, tap **Scan QR code** and allow camera access, or paste the full phone link and tap **Pair laptop**. If camera permission was denied, the app offers a shortcut to its Android settings. The scanner has its own layouts because DJI's bundled scanner uses conflicting default ZXing layout names. You can also open a `takeoff://pair?url=...` link using **Open Takeoff Remote on this device** in the pairing dialog. Scanning or opening a link pairs the session; it never enables controls automatically. Keep the browser controller page closed for that session because only one controller may be paired.

The phone's USB port is occupied by the DJI remote. Use Wi-Fi or the hosted relay between phone and laptop; the existing laptop-to-phone ADB USB setup is intended for touchscreen controls.

Select your stick mode in Setup, then open **Controls**. Leave both sticks and the dial centered for at least 300 ms, release all buttons, then tap **Enable controls**. If the app asks for an initial reading after pairing or reconnecting, move and release both sticks once; they can then stay centered. If a prerequisite is missing, the text above the button and a dialog explain it; pairing alone cannot enable controls without hardware readings and a monitored remote connection. Tap **Take off** to start the simulator. The monitor runs even before pairing or enabling.

| Control                  | Simulator behavior                                            |
| ------------------------ | ------------------------------------------------------------- |
| Two physical sticks      | Climb, yaw, forward/backward, left/right in the selected mode |
| Camera dial              | Camera tilt; **Reverse dial** changes direction if needed     |
| Shutter or record button | Capture one photo per press                                   |
| Return-to-home button    | Land at the current simulated location                        |
| Pause button             | Pause controls; center sticks and enable again                |
| Fn and C/N/S switch      | Shown in the monitor; no action assigned                      |
| App buttons              | Take off, land, capture, resume the paused game               |

Modes 1–3 use physical axis positions; the app does not alter the remote's stored mapping. Raw axes use DJI's ±660 range with a 20-count center dead zone and proportional scaling outside it. Inputs are sent every 50 ms. Hardware callbacks can arrive only when values change, so unchanged stick positions remain valid while the app checks the DJI remote connection and USB accessory presence every 250 ms. This does not alter the original hardware reading's timestamp. The bridge pauses after 500 ms without either a hardware update or a connection check, after 3 seconds without laptop telemetry, on USB loss, or when the activity leaves the foreground. Loss of the link or a gap in monitoring discards the stored reading; a new hardware reading is required before enabling again. Takeoff also retains its existing server and simulator timeouts. Reconnection requires manually enabling again with centered controls. Actions use generation-scoped IDs and acknowledgements so retries do not trigger duplicate captures or landings.

## Verification

```sh
./gradlew :bridge:test :app:testDebugUnitTest :app:assembleDebug :app:lintDebug
```

From the repository root, with the same Java and Android environment:

```sh
npm run test:android-relay
```

The native bridge test starts the real Takeoff relay, connects through the app's Java WebSocket client, supplies synthetic SDK hardware frames, and verifies pairing, axis direction/scaling, physical capture and landing events, acknowledgements, and suspension on remote loss. It does not prove USB/SDK behavior on a physical phone.

The Android UI tests inflate the camera screen with the app's actual merged DJI and scanner resources, verify the correct scanner view classes, and check that scanning targets this screen. The bridge tests also verify that the enable explanation identifies missing remote readings, laptop telemetry, centering, and held buttons without allowing a blocked enable request. Regression checks hold a single centered hardware reading for 15 seconds using connection checks alone, hold a nonzero stick position without extra hardware callbacks, and verify that disconnects, stopped monitoring, and delayed callbacks cannot revive old readings.

Companion UI checks verify separate Setup and Controls navigation without rebuilding the hardware views, all three stick-mode labels, and unclipped labels on narrow phones, larger text, and landscape. Native Android renders are saved in `artifacts/android/ui-preview/` for visual inspection.

The Android build and lint check pass. Lint reports that DJI's `libDJICSDKCommon.so` lacks 16 KB alignment and flags certificate-trust implementations inside the SDK's bundled Bouncy Castle dependency. These are vendor-library findings; the companion's relay client uses OkHttp's default certificate and hostname verification. Phones using 16 KB memory pages must be checked before this SDK build can be considered supported.

For the physical acceptance check, verify both stick extremes and center, all three mappings, dial direction, each available button, pause/resume, unplugging USB, locking the phone, changing Wi-Fi, and revoking the pairing link. Begin with a grounded simulator; keep the real aircraft off. If the SDK registers but the monitor receives no data, record the phone model, Android version, remote firmware, and status message so the SDK/firmware combination can be investigated.

## References

- [DJI MSDK 4.18 and its official sample](https://github.com/dji-sdk/Mobile-SDK-Android)
- [DJI SDK integration and app-key registration](https://developer.dji.com/mobile-sdk/documentation/application-development-workflow/workflow-integrate.html)
- [DJI hardware-state API](https://developer.dji.com/api-reference/android-api/Components/RemoteController/DJIRemoteController_DJIRCHardwareState.html)
- [Existing RC-N1 Android-to-computer bridge demonstrating aircraft-off operation](https://gitee.com/NaN01/dji_vjoy/blob/master/README.md)

This project uses the SDK API directly; it does not incorporate code from that third-party bridge. DJI's SDK and transitive native libraries retain their own licenses. This companion app is not affiliated with DJI.
