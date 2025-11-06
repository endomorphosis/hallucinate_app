# Capacitor Setup Guide

This guide explains how to set up and build the Hallucinate App for iOS and Android using Capacitor.

## Overview

Capacitor allows you to turn the web-based Hallucinate App into native mobile applications for iOS and Android while maintaining a single codebase.

## Prerequisites

### For iOS Development
- **macOS** with Xcode 14+ installed
- **Node.js** 18.x or 20.x
- **CocoaPods**: `sudo gem install cocoapods`
- **Xcode Command Line Tools**: `xcode-select --install`
- **Apple Developer Account** (for device testing and App Store submission)

### For Android Development
- **Node.js** 18.x or 20.x
- **Android Studio** with SDK 26+ (Android 8.0+)
- **JDK 17** (included with Android Studio)
- **Gradle** (included with Android Studio)

### Common
- **Python 3.12+** (for backend components)
- Git

## Initial Setup

### 1. Install Dependencies

```bash
# Install Node dependencies (includes Capacitor)
npm install

# This will install:
# - @capacitor/cli
# - @capacitor/core
# - @capacitor/ios
# - @capacitor/android
```

### 2. Build Web Assets

```bash
# Build the web version of the app
npm run build:web

# This creates the www/ directory with all web assets
```

### 3. Add Platforms

```bash
# Add iOS platform
npm run cap:add:ios

# Add Android platform
npm run cap:add:android

# Or add both at once
npx cap add ios
npx cap add android
```

This creates:
- `ios/` directory with Xcode project
- `android/` directory with Android Studio project

## iOS Development

### Setup

1. **Install CocoaPods Dependencies**:
```bash
cd ios/App
pod install
cd ../..
```

2. **Open in Xcode**:
```bash
npm run cap:open:ios
# or
npx cap open ios
```

### Configuration

Edit `ios/App/App/Info.plist` to configure:

```xml
<!-- Camera access (if needed) -->
<key>NSCameraUsageDescription</key>
<string>This app needs camera access for AR features</string>

<!-- Microphone access (if needed) -->
<key>NSMicrophoneUsageDescription</key>
<string>This app needs microphone access for voice features</string>

<!-- Allow arbitrary loads for development (remove in production) -->
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
</dict>
```

### Code Signing

1. Open Xcode
2. Select the App target
3. Go to "Signing & Capabilities"
4. Select your Development Team
5. Xcode will automatically manage provisioning profiles

### Build and Run

#### On Simulator
```bash
# Build and run on iOS simulator
npm run cap:run:ios

# Or manually in Xcode
# Select a simulator → Press Cmd+R
```

#### On Device
1. Connect your iPhone/iPad via USB
2. Trust the computer on your device
3. In Xcode, select your device from the destination dropdown
4. Press Cmd+R to build and run

### Create Release Build

```bash
# Build for release
npm run cap:build:ios

# Or manually in Xcode:
# Product → Archive
# Then use Organizer to export IPA
```

### TestFlight Distribution

1. In Xcode, select Product → Archive
2. Once archived, click "Distribute App"
3. Select "App Store Connect"
4. Upload to TestFlight
5. Add testers in App Store Connect

## Android Development

### Setup

1. **Open in Android Studio**:
```bash
npm run cap:open:android
# or
npx cap open android
```

2. **Sync Gradle** (Android Studio will prompt automatically)

3. **Install SDK Components** (if prompted)

### Configuration

Edit `android/app/src/main/AndroidManifest.xml`:

```xml
<!-- Camera permission (if needed) -->
<uses-permission android:name="android.permission.CAMERA" />

<!-- Microphone permission (if needed) -->
<uses-permission android:name="android.permission.RECORD_AUDIO" />

<!-- Internet permission (already included) -->
<uses-permission android:name="android.permission.INTERNET" />
```

### Build and Run

#### On Emulator
```bash
# Build and run on Android emulator
npm run cap:run:android

# Or manually in Android Studio
# Select an emulator → Press Shift+F10
```

#### On Device
1. Enable Developer Options on your Android device:
   - Go to Settings → About Phone
   - Tap "Build Number" 7 times
2. Enable USB Debugging in Developer Options
3. Connect device via USB
4. In Android Studio, select your device
5. Press Shift+F10 to build and run

### Create Release Build

```bash
# Build APK
npm run cap:build:android

# Or manually in Android Studio:
# Build → Generate Signed Bundle / APK
```

### Create Signed APK

1. In Android Studio: Build → Generate Signed Bundle / APK
2. Select "APK"
3. Create or select a keystore
4. Enter keystore credentials
5. Select "release" build variant
6. Click "Finish"

### Create App Bundle for Play Store

1. Build → Generate Signed Bundle / APK
2. Select "Android App Bundle"
3. Use the same keystore
4. The AAB file will be in `android/app/release/`

## Development Workflow

### Making Changes

1. **Modify web code** in `hallucinate_app/` directory

2. **Rebuild web assets**:
```bash
npm run build:web
```

3. **Sync changes to mobile**:
```bash
npm run cap:sync
# This runs: npx cap sync
# Updates both iOS and Android with latest web assets
```

4. **Rebuild in Xcode/Android Studio**

### Live Reload (Development)

For faster development, use Capacitor's live reload:

1. **Start a local server**:
```bash
# In one terminal, start your development server
npm start  # or your dev server command
```

2. **Update capacitor.config.ts**:
```typescript
const config: CapacitorConfig = {
  appId: 'com.endomorphosis.hallucinate',
  appName: 'Hallucinate App',
  webDir: 'www',
  server: {
    url: 'http://YOUR_LOCAL_IP:3000',  // Your dev server
    cleartext: true
  }
};
```

3. **Rebuild the app** in Xcode/Android Studio

