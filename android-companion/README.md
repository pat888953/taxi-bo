# Taxi BO FlyTaxi Companion

Prototype Android screen reader for `com.flytaxi`.

This version is intentionally read-only. It captures the screen only after Android's MediaProjection consent, runs bundled Chinese OCR, and displays the extracted text. It does not tap or accept orders.

## Mi 8 test

1. Open **Taxi BO Companion**.
2. Select **Start FlyTaxi reader**.
3. Allow **Display over other apps** when MIUI opens that setting.
4. Return to the companion and select **Start FlyTaxi reader** again.
5. Select **Start now** in Android's screen-capture dialog.
6. FlyTaxi opens. Keep a complete unlocked order visible.
7. Tap the floating **SCAN** button.
8. Tap the Taxi BO notification to review the OCR result.
9. Return to the companion and select **Stop reader** when finished.

On MIUI, overlay permission may also appear under **Settings > Apps > Manage apps > Taxi BO Companion > Other permissions > Display pop-up windows while running in the background**.

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
