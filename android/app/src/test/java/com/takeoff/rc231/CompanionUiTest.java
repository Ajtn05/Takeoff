package com.takeoff.rc231;

import android.app.Activity;
import android.app.Application;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Bundle;
import android.view.View;
import android.widget.TextView;
import android.widget.ArrayAdapter;
import android.widget.Spinner;
import android.widget.ScrollView;
import com.takeoff.bridge.RcSample;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import java.io.File;
import java.io.FileOutputStream;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(application = Application.class, sdk = 34, qualifiers = "w360dp-h800dp-mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class CompanionUiTest {
    public static class ScreenActivity extends Activity {
        @Override protected void onCreate(Bundle state) {
            setTheme(R.style.AppTheme);
            super.onCreate(state);
            setContentView(R.layout.activity_main);
            ArrayAdapter<String> options = new ArrayAdapter<>(this, R.layout.item_stick_mode,
                    new String[]{"Mode 1", "Mode 2 · Default", "Mode 3"});
            options.setDropDownViewResource(R.layout.item_stick_mode_dropdown);
            Spinner modes = findViewById(R.id.stick_mode);
            modes.setAdapter(options); modes.setSelection(1);
        }
    }

    @Test public void setupAndFlightHaveSeparatePagesWithoutRecreatingControls() {
        try (ActivityController<ScreenActivity> controller = Robolectric.buildActivity(ScreenActivity.class).setup()) {
            Activity activity = controller.get();
            int[] setupOpened = {0};
            CompanionUi ui = new CompanionUi(activity, () -> setupOpened[0]++);
            View physicalStick = activity.findViewById(R.id.left_stick);
            assertFalse(ui.controlsVisible());
            assertEquals(View.VISIBLE, activity.findViewById(R.id.setup_screen).getVisibility());
            assertEquals(View.GONE, activity.findViewById(R.id.controls_screen).getVisibility());
            activity.findViewById(R.id.open_controls).performClick();
            assertTrue(ui.controlsVisible());
            assertTrue(activity.findViewById(R.id.tab_controls).isSelected());
            activity.findViewById(R.id.tab_setup).performClick();
            assertFalse(ui.controlsVisible()); assertEquals(1, setupOpened[0]);
            assertSame(physicalStick, activity.findViewById(R.id.left_stick));
            activity.findViewById(R.id.toggle_diagnostics).performClick();
            assertEquals(View.VISIBLE, activity.findViewById(R.id.diagnostics_panel).getVisibility());
        }
    }

    @Test public void labelsFollowTheThreePhysicalStickMappings() {
        try (ActivityController<ScreenActivity> controller = Robolectric.buildActivity(ScreenActivity.class).setup()) {
            Activity activity = controller.get();
            CompanionUi ui = new CompanionUi(activity, () -> {});
            RcSample sample = new RcSample(660, -660, 340, -340, 0, false, false, false, false, false, "POSITION_TWO", 100);
            for (int mode = 1; mode <= 3; mode++) {
                ui.mode(mode); ui.hardware(sample, sample.controls(mode, false), true);
                assertEquals(mode == 2 ? "Altitude / yaw" : mode == 3 ? "Forward / strafe" : "Forward / yaw", label(activity, R.id.left_axes));
                assertEquals(mode == 2 ? "Forward / strafe" : mode == 3 ? "Altitude / yaw" : "Altitude / strafe", label(activity, R.id.right_axes));
                assertTrue(label(activity, R.id.left_values).contains(mode == 2 ? "Climb -100%" : "Forward -100%"));
                assertTrue(activity.findViewById(R.id.left_stick).getContentDescription().toString().contains(mode == 3 ? "Strafe" : "Yaw"));
            }
        }
    }

    @Test public void previewSetupAndFlightAtPhoneWidth() throws Exception {
        try (ActivityController<ScreenActivity> controller = Robolectric.buildActivity(ScreenActivity.class).setup()) {
            Activity activity = controller.get();
            CompanionUi ui = new CompanionUi(activity, () -> {});
            snapshot(activity, "setup", 360, 800);
            ((ScrollView) activity.findViewById(R.id.setup_screen)).fullScroll(View.FOCUS_DOWN);
            snapshot(activity, "setup-preferences", 360, 800);
            ui.showControls();
            ui.connection(true, true, false, false);
            RcSample center = new RcSample(0, 0, 0, 0, 0, false, false, false, false, false, "POSITION_TWO", 100);
            ui.hardware(center, center.controls(2, false), true);
            ui.text(R.id.enable_reason, "Remote and laptop ready. Center the sticks, then enable controls.");
            ui.telemetry(new JSONObject().put("mode", "grounded").put("paused", false)
                    .put("altitude", 0).put("speed", 0).put("heading", 90).put("gimbal", -12));
            activity.findViewById(R.id.message).setVisibility(View.GONE);
            snapshot(activity, "controls", 360, 800);
            assertFits(activity, R.id.tab_setup, R.id.tab_controls, R.id.takeoff, R.id.land, R.id.capture,
                    R.id.resume, R.id.left_axes, R.id.right_axes, R.id.altitude_value, R.id.speed_value);
        }
    }

    @Test @Config(qualifiers = "w320dp-h740dp-mdpi")
    public void narrowPhoneKeepsEveryActionLabelReadable() throws Exception {
        try (ActivityController<ScreenActivity> controller = Robolectric.buildActivity(ScreenActivity.class).setup()) {
            Activity activity = controller.get();
            CompanionUi ui = new CompanionUi(activity, () -> {});
            ui.showControls(); ui.connection(true, true, true, false);
            ui.mode(3);
            RcSample center = new RcSample(0, 0, 0, 0, 0, false, false, false, false, false, "POSITION_TWO", 100);
            ui.hardware(center, center.controls(3, false), true);
            ui.telemetry(new JSONObject().put("mode", "grounded").put("paused", false)
                    .put("altitude", 0).put("speed", 0).put("heading", 90).put("gimbal", -12));
            ui.text(R.id.enable_reason, "Controls active.");
            activity.findViewById(R.id.message).setVisibility(View.GONE);
            snapshot(activity, "controls-narrow", 320, 740);
            assertFits(activity, R.id.tab_controls, R.id.takeoff, R.id.land, R.id.capture, R.id.resume, R.id.left_axes, R.id.right_axes);
        }
    }

    @Test @Config(qualifiers = "w800dp-h400dp-land-mdpi")
    public void landscapePlacesFlightActionsBesideTheStickMonitor() throws Exception {
        try (ActivityController<ScreenActivity> controller = Robolectric.buildActivity(ScreenActivity.class).setup()) {
            Activity activity = controller.get();
            CompanionUi ui = new CompanionUi(activity, () -> {});
            ui.showControls(); ui.mode(1); ui.connection(true, true, true, false);
            RcSample reading = new RcSample(100, 0, 0, 0, 340, false, false, false, false, false, "POSITION_TWO", 100);
            ui.hardware(reading, reading.controls(1, false), true);
            ui.telemetry(new JSONObject().put("mode", "flying").put("paused", false)
                    .put("altitude", 12.4).put("speed", 3.6).put("heading", 90).put("gimbal", -12));
            ui.text(R.id.enable_reason, "Controls active.");
            activity.findViewById(R.id.message).setVisibility(View.GONE);
            for (int id : new int[]{R.id.land, R.id.capture}) activity.findViewById(id).setEnabled(true);
            snapshot(activity, "controls-landscape", 800, 400);
            assertFits(activity, R.id.tab_controls, R.id.takeoff, R.id.land, R.id.capture, R.id.resume, R.id.left_axes, R.id.right_axes);
            int[] stick = new int[2], capture = new int[2];
            activity.findViewById(R.id.left_stick).getLocationOnScreen(stick);
            activity.findViewById(R.id.capture).getLocationOnScreen(capture);
            assertTrue(capture[0] > stick[0]);
            assertTrue(capture[1] + activity.findViewById(R.id.capture).getHeight() <= 400);
        }
    }

    @Test public void largerTextKeepsActionAndAxisLabelsReadable() throws Exception {
        RuntimeEnvironment.setFontScale(1.3f);
        try (ActivityController<ScreenActivity> controller = Robolectric.buildActivity(ScreenActivity.class).setup()) {
            Activity activity = controller.get();
            CompanionUi ui = new CompanionUi(activity, () -> {});
            ui.showControls(); ui.mode(2);
            snapshot(activity, "controls-large-text", 360, 800);
            assertFits(activity, R.id.tab_setup, R.id.tab_controls, R.id.takeoff, R.id.land, R.id.capture, R.id.resume, R.id.left_axes, R.id.right_axes);
        }
    }

    private static String label(Activity activity, int id) { return ((TextView) activity.findViewById(id)).getText().toString(); }
    private static void assertFits(Activity activity, int... ids) {
        for (int id : ids) {
            TextView text = activity.findViewById(id);
            assertNotNull("Label must have a layout: " + text.getText(), text.getLayout());
            int last = text.getLayout().getLineCount() - 1;
            assertEquals("Label must not be clipped: " + text.getText(), text.length(), text.getLayout().getLineEnd(last));
            assertEquals("Label must not be ellipsized: " + text.getText(), 0, text.getLayout().getEllipsisCount(last));
        }
    }
    private static void snapshot(Activity activity, String name, int width, int height) throws Exception {
        View root = activity.findViewById(R.id.app_shell);
        root.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY));
        root.layout(0, 0, width, height);
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        root.draw(new Canvas(bitmap));
        File directory = new File(System.getProperty("takeoff.previewDir"));
        assertTrue(directory.isDirectory() || directory.mkdirs());
        try (FileOutputStream stream = new FileOutputStream(new File(directory, name + ".png"))) {
            assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream));
        }
        bitmap.recycle();
    }
}
