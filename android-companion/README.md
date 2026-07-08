# TaxiBo 4-in-One FlyTaxi Adapter

Prototype Android screen reader for `com.flytaxi`.

This version is intentionally read-only. It captures the screen only after Android's MediaProjection consent, runs bundled Chinese OCR, and displays the extracted text. It does not tap or accept orders.

## Mi 8 test

1. Tap the **TaxiBo 4-in-One Scan** icon on the phone.
2. Select **Start FlyTaxi reader**.
3. Allow **Display over other apps** when MIUI opens that setting.
4. Return to the scanner and select **Start FlyTaxi reader** again.
5. Select **Start now** in Android's screen-capture dialog.
6. FlyTaxi opens. Keep a complete unlocked order visible.
7. Drag the floating **SCAN** button to a convenient position, then tap it.
8. The default server is `https://taxi-bo.onrender.com`; change it only for local testing.
9. The adapter converts the OCR result into pickup, destination, fare, waiting time, and lock status, then sends it to TaxiBo 4-in-One.
10. On the tablet, choose **Verify & open FlyTaxi**. Acceptance remains manual in FlyTaxi.
11. Return to the scanner and select **Stop reader** when finished.

On MIUI, overlay permission may also appear under **Settings > Apps > Manage apps > TaxiBo 4-in-One Scan > Other permissions > Display pop-up windows while running in the background**.

## Build

Open `android-companion` in Android Studio and build the debug app, or use Gradle with Android Studio's Java runtime:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
gradle :app:assembleDebug
```

Debug APK:

```text
app/build/outputs/apk/debug/app-debug.apk
```
