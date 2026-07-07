package com.taxibo.companion;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.Toast;

import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;

import java.nio.ByteBuffer;

public class FlyTaxiCaptureService extends Service {
    public static final String EXTRA_RESULT_CODE = "result_code";
    public static final String EXTRA_RESULT_DATA = "result_data";
    public static final String EXTRA_OCR_TEXT = "ocr_text";
    public static final String ACTION_OCR_RESULT = "com.taxibo.companion.OCR_RESULT";
    public static final String PREFS_NAME = "flytaxi_capture";
    public static final String PREF_LAST_OCR = "last_ocr";

    private static final String CHANNEL_ID = "flytaxi_reader";
    private static final int NOTIFICATION_ID = 4201;

    private MediaProjection projection;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;
    private HandlerThread captureThread;
    private Handler captureHandler;
    private WindowManager windowManager;
    private Button scanButton;
    private TextRecognizer recognizer;
    private boolean processing;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        recognizer = TextRecognition.getClient(new ChineseTextRecognizerOptions.Builder().build());
        captureThread = new HandlerThread("FlyTaxiCapture");
        captureThread.start();
        captureHandler = new Handler(captureThread.getLooper());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (projection != null) {
            return START_NOT_STICKY;
        }

        int resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0);
        Intent resultData;
        if (Build.VERSION.SDK_INT >= 33) {
            resultData = intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent.class);
        } else {
            resultData = intent.getParcelableExtra(EXTRA_RESULT_DATA);
        }

        if (resultCode == 0 || resultData == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        Notification notification = buildNotification("Reader active. Use the floating SCAN button.", null);
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        MediaProjectionManager manager = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        projection = manager.getMediaProjection(resultCode, resultData);
        projection.registerCallback(new MediaProjection.Callback() {
            @Override
            public void onStop() {
                stopSelf();
            }
        }, captureHandler);

        createCaptureSurface();
        showScanOverlay();
        return START_NOT_STICKY;
    }

    private void createCaptureSurface() {
        DisplayMetrics metrics = getResources().getDisplayMetrics();
        int width = metrics.widthPixels;
        int height = metrics.heightPixels;
        int density = metrics.densityDpi;
        imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 3);
        virtualDisplay = projection.createVirtualDisplay(
            "FlyTaxiReader",
            width,
            height,
            density,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader.getSurface(),
            null,
            captureHandler
        );
    }

    private void showScanOverlay() {
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        scanButton = new Button(this);
        scanButton.setText("SCAN");
        scanButton.setTextSize(14);
        scanButton.setTextColor(0xFFFFFFFF);
        scanButton.setBackgroundColor(0xEE0D5B44);
        scanButton.setOnClickListener(view -> scanVisibleScreen());

        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            dp(92),
            dp(52),
            Build.VERSION.SDK_INT >= 26
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.TOP | Gravity.END;
        params.x = dp(12);
        params.y = dp(180);
        windowManager.addView(scanButton, params);
    }

    private void scanVisibleScreen() {
        if (processing) {
            return;
        }
        processing = true;
        scanButton.setEnabled(false);
        scanButton.setAlpha(0f);
        captureHandler.postDelayed(() -> acquireScreen(0), 300);
    }

    private void acquireScreen(int attempt) {
        Image image = imageReader.acquireLatestImage();
        if (image == null) {
            if (attempt < 8) {
                captureHandler.postDelayed(() -> acquireScreen(attempt + 1), 120);
            } else {
                finishScan("", "No screen frame was available. Try SCAN again.");
            }
            return;
        }

        Bitmap bitmap;
        try {
            bitmap = imageToBitmap(image);
        } finally {
            image.close();
        }

        recognizer.process(InputImage.fromBitmap(bitmap, 0))
            .addOnSuccessListener(text -> {
                String result = text.getText().trim();
                finishScan(result, result.isEmpty() ? "No readable text found." : "FlyTaxi text captured.");
            })
            .addOnFailureListener(error -> finishScan("", "OCR failed: " + error.getMessage()))
            .addOnCompleteListener(task -> bitmap.recycle());
    }

    private Bitmap imageToBitmap(Image image) {
        Image.Plane plane = image.getPlanes()[0];
        ByteBuffer buffer = plane.getBuffer();
        int pixelStride = plane.getPixelStride();
        int rowStride = plane.getRowStride();
        int rowPadding = rowStride - pixelStride * image.getWidth();
        int paddedWidth = image.getWidth() + rowPadding / pixelStride;

        Bitmap padded = Bitmap.createBitmap(paddedWidth, image.getHeight(), Bitmap.Config.ARGB_8888);
        padded.copyPixelsFromBuffer(buffer);
        Bitmap cropped = Bitmap.createBitmap(padded, 0, 0, image.getWidth(), image.getHeight());
        if (cropped != padded) {
            padded.recycle();
        }
        return cropped;
    }

    private void finishScan(String text, String message) {
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            .edit()
            .putString(PREF_LAST_OCR, text)
            .apply();

        Intent broadcast = new Intent(ACTION_OCR_RESULT);
        broadcast.setPackage(getPackageName());
        broadcast.putExtra(EXTRA_OCR_TEXT, text);
        sendBroadcast(broadcast);

        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        manager.notify(NOTIFICATION_ID, buildNotification(message + " Tap to review.", text));

        captureHandler.post(() -> {
            processing = false;
            if (scanButton != null) {
                scanButton.setAlpha(1f);
                scanButton.setEnabled(true);
            }
            Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
        });
    }

    private Notification buildNotification(String message, String ocrText) {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (ocrText != null) {
            openIntent.putExtra(EXTRA_OCR_TEXT, ocrText);
        }
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setContentTitle("Taxi BO FlyTaxi reader")
            .setContentText(message)
            .setStyle(new Notification.BigTextStyle().bigText(message))
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build();
    }

    private void createNotificationChannel() {
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "FlyTaxi screen reader",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Shows when Taxi BO is reading a user-approved FlyTaxi screen capture.");
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        manager.createNotificationChannel(channel);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    public void onDestroy() {
        if (scanButton != null && windowManager != null) {
            windowManager.removeView(scanButton);
        }
        if (virtualDisplay != null) {
            virtualDisplay.release();
        }
        if (imageReader != null) {
            imageReader.close();
        }
        if (projection != null) {
            projection.stop();
            projection = null;
        }
        if (recognizer != null) {
            recognizer.close();
        }
        if (captureThread != null) {
            captureThread.quitSafely();
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
