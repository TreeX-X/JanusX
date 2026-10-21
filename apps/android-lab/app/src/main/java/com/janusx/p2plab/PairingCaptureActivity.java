package com.janusx.p2plab;

import android.os.Bundle;
import com.journeyapps.barcodescanner.CaptureActivity;
import com.journeyapps.barcodescanner.DecoratedBarcodeView;
import com.journeyapps.barcodescanner.camera.CameraSettings;

/** Large QR codes need a generous crop and continuous focus on a nearby screen. */
public final class PairingCaptureActivity extends CaptureActivity {
    private DecoratedBarcodeView scanner;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        // CaptureManager initializes camera settings from the Intent during super.onCreate().
        CameraSettings camera = scanner.getCameraSettings();
        camera.setAutoFocusEnabled(true);
        camera.setContinuousFocusEnabled(true);
        scanner.setCameraSettings(camera);
    }

    @Override protected DecoratedBarcodeView initializeContent() {
        DecoratedBarcodeView view = super.initializeContent();
        scanner = view;
        view.getBarcodeView().setFramingRectSize(null);
        view.getBarcodeView().setMarginFraction(0.02);
        view.getViewFinder().setLaserVisibility(false);
        return view;
    }
}
