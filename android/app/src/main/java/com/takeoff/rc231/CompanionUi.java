package com.takeoff.rc231;

import android.app.Activity;
import android.content.Context;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.text.style.RelativeSizeSpan;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.widget.TextView;
import android.widget.ViewFlipper;
import com.takeoff.bridge.Controls;
import com.takeoff.bridge.RcSample;
import org.json.JSONObject;
import java.util.Locale;

/** Presentation and in-place navigation; switching tabs never restarts the USB connection. */
final class CompanionUi {
    private final Activity activity;
    private final Runnable setupOpened;
    private int mode = 2;
    private String flightState = "";
    private String leftHorizontal, leftVertical, rightHorizontal, rightVertical;

    CompanionUi(Activity activity, Runnable setupOpened) {
        this.activity = activity;
        this.setupOpened = setupOpened;
        activity.findViewById(R.id.tab_setup).setOnClickListener(view -> showSetup());
        activity.findViewById(R.id.controls_setup).setOnClickListener(view -> showSetup());
        activity.findViewById(R.id.tab_controls).setOnClickListener(view -> showControls());
        activity.findViewById(R.id.open_controls).setOnClickListener(view -> showControls());
        activity.findViewById(R.id.toggle_diagnostics).setOnClickListener(view -> {
            View panel = activity.findViewById(R.id.diagnostics_panel);
            boolean open = panel.getVisibility() != View.VISIBLE;
            panel.setVisibility(open ? View.VISIBLE : View.GONE);
            text(R.id.toggle_diagnostics, open ? "Hide remote diagnostics" : "Show remote diagnostics");
        });
        mode(2);
        select(0);
    }

    boolean controlsVisible() { return ((ViewFlipper) activity.findViewById(R.id.screens)).getDisplayedChild() == 1; }
    void showControls() { select(1); }
    void showSetup() {
        boolean wasControls = controlsVisible();
        select(0);
        if (wasControls) setupOpened.run();
    }
    void restoreScreen(boolean controls) { select(controls ? 1 : 0); }
    private void select(int screen) {
        dismissKeyboard();
        ((ViewFlipper) activity.findViewById(R.id.screens)).setDisplayedChild(screen);
        activity.findViewById(R.id.tab_setup).setSelected(screen == 0);
        activity.findViewById(R.id.tab_controls).setSelected(screen == 1);
        activity.findViewById(R.id.tab_setup).setContentDescription(screen == 0 ? "Setup, selected" : "Setup");
        activity.findViewById(R.id.tab_controls).setContentDescription(screen == 1 ? "Controls, selected" : "Controls");
    }

    void dismissKeyboard() {
        View focused = activity.getCurrentFocus();
        if (focused != null) {
            InputMethodManager keyboard = (InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE);
            if (keyboard != null) keyboard.hideSoftInputFromWindow(focused.getWindowToken(), 0);
        }
        activity.findViewById(R.id.app_shell).requestFocus();
    }

    void mode(int mode) {
        this.mode = mode;
        leftHorizontal = mode == 3 ? "Strafe" : "Yaw";
        leftVertical = mode == 2 ? "Climb" : "Forward";
        rightHorizontal = mode == 3 ? "Yaw" : "Strafe";
        rightVertical = mode == 2 ? "Forward" : "Climb";
        text(R.id.left_axes, (mode == 2 ? "Altitude" : "Forward") + " / " + leftHorizontal.toLowerCase(Locale.US));
        text(R.id.right_axes, (mode == 2 ? "Forward" : "Altitude") + " / " + rightHorizontal.toLowerCase(Locale.US));
        caption();
        ((StickView) activity.findViewById(R.id.left_stick)).axes("Left", leftHorizontal, leftVertical);
        ((StickView) activity.findViewById(R.id.right_stick)).axes("Right", rightHorizontal, rightVertical);
    }