4. **Changes will live reload** when you save files

> **Important**: Remove the `server` config before production builds!

## Testing WebGPU/WebNN

### iOS

WebGPU is available on iOS 18+. Test with:

```javascript
if ('gpu' in navigator) {
  console.log('WebGPU is available!');
  const adapter = await navigator.gpu.requestAdapter();
  // Use WebGPU for ML inference
}
```

### Android

WebGPU is available on Chrome 121+ (Android 8+). Test with:

```javascript
if ('gpu' in navigator) {
  console.log('WebGPU is available!');
  // Use WebGPU for hardware-accelerated ML
}
```

WebNN is experimental. Enable in Chrome flags:
- `chrome://flags/#enable-experimental-web-platform-features`

## Native Plugins

### Add a Capacitor Plugin

```bash
npm install @capacitor/camera
npx cap sync
```

### Use in Code

```javascript
import { Camera } from '@capacitor/camera';

const image = await Camera.getPhoto({
  quality: 90,
  allowEditing: false,
  resultType: CameraResultType.Uri
});
```

### Popular Plugins

- **Camera**: `@capacitor/camera`
- **Filesystem**: `@capacitor/filesystem`
- **Storage**: `@capacitor/preferences`
- **Geolocation**: `@capacitor/geolocation`
- **Push Notifications**: `@capacitor/push-notifications`
- **Core ML (iOS)**: `@capacitor-community/coreml`
- **TensorFlow Lite**: Custom plugin or bridge

## Troubleshooting

### iOS Build Fails

**Problem**: CocoaPods dependencies not found
```bash
cd ios/App
pod install
pod update
cd ../..
```

**Problem**: Code signing error
- Check your Apple Developer account in Xcode
- Ensure Bundle ID is unique
- Enable "Automatically manage signing"

**Problem**: WebGPU not working
- Requires iOS 18+
- Test on real device (simulators may have limited support)

### Android Build Fails

**Problem**: Gradle sync failed
```bash
cd android
./gradlew clean
./gradlew build
cd ..
```

**Problem**: SDK not found
- Open Android Studio
- Tools → SDK Manager
- Install required SDK versions (API 26+)

**Problem**: WebGPU not working
- Requires Chrome 121+ WebView
- Device must support Vulkan
- Test on Android 13+ for best results

### General Issues

**Problem**: Web assets not updating
```bash
npm run build:web
npm run cap:sync
# Then rebuild in Xcode/Android Studio
```

**Problem**: Capacitor version mismatch
```bash
npm install @capacitor/cli@latest @capacitor/core@latest
npm install @capacitor/ios@latest @capacitor/android@latest
npx cap sync
```

## CI/CD

The repository includes a GitHub Actions workflow for automated builds:

```yaml
# .github/workflows/release-mobile.yml
```

### Trigger a Mobile Release

```bash
# Create and push a version tag
git tag v1.0.4
git push origin v1.0.4

# The workflow will:
# 1. Build iOS xcarchive
# 2. Build Android APK and AAB
# 3. Create GitHub Release with artifacts
```

### Manual Trigger

From GitHub:
1. Go to Actions tab
2. Select "Build Mobile Apps (Capacitor)"
3. Click "Run workflow"
4. Enter version tag

## App Store Submission

### iOS - App Store Connect

1. **Archive** the app in Xcode (Product → Archive)
2. **Validate** the archive (check for issues)
3. **Upload** to App Store Connect
4. **Complete app information** in App Store Connect
5. **Submit for review**

Requirements:
- App icons (all sizes)
- Screenshots (all device sizes)
- Privacy policy URL
- App description and keywords
- Age rating

### Android - Google Play Console

1. **Create signed AAB** (Build → Generate Signed Bundle)
2. **Upload to Play Console** (Create new release)
3. **Complete store listing**:
   - App description
   - Screenshots
   - Privacy policy
   - Content rating
4. **Submit for review**

## Best Practices

### Performance

1. **Optimize web assets**:
   - Minify JavaScript/CSS
   - Compress images
   - Use lazy loading

2. **Use WebGPU for ML**:
   - Better performance than WebGL
   - Native GPU acceleration

3. **Cache resources**:
   - Use service workers
   - Cache ML models locally

### Security

1. **HTTPS only** in production
2. **Validate user input**
3. **Use secure storage** for sensitive data
4. **Implement proper authentication**

### Testing

1. **Test on real devices** (not just simulators/emulators)
2. **Test different OS versions**:
   - iOS 14, 15, 16, 17, 18
   - Android 8, 9, 10, 11, 12, 13, 14
3. **Test different screen sizes**
4. **Test offline functionality**

## Resources

### Official Documentation
- [Capacitor Docs](https://capacitorjs.com/docs)
- [iOS Developer Docs](https://developer.apple.com/documentation/)
- [Android Developer Docs](https://developer.android.com/docs)

### WebGPU/WebNN
- [WebGPU Specification](https://www.w3.org/TR/webgpu/)
- [WebNN Specification](https://www.w3.org/TR/webnn/)
- [Can I Use WebGPU](https://caniuse.com/webgpu)

### Community
- [Capacitor Community](https://github.com/capacitor-community)
- [Stack Overflow - Capacitor](https://stackoverflow.com/questions/tagged/capacitor)

## Next Steps

1. **Set up development environment**
2. **Run `npm install` and `npm run build:web`**
3. **Add iOS/Android platforms**
4. **Open in Xcode/Android Studio**
5. **Build and test on devices**
6. **Customize for your needs**
7. **Submit to app stores**

For questions or issues, refer to the [MOBILE_PLATFORM_GUIDE.md](MOBILE_PLATFORM_GUIDE.md) for additional context on mobile development strategies and WebNN/WebGPU support.
