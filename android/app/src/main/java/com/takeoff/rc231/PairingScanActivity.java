package com.takeoff.rc231;

import com.journeyapps.barcodescanner.CaptureActivity;
import com.journeyapps.barcodescanner.DecoratedBarcodeView;

/** DJI bundles different classes under the same default ZXing layout names. */
public final class PairingScanActivity extends CaptureActivity {
    @Override protected DecoratedBarcodeView initializeContent() {
        setContentView(R.layout.activity_pairing_scan);
        return findViewById(R.id.pairing_scanner);
    }
}
