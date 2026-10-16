package com.takeoff.rc231;

import android.app.Application;
import android.content.Intent;
import com.google.zxing.integration.android.IntentIntegrator;
import com.journeyapps.barcodescanner.BarcodeView;
import com.journeyapps.barcodescanner.DecoratedBarcodeView;
import com.journeyapps.barcodescanner.ViewfinderView;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(application = Application.class, sdk = 34)
public class PairingScanTest {
    @Test public void cameraScreenInflatesWithActualMergedDjiAndScannerResources() {
        Intent scan = new Intent("com.google.zxing.client.android.SCAN")
                .putExtra("SCAN_FORMATS", "QR_CODE")
                .putExtra("SCAN_ORIENTATION_LOCKED", false)
                .putExtra("BEEP_ENABLED", false);
        try (ActivityController<PairingScanActivity> controller =
                     Robolectric.buildActivity(PairingScanActivity.class, scan).create()) {
            DecoratedBarcodeView scanner = controller.get().findViewById(R.id.pairing_scanner);
            assertNotNull(scanner);
            assertEquals(BarcodeView.class, scanner.getBarcodeView().getClass());
            assertEquals(ViewfinderView.class, scanner.getViewFinder().getClass());
            assertNotNull(scanner.getStatusView());
        }
    }

    @Test public void scannerIntentTargetsTheAppCameraScreen() {
        try (ActivityController<android.app.Activity> controller =
                     Robolectric.buildActivity(android.app.Activity.class).create()) {
            Intent intent = new IntentIntegrator(controller.get())
                    .setCaptureActivity(PairingScanActivity.class).createScanIntent();
            assertEquals(PairingScanActivity.class.getName(), intent.getComponent().getClassName());
        }
    }
}