    void hardware(RcSample sample, Controls controls, boolean available) {
        ((StickView) activity.findViewById(R.id.left_stick)).position(sample == null ? 0 : sample.leftX, sample == null ? 0 : sample.leftY, available);
        ((StickView) activity.findViewById(R.id.right_stick)).position(sample == null ? 0 : sample.rightX, sample == null ? 0 : sample.rightY, available);
        ((DialView) activity.findViewById(R.id.camera_dial)).position(controls.gimbal, available);
        if (sample == null) {
            for (int id : new int[]{R.id.left_values, R.id.right_values, R.id.dial_value}) text(id, "No readings");
            text(R.id.raw_values, "Sticks · no readings");
            text(R.id.raw_dial_value, "Camera dial · no readings");
            text(R.id.button_values, "Buttons · no readings");
            text(R.id.switch_value, "Mode switch · no readings");
            text(R.id.mapped_values, "Flight inputs · unavailable");
            return;
        }
        text(R.id.left_values, axisValues(leftHorizontal, leftVertical, sample.leftX, sample.leftY));
        text(R.id.right_values, axisValues(rightHorizontal, rightVertical, sample.rightX, sample.rightY));
        text(R.id.dial_value, String.format(Locale.US, "%s · %.0f%%", controls.gimbal == 0 ? "Centered" : controls.gimbal > 0 ? "Tilt up" : "Tilt down", Math.abs(controls.gimbal * 100)));
        text(R.id.raw_values, String.format(Locale.US, "Left  X %d / Y %d\nRight X %d / Y %d", sample.leftX, sample.leftY, sample.rightX, sample.rightY));
        text(R.id.raw_dial_value, "Camera dial · " + sample.dial);
        text(R.id.switch_value, "Mode switch · " + sample.flightMode);
        text(R.id.button_values, "Buttons · " + (sample.shutter ? "Shutter " : "") + (sample.record ? "Record " : "") +
                (sample.goHome ? "Return " : "") + (sample.pause ? "Pause " : "") + (sample.function ? "Fn " : "") +
                (sample.buttonsReleased() ? "released" : ""));
        text(R.id.mapped_values, String.format(Locale.US, "Mode %d\nClimb %.0f%% · Yaw %.0f%%\nForward %.0f%% · Strafe %.0f%%\nCamera tilt %.0f%%",
                mode, controls.climb * 100, controls.yaw * 100, controls.forward * 100, controls.right * 100, controls.gimbal * 100));
    }
    private String axisValues(String horizontal, String vertical, int x, int y) {
        return String.format(Locale.US, "%s %.0f%%\n%s %.0f%%", vertical, RcSample.axis(y) * 100, horizontal, RcSample.axis(x) * 100);
    }

    void connection(boolean remoteReady, boolean paired, boolean active, boolean enabling) {
        text(R.id.connection_summary, active ? "CONTROLS LIVE" : paired ? "LAPTOP PAIRED" : "RC231 REMOTE");
        text(R.id.controls_state, active ? "LIVE" : enabling ? "ENABLING" : paired && remoteReady ? "READY" : paired ? "PAIRED" : "OFFLINE");
        ((TextView) activity.findViewById(R.id.controls_state)).setTextColor(activity.getColor(active || (paired && remoteReady) ? R.color.accent : R.color.text_secondary));
        activity.findViewById(R.id.controls_setup).setVisibility(!paired || !remoteReady ? View.VISIBLE : View.GONE);
        text(R.id.laptop_status, paired ? "Laptop paired. Open Controls when you’re ready." : "Laptop not paired.");
        ((TextView) activity.findViewById(R.id.laptop_status)).setTextColor(activity.getColor(paired ? R.color.accent : R.color.text_secondary));
        text(R.id.enable, active || enabling ? "Pause controls" : "Enable controls");
    }

    void telemetry(JSONObject status) {
        String mode = status == null ? "" : status.optString("mode");
        boolean paused = status != null && status.optBoolean("paused", true);
        flightState = status == null ? "" : paused ? "Game paused" :
                "grounded".equals(mode) ? "On the ground" : "flying".equals(mode) ? "In flight" : "Flight ended";
        caption();
        metric(R.id.altitude_value, status == null ? "—" : String.format(Locale.US, "%.1f m", status.optDouble("altitude")));
        metric(R.id.speed_value, status == null ? "—" : String.format(Locale.US, "%.1f m/s", status.optDouble("speed")));
        metric(R.id.heading_value, status == null ? "—" : String.format(Locale.US, "%.0f°", status.optDouble("heading")));
        metric(R.id.camera_value, status == null ? "—" : String.format(Locale.US, "%.0f°", status.optDouble("gimbal")));
    }

    private void caption() { text(R.id.mode_caption, "RC231 · Mode " + mode + (flightState.isEmpty() ? "" : " · " + flightState)); }
    private void metric(int id, String value) {
        TextView view = activity.findViewById(id);
        if (view.getText().toString().equals(value)) return;
        SpannableString label = new SpannableString(value);
        int unit = value.indexOf(' ');
        if (unit < 0) unit = value.indexOf('°');
        if (unit >= 0) {
            label.setSpan(new RelativeSizeSpan(.65f), unit, value.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            label.setSpan(new ForegroundColorSpan(activity.getColor(R.color.text_secondary)), unit, value.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        }
        view.setText(label);
    }

    void text(int id, String value) {
        TextView view = activity.findViewById(id);
        if (!view.getText().toString().equals(value)) view.setText(value);
    }
}
