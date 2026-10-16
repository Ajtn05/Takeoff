package com.takeoff.rc231;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.usb.UsbManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.View;
import android.view.WindowManager;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.Spinner;
import android.widget.TextView;
import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;
import com.takeoff.bridge.BridgeSession;
import com.takeoff.bridge.InputGate;
import com.takeoff.bridge.PairingLink;
import com.takeoff.bridge.RcSample;
import com.takeoff.bridge.RelayClient;
import dji.sdk.sdkmanager.DJISDKManager;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

public final class MainActivity extends Activity {
    private static final int SDK_PERMISSIONS = 10;
    private static final int CAMERA_PERMISSION = 11;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final InputGate gate = new InputGate();
    private BridgeSession session;
    private RelayClient relay;
    private DjiRemote remote;
    private CompanionUi ui;
    private PairingLink link;
    private boolean foreground;
    private long lastRender;
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (!foreground) return;
            session.tick();
            long now = SystemClock.elapsedRealtime();
            if (now - lastRender >= 100) { render(); lastRender = now; }
            handler.postDelayed(this, 50);
        }
    };

    @Override public void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setContentView(R.layout.activity_main);
        remote = ((TakeoffApplication) getApplication()).remote();
        relay = new RelayClient(handler::post, new RelayClient.Listener() {
            @Override public void opened() { session.open(link); text(R.id.pairing_feedback, "Pairing with the laptop…"); render(); }
            @Override public void received(JSONObject message) {
                try { session.receive(message); }
                catch (Exception error) {
                    session.suspend("Invalid laptop response. Pair the laptop again.");
                    relay.close(); session.disconnected("Invalid laptop response. Pair the laptop again.");
                }
                if ("welcome".equals(message.optString("type"))) text(R.id.pairing_feedback, "");
                render();
            }
            @Override public void closed(String reason) { session.disconnected(reason); text(R.id.pairing_feedback, reason); render(); }
        });
        session = new BridgeSession(gate, relay::send, SystemClock::elapsedRealtime);
        ui = new CompanionUi(this, () -> {
            if (session.ready() || session.enabling()) session.suspend("Controls paused while you’re in Setup. Return to Controls to enable again.");
            render();
        });
        findViewById(R.id.connect_remote).setOnClickListener(view -> requestSdkPermissions());
        findViewById(R.id.pair).setOnClickListener(view -> pair());
        findViewById(R.id.scan).setOnClickListener(view -> scan());
        Spinner modes = findViewById(R.id.stick_mode);
        ArrayAdapter<String> modeOptions = new ArrayAdapter<>(this, R.layout.item_stick_mode,
                new String[]{"Mode 1", "Mode 2 · Default", "Mode 3"});
        modeOptions.setDropDownViewResource(R.layout.item_stick_mode_dropdown);
        modes.setAdapter(modeOptions);
        modes.setSelection(getPreferences(MODE_PRIVATE).getInt("mode", 2) - 1);
        CheckBox reverse = findViewById(R.id.invert_dial);
        reverse.setChecked(getPreferences(MODE_PRIVATE).getBoolean("reverse-dial", false));
        modes.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> parent, View view, int position, long id) { configure(); }
            @Override public void onNothingSelected(AdapterView<?> parent) { }
        });
        reverse.setOnCheckedChangeListener((button, checked) -> configure());
        findViewById(R.id.enable).setOnClickListener(view -> {
            if (session.ready() || session.enabling()) session.suspend("Controls paused. Center the sticks to enable again.");
            else {
                String blocked = session.enableBlockReason();
                session.enable();
                if (blocked != null) {
                    String explanation = blocked;
                    if (!gate.fresh(SystemClock.elapsedRealtime())) explanation += "\n\n" + remote.status();
                    AlertDialog.Builder dialog = new AlertDialog.Builder(this)
                            .setTitle("Before enabling controls").setMessage(explanation);
                    if (session.paired() && gate.sample() == null) {
                        dialog.setPositiveButton("Connect remote", (alert, which) -> requestSdkPermissions())
                                .setNegativeButton("Close", null);
                    } else dialog.setPositiveButton("OK", null);
                    dialog.show();
                }
            }
            render();
        });
        bindAction(R.id.takeoff, "takeoff"); bindAction(R.id.land, "land");
        bindAction(R.id.capture, "capture"); bindAction(R.id.resume, "resume");
        if (savedState != null) {
            ((EditText) findViewById(R.id.pair_url)).setText(savedState.getString("pair-url", ""));
            ui.restoreScreen(savedState.getBoolean("controls-screen", false));
        }
        handleIntent(getIntent());
        render();
    }

    private void configure() {
        session.suspend("Stick settings changed. Center the sticks and enable controls.");
        int mode = ((Spinner) findViewById(R.id.stick_mode)).getSelectedItemPosition() + 1;
        boolean reverse = ((CheckBox) findViewById(R.id.invert_dial)).isChecked();
        gate.configure(mode, reverse);
        ui.mode(mode);
        getPreferences(MODE_PRIVATE).edit().putInt("mode", mode).putBoolean("reverse-dial", reverse).apply();
        render();
    }

    private void bindAction(int id, String action) { findViewById(id).setOnClickListener(view -> { session.action(action); render(); }); }

    private void requestSdkPermissions() {
        if (!BuildConfig.HAS_DJI_KEY) { remote.start(); return; }
        List<String> permissions = new ArrayList<>();
        for (String permission : new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION})
            if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) permissions.add(permission);
        if (Build.VERSION.SDK_INT <= 32 && checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED)
            permissions.add(Manifest.permission.READ_EXTERNAL_STORAGE);
        if (Build.VERSION.SDK_INT <= 28 && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED)
            permissions.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
        if (permissions.isEmpty()) remote.start();
        else requestPermissions(permissions.toArray(new String[0]), SDK_PERMISSIONS);
    }

    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request == SDK_PERMISSIONS) remote.start();
        if (request == CAMERA_PERMISSION) {
            if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) launchScanner();
            else cameraPermissionHelp();
        }
    }

    private void scan() {
        session.suspend("Scanning a pairing code. Enable controls afterward.");
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) launchScanner();
        else if (getPreferences(MODE_PRIVATE).getBoolean("camera-requested", false) &&
                !shouldShowRequestPermissionRationale(Manifest.permission.CAMERA)) cameraPermissionHelp();
        else {
            getPreferences(MODE_PRIVATE).edit().putBoolean("camera-requested", true).apply();
            requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION);
        }
    }

    private void launchScanner() {
        try {
            new IntentIntegrator(this).setCaptureActivity(PairingScanActivity.class)
                    .setDesiredBarcodeFormats(IntentIntegrator.QR_CODE)
                    .setPrompt("Scan Pair phone in Takeoff on the laptop")
                    .setBeepEnabled(false).setOrientationLocked(false).initiateScan();
        } catch (ActivityNotFoundException error) {
            session.notice("Cannot open the scanner. Paste the phone link to pair the laptop.");
            render();
        }
    }

    private void cameraPermissionHelp() {
        session.notice("Camera permission is off. Allow camera access in app settings, or paste the phone link.");
        render();
        new AlertDialog.Builder(this).setTitle("Allow camera access")
                .setMessage("Open app settings and allow Camera, then tap Scan QR code again. You can also paste the phone link without using the camera.")
                .setPositiveButton("Open settings", (dialog, which) -> startActivity(new Intent(
                        Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))))
                .setNegativeButton("Close", null).show();
    }

    private void pair() {
        try {
            PairingLink next = PairingLink.parse(((EditText) findViewById(R.id.pair_url)).getText().toString());
            ui.dismissKeyboard();
            session.suspend("Pairing a laptop. Enable controls after pairing.");
            relay.close();
            link = next;
            session.disconnected("Connecting to the laptop…");
            text(R.id.pairing_feedback, "Connecting to the laptop…");
            relay.connect(link);
        } catch (IllegalArgumentException error) {
            session.notice(error.getMessage()); text(R.id.pairing_feedback, error.getMessage()); render();
        }
    }

    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); setIntent(intent); handleIntent(intent); }
    private void handleIntent(Intent intent) {
        if (Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null) {
            ui.showSetup();
            ((EditText) findViewById(R.id.pair_url)).setText(intent.getData().toString());
            // Pairing credentials never enable controls automatically.
        }
        if (BuildConfig.HAS_DJI_KEY && UsbManager.ACTION_USB_ACCESSORY_ATTACHED.equals(intent.getAction())) {
            Intent attached = new Intent(DJISDKManager.USB_ACCESSORY_ATTACHED);
            attached.setPackage(getPackageName()); sendBroadcast(attached);
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        IntentResult scan = IntentIntegrator.parseActivityResult(request, result, data);
        if (scan != null && scan.getContents() != null) {
            ((EditText) findViewById(R.id.pair_url)).setText(scan.getContents());
            pair();
        } else if (scan != null) {
            session.notice("Scan closed. Tap Scan QR code again, or paste the complete phone link.");
            text(R.id.pairing_feedback, session.message());
            render();
        }
    }

    @Override protected void onResume() {
        super.onResume(); foreground = true;
        remote.listen(new DjiRemote.Listener() {
            @Override public void status(String text) { text(R.id.sdk_status, text); }
            @Override public void connection(boolean connected, boolean aircraftConnected, long checkedAt) {
                gate.connection(connected, aircraftConnected, checkedAt);
                if (!gate.fresh(SystemClock.elapsedRealtime())) session.suspend(gate.reason(SystemClock.elapsedRealtime()));
            }
            @Override public void sample(RcSample sample) { gate.accept(sample); }
        });
        handler.post(tick);
    }
    @Override protected void onPause() {
        foreground = false; handler.removeCallbacks(tick);
        session.suspend("Phone app left the screen. Enable controls to resume.");
        gate.connection(false, false, SystemClock.elapsedRealtime()); remote.listen(null);
        super.onPause();
    }
    @Override protected void onDestroy() { relay.shutdown(); super.onDestroy(); }
    @Override protected void onSaveInstanceState(Bundle state) {
        state.putString("pair-url", ((EditText) findViewById(R.id.pair_url)).getText().toString());
        state.putBoolean("controls-screen", ui.controlsVisible());
        super.onSaveInstanceState(state);
    }
    @Override public void onBackPressed() {
        if (ui.controlsVisible()) ui.showSetup();
        else super.onBackPressed();
    }

    private void text(int id, String value) {
        TextView view = findViewById(id);
        if (!view.getText().toString().equals(value)) view.setText(value);
        if (id == R.id.pairing_feedback) view.setVisibility(value.isEmpty() ? View.GONE : View.VISIBLE);
    }
    private void render() {
        long now = SystemClock.elapsedRealtime();
        RcSample sample = gate.sample();
        text(R.id.remote_status, gate.reason(now));
        ui.hardware(sample, gate.controls(), gate.fresh(now));
        ui.connection(gate.fresh(now), session.paired(), session.ready(), session.enabling());
        text(R.id.message, session.message());
        String blocked = session.enableBlockReason();
        text(R.id.enable_reason, session.ready() ? "Controls active." : blocked == null ? "Remote and laptop ready." : blocked);
        findViewById(R.id.message).setVisibility(session.ready() || session.enabling() ||
                (session.paired() && !session.message().equals(blocked)) ? View.VISIBLE : View.GONE);
        JSONObject status = session.telemetry();
        String mode = status == null ? "" : status.optString("mode");
        boolean paused = status == null || status.optBoolean("paused", true);
        boolean active = session.ready() && gate.fresh(now);
        findViewById(R.id.takeoff).setEnabled(active && "grounded".equals(mode));
        findViewById(R.id.land).setEnabled(active && !paused && "flying".equals(mode));
        findViewById(R.id.capture).setEnabled(active && !paused && !"collided".equals(mode));
        findViewById(R.id.resume).setEnabled(active && paused && !"collided".equals(mode) && gate.canEnable(now));
        ui.telemetry(status);
    }
}
