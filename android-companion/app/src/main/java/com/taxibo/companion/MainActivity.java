package com.taxibo.companion;

import android.Manifest;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

public class MainActivity extends Activity {
    private static final int REQUEST_OVERLAY = 100;
    private static final int REQUEST_CAPTURE = 101;
    private static final int REQUEST_NOTIFICATIONS = 102;

    private MediaProjectionManager projectionManager;
    private TextView statusView;
    private TextView resultView;

    private final BroadcastReceiver resultReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (FlyTaxiCaptureService.ACTION_OCR_RESULT.equals(intent.getAction())) {
                showResult(intent.getStringExtra(FlyTaxiCaptureService.EXTRA_OCR_TEXT));
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        projectionManager = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        setContentView(buildContent());
        requestNotificationPermissionIfNeeded();
        showSavedResult();
    }

    @Override
    protected void onStart() {
        super.onStart();
        IntentFilter filter = new IntentFilter(FlyTaxiCaptureService.ACTION_OCR_RESULT);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(resultReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(resultReceiver, filter);
        }
    }

    @Override
    protected void onStop() {
        unregisterReceiver(resultReceiver);
        super.onStop();
    }

    @Override
    protected void onResume() {
        super.onResume();
        showSavedResult();
    }

    private View buildContent() {
        int padding = dp(20);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(padding, padding, padding, padding);
        content.setBackgroundColor(Color.rgb(243, 247, 244));

        TextView eyebrow = label("FLYTAXI TEST COMPANION", 12, Color.rgb(13, 91, 68));
        eyebrow.setTypeface(null, android.graphics.Typeface.BOLD);
        content.addView(eyebrow);

        TextView title = label("Capture an unlocked order", 27, Color.rgb(22, 35, 29));
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        title.setPadding(0, dp(5), 0, dp(8));
        content.addView(title);

        TextView explanation = label(
            "Start the reader, allow screen capture, then use the floating SCAN button while FlyTaxi is visible. This prototype reads text only and never accepts an order.",
            16,
            Color.rgb(74, 91, 82)
        );
        explanation.setLineSpacing(0, 1.15f);
        content.addView(explanation);

        Button startButton = actionButton("Start FlyTaxi reader", true);
        startButton.setOnClickListener(view -> startReader());
        content.addView(startButton, spacedParams());

        Button openButton = actionButton("Open FlyTaxi", false);
        openButton.setOnClickListener(view -> openFlyTaxi());
        content.addView(openButton, compactParams());

        Button stopButton = actionButton("Stop reader", false);
        stopButton.setOnClickListener(view -> {
            stopService(new Intent(this, FlyTaxiCaptureService.class));
            statusView.setText("Reader stopped.");
        });
        content.addView(stopButton, compactParams());

        statusView = label("Reader is not running.", 15, Color.rgb(74, 91, 82));
        statusView.setPadding(dp(12), dp(12), dp(12), dp(12));
        statusView.setBackgroundColor(Color.WHITE);
        content.addView(statusView, spacedParams());

        TextView resultLabel = label("LAST OCR RESULT", 12, Color.rgb(13, 91, 68));
        resultLabel.setTypeface(null, android.graphics.Typeface.BOLD);
        content.addView(resultLabel, spacedParams());

        resultView = label("No screen has been scanned yet.", 16, Color.rgb(22, 35, 29));
        resultView.setTextIsSelectable(true);
        resultView.setPadding(dp(14), dp(14), dp(14), dp(14));
        resultView.setBackgroundColor(Color.WHITE);
        content.addView(resultView, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ));

        ScrollView scrollView = new ScrollView(this);
        scrollView.addView(content);
        return scrollView;
    }

    private void startReader() {
        if (!Settings.canDrawOverlays(this)) {
            statusView.setText("Allow Display over other apps, then return and press Start again.");
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getPackageName())
            );
            startActivityForResult(intent, REQUEST_OVERLAY);
            return;
        }

        statusView.setText("Waiting for Android screen-capture permission...");
        startActivityForResult(projectionManager.createScreenCaptureIntent(), REQUEST_CAPTURE);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == REQUEST_OVERLAY) {
            statusView.setText(Settings.canDrawOverlays(this)
                ? "Overlay allowed. Press Start FlyTaxi reader again."
                : "Overlay permission is still required for the SCAN button.");
            return;
        }

        if (requestCode != REQUEST_CAPTURE) {
            return;
        }

        if (resultCode != RESULT_OK || data == null) {
            statusView.setText("Screen capture was cancelled.");
            return;
        }

        Intent serviceIntent = new Intent(this, FlyTaxiCaptureService.class);
        serviceIntent.putExtra(FlyTaxiCaptureService.EXTRA_RESULT_CODE, resultCode);
        serviceIntent.putExtra(FlyTaxiCaptureService.EXTRA_RESULT_DATA, data);
        startForegroundService(serviceIntent);
        statusView.setText("Reader running. Open FlyTaxi and tap the floating SCAN button.");
        openFlyTaxi();
    }

    private void openFlyTaxi() {
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage("com.flytaxi");
        if (launchIntent == null) {
            statusView.setText("FlyTaxi (com.flytaxi) is not installed on this phone.");
            return;
        }
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(launchIntent);
    }

    private void showSavedResult() {
        if (resultView == null) {
            return;
        }
        String text = getSharedPreferences(FlyTaxiCaptureService.PREFS_NAME, MODE_PRIVATE)
            .getString(FlyTaxiCaptureService.PREF_LAST_OCR, "");
        if (!text.isBlank()) {
            showResult(text);
        }
    }

    private void showResult(String text) {
        if (text == null || text.isBlank()) {
            resultView.setText("No readable text was found. Keep the complete unlocked order visible and scan again.");
        } else {
            resultView.setText(text);
        }
        statusView.setText("OCR finished. Review the captured FlyTaxi text below.");
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQUEST_NOTIFICATIONS);
        }
    }

    private Button actionButton(String text, boolean primary) {
        Button button = new Button(this);
        button.setText(text);
        button.setTextSize(16);
        button.setAllCaps(false);
        button.setTextColor(primary ? Color.WHITE : Color.rgb(22, 35, 29));
        button.setBackgroundColor(primary ? Color.rgb(13, 91, 68) : Color.WHITE);
        button.setMinHeight(dp(52));
        return button;
    }

    private TextView label(String text, int size, int color) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(size);
        view.setTextColor(color);
        return view;
    }

    private LinearLayout.LayoutParams spacedParams() {
        LinearLayout.LayoutParams params = compactParams();
        params.topMargin = dp(16);
        return params;
    }

    private LinearLayout.LayoutParams compactParams() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.topMargin = dp(8);
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
