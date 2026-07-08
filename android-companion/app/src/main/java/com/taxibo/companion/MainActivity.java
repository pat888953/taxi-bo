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
import android.widget.EditText;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final int REQUEST_OVERLAY = 100;
    private static final int REQUEST_CAPTURE = 101;
    private static final int REQUEST_NOTIFICATIONS = 102;

    private MediaProjectionManager projectionManager;
    private TextView statusView;
    private TextView resultView;
    private TextView structuredView;
    private EditText serverUrlView;

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

        TextView eyebrow = label("TAXIBO 4-IN-ONE · FLYTAXI ADAPTER", 12, Color.rgb(13, 91, 68));
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

        TextView serverLabel = label("TAXIBO 4-IN-ONE SERVER", 12, Color.rgb(13, 91, 68));
        serverLabel.setTypeface(null, android.graphics.Typeface.BOLD);
        content.addView(serverLabel, spacedParams());
        serverUrlView = new EditText(this);
        serverUrlView.setSingleLine(true);
        serverUrlView.setText(getSharedPreferences("taxibo_adapter", MODE_PRIVATE).getString("server_url", "https://taxi-bo.onrender.com"));
        serverUrlView.setHint("http://tablet-ip:8000");
        content.addView(serverUrlView, compactParams());

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

        TextView structuredLabel = label("STRUCTURED OFFER", 12, Color.rgb(13, 91, 68));
        structuredLabel.setTypeface(null, android.graphics.Typeface.BOLD);
        content.addView(structuredLabel, spacedParams());
        structuredView = label("Scan FlyTaxi to build an order card.", 17, Color.rgb(22, 35, 29));
        structuredView.setPadding(dp(14), dp(14), dp(14), dp(14));
        structuredView.setBackgroundColor(Color.WHITE);
        content.addView(structuredView, compactParams());

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
            StructuredOffer offer = parseOffer(text);
            structuredView.setText(
                "FLYTAXI\nPickup: " + emptyFallback(offer.pickup) +
                "\nDestination: " + emptyFallback(offer.destination) +
                "\nFare: " + emptyFallback(offer.fare) +
                "\nWaiting: " + emptyFallback(offer.waitingTime) +
                "\nStatus: " + offer.lockStatus
            );
            if (!offer.destination.isBlank()) sendOffer(offer, text);
        }
        statusView.setText("OCR finished. Review the captured FlyTaxi text below.");
    }

    private StructuredOffer parseOffer(String text) {
        String[] lines = text.replace("\r", "").split("\n");
        StructuredOffer offer = new StructuredOffer();
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].trim();
            String lower = line.toLowerCase();
            if (offer.pickup.isBlank() && matchesLabel(lower, "pickup", "pick up", "from", "上車", "上车")) offer.pickup = valueAfterLabel(line, lines, i);
            if (offer.destination.isBlank() && matchesLabel(lower, "destination", "dropoff", "drop off", "to", "目的地", "下車", "下车")) offer.destination = valueAfterLabel(line, lines, i);
            if (offer.fare.isBlank()) {
                Matcher fare = Pattern.compile("(?:[$£€]|USD|HKD|MOP|RMB|CNY)\\s?\\d+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?\\s?(?:USD|HKD|MOP|RMB|CNY)", Pattern.CASE_INSENSITIVE).matcher(line);
                if (fare.find()) offer.fare = fare.group();
            }
            if (offer.waitingTime.isBlank()) {
                Matcher wait = Pattern.compile("\\b\\d+\\s?(?:min|mins|minutes|分鐘|分钟)\\b", Pattern.CASE_INSENSITIVE).matcher(line);
                if (wait.find()) offer.waitingTime = wait.group();
            }
        }
        String lowerText = text.toLowerCase();
        offer.lockStatus = lowerText.contains("locked") || lowerText.contains("已鎖") || lowerText.contains("已锁") ? "locked" : "unlocked";
        offer.capturedAt = Instant.now().toString();
        offer.fingerprint = sha256("FlyTaxi|" + offer.pickup + "|" + offer.destination + "|" + offer.fare + "|" + offer.capturedAt);
        return offer;
    }

    private boolean matchesLabel(String line, String... labels) {
        for (String label : labels) if (line.startsWith(label + ":") || line.startsWith(label + " ") || line.equals(label)) return true;
        return false;
    }

    private String valueAfterLabel(String line, String[] lines, int index) {
        int colon = Math.max(line.indexOf(':'), line.indexOf('：'));
        if (colon >= 0 && colon + 1 < line.length()) return line.substring(colon + 1).trim();
        return index + 1 < lines.length ? lines[index + 1].trim() : "";
    }

    private void sendOffer(StructuredOffer offer, String rawText) {
        String baseUrl = serverUrlView.getText().toString().trim().replaceAll("/+$", "");
        getSharedPreferences("taxibo_adapter", MODE_PRIVATE).edit().putString("server_url", baseUrl).apply();
        statusView.setText("Sending structured FlyTaxi offer to TaxiBo…");
        new Thread(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("source", "FlyTaxi"); body.put("pickup", offer.pickup); body.put("destination", offer.destination);
                body.put("fare", offer.fare); body.put("waitingTime", offer.waitingTime); body.put("lockStatus", offer.lockStatus);
                body.put("capturedAt", offer.capturedAt); body.put("fingerprint", offer.fingerprint); body.put("rawText", rawText);
                HttpURLConnection connection = (HttpURLConnection) new URL(baseUrl + "/api/incoming-order").openConnection();
                connection.setRequestMethod("POST"); connection.setRequestProperty("Content-Type", "application/json");
                connection.setConnectTimeout(5000); connection.setReadTimeout(5000); connection.setDoOutput(true);
                try (OutputStream output = connection.getOutputStream()) { output.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
                int code = connection.getResponseCode(); connection.disconnect();
                runOnUiThread(() -> statusView.setText(code < 300 ? "Sent to TaxiBo 4-in-One. Acceptance stays manual." : "TaxiBo rejected the offer (HTTP " + code + ")."));
            } catch (Exception error) {
                runOnUiThread(() -> statusView.setText("Could not reach TaxiBo: " + error.getMessage()));
            }
        }).start();
    }

    private String sha256(String value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(); for (byte item : bytes) result.append(String.format("%02x", item)); return result.toString();
        } catch (Exception error) { return String.valueOf(value.hashCode()); }
    }

    private String emptyFallback(String value) { return value.isBlank() ? "Not recognized" : value; }

    private static class StructuredOffer {
        String pickup = "", destination = "", fare = "", waitingTime = "", lockStatus = "unknown", capturedAt = "", fingerprint = "";
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
