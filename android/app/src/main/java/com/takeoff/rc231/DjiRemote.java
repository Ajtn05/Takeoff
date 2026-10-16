package com.takeoff.rc231;

import android.content.Context;
import android.hardware.usb.UsbAccessory;
import android.hardware.usb.UsbManager;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import com.takeoff.bridge.RcSample;
import dji.common.Stick;
import dji.common.error.DJIError;
import dji.common.error.DJISDKError;
import dji.common.remotecontroller.HardwareState;
import dji.sdk.base.BaseComponent;
import dji.sdk.base.BaseProduct;
import dji.sdk.products.Aircraft;
import dji.sdk.remotecontroller.RemoteController;
import dji.sdk.sdkmanager.DJISDKInitEvent;
import dji.sdk.sdkmanager.DJISDKManager;

/** Reads the remote only. No aircraft, gimbal, camera or firmware commands are sent. */
final class DjiRemote {
    interface Listener {
        void status(String text);
        void connection(boolean remoteConnected, boolean aircraftConnected, long checkedAt);
        void sample(RcSample sample);
    }

    private final Context context;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Listener listener;
    private RemoteController remote;
    private boolean registering, registered;
    private String status = "Tap Connect remote to start DJI.";
    private final Runnable poll = new Runnable() {
        @Override public void run() {
            if (registered) bindRemote();
            handler.postDelayed(this, 250);
        }
    };

    DjiRemote(Context context) { this.context = context.getApplicationContext(); }

    String status() { return status; }

    void listen(Listener listener) {
        this.listener = listener;
        handler.removeCallbacks(poll);
        if (listener != null) {
            listener.status(status);
            handler.post(poll);
        }
    }

    void start() {
        if (!BuildConfig.HAS_DJI_KEY) {
            updateStatus("DJI app key needed. See the setup guide for com.takeoff.rc231."); return;
        }
        if (registered) { DJISDKManager.getInstance().startConnectionToProduct(); bindRemote(); return; }
        if (registering) return;
        registering = true;
        updateStatus("Registering with DJI. Keep the phone online for first setup…");
        new Thread(() -> DJISDKManager.getInstance().registerApp(context, new DJISDKManager.SDKManagerCallback() {
            @Override public void onRegister(DJIError error) {
                handler.post(() -> {
                    registering = false;
                    registered = error == DJISDKError.REGISTRATION_SUCCESS;
                    if (registered) {
                        updateStatus("DJI ready. Connect the remote using its phone cable.");
                        DJISDKManager.getInstance().startConnectionToProduct();
                        bindRemote();
                    } else updateStatus("DJI registration failed: " + (error == null ? "unknown error" : error.getDescription()));
                });
            }
            @Override public void onProductDisconnect() { handler.post(DjiRemote.this::bindRemote); }
            @Override public void onProductConnect(BaseProduct product) { handler.post(DjiRemote.this::bindRemote); }
            @Override public void onProductChanged(BaseProduct product) { handler.post(DjiRemote.this::bindRemote); }
            @Override public void onComponentChange(BaseProduct.ComponentKey key, BaseComponent oldComponent, BaseComponent newComponent) {
                handler.post(DjiRemote.this::bindRemote);
            }
            @Override public void onInitProcess(DJISDKInitEvent event, int progress) { }
            @Override public void onDatabaseDownloadProgress(long current, long total) { }
        }), "takeoff-dji-registration").start();
    }

    private void updateStatus(String text) {
        status = text;
        if (listener != null) listener.status(text);
    }

    private boolean aircraftConnected() {
        BaseProduct product = DJISDKManager.getInstance().getProduct();
        return product instanceof Aircraft && ((Aircraft) product).getFlightController() != null &&
                ((Aircraft) product).getFlightController().isConnected();
    }

    private boolean remoteConnected(RemoteController source) {
        if (source == null || !source.isConnected()) return false;
        // The USB accessory list reflects unplugging even before DJI updates its cached connection flag.
        UsbManager usb = (UsbManager) context.getSystemService(Context.USB_SERVICE);
        UsbAccessory[] accessories = usb == null ? null : usb.getAccessoryList();
        return accessories != null && accessories.length > 0;
    }

    private void bindRemote() {
        BaseProduct product = DJISDKManager.getInstance().getProduct();
        // An aircraft may be disconnected while its RemoteController component remains connected.
        RemoteController next = product instanceof Aircraft ? ((Aircraft) product).getRemoteController() : null;
        if (next != remote) {
            if (listener != null) listener.connection(false, false, SystemClock.elapsedRealtime());
            if (remote != null) remote.setHardwareStateCallback(null);
            remote = next;
            if (remote != null) {
                final RemoteController source = remote;
                remote.setHardwareStateCallback(state -> {
                    long receivedAt = SystemClock.elapsedRealtime();
                    Stick left = state.getLeftStick(), right = state.getRightStick();
                    if (left == null || right == null) return;
                    RcSample sample = new RcSample(left.getHorizontalPosition(), left.getVerticalPosition(),
                            right.getHorizontalPosition(), right.getVerticalPosition(), state.getLeftDial(),
                            pressed(state.getShutterButton()) || pressed(state.getShootPhotoAndRecordButton()),
                            pressed(state.getRecordButton()), pressed(state.getGoHomeButton()),
                            pressed(state.getPauseButton()), pressed(state.getFunctionButton()) || pressed(state.getC1Button()),
                            state.getFlightModeSwitch() == null ? "Unknown" : state.getFlightModeSwitch().name(), receivedAt);
                    handler.post(() -> {
                        if (listener == null || source != remote) return;
                        listener.connection(remoteConnected(source), aircraftConnected(), receivedAt);
                        listener.sample(sample);
                    });
                });
            }
        }
        if (listener != null) {
            boolean connected = remoteConnected(remote);
            listener.connection(connected, aircraftConnected(), SystemClock.elapsedRealtime());
            if (connected) updateStatus("RC231 connected. Move the sticks to check the monitor.");
        }
    }

    private static boolean pressed(HardwareState.Button button) { return button != null && button.isClicked(); }
}
