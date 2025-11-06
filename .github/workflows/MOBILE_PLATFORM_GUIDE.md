# Mobile Platform Support Guide

## Overview

This document explains mobile platform support options for the Hallucinate App, which is built using Electron (a desktop framework).

## Current Status

**Electron Framework**: The Hallucinate App is currently built with Electron, which is designed exclusively for desktop platforms:
- ✅ Windows (x64, ARM64)
- ✅ macOS (Intel x64, Apple Silicon ARM64)
- ✅ Linux (x64, ARM64)
- ✅ RedHat Enterprise Linux (x64, ARM64)

**Mobile Platforms**: Electron does not support mobile platforms natively:
- ❌ iOS (iPhone, iPad)
- ❌ Android (phones, tablets)

## Options for Mobile Support

### Option 1: Capacitor (Recommended for Web-Based Apps)

**Capacitor** allows you to package web applications for iOS and Android while maintaining a single codebase.

#### Setup Steps:

1. **Install Capacitor**:
```bash
npm install @capacitor/core @capacitor/cli
npm install @capacitor/ios @capacitor/android
```

2. **Initialize Capacitor**:
```bash
npx cap init hallucinate_app com.endomorphosis.hallucinate
```

3. **Add Platforms**:
```bash
npx cap add ios
npx cap add android
```

4. **Configure Build Output**:
Update `capacitor.config.ts`:
```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.endomorphosis.hallucinate',
  appName: 'Hallucinate App',
  webDir: 'dist', // Your built web app directory
  bundledWebRuntime: false
};

export default config;
```

5. **Build and Sync**:
```bash
npm run build  # Build your web app
npx cap sync   # Sync with native projects
```

6. **Open in Native IDEs**:
```bash
# iOS (requires macOS with Xcode)
npx cap open ios

# Android (requires Android Studio)
npx cap open android
```

#### CI/CD Integration:

Add to `.github/workflows/release-mobile.yml`:
```yaml
name: Build Mobile Apps

on:
  push:
    tags: ['v*.*.*']
  workflow_dispatch:

jobs:
  build-ios:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20.x'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build web app
        run: npm run build
      
      - name: Sync Capacitor
        run: npx cap sync ios
      
      - name: Build iOS app
        run: |
          cd ios/App
          xcodebuild -workspace App.xcworkspace \
                     -scheme App \
                     -configuration Release \
                     archive -archivePath App.xcarchive
      
      - name: Export IPA
        run: |
          cd ios/App
          xcodebuild -exportArchive \
                     -archivePath App.xcarchive \
                     -exportPath export \
                     -exportOptionsPlist ExportOptions.plist
      
      - name: Upload IPA
        uses: actions/upload-artifact@v4
        with:
          name: ios-app
          path: ios/App/export/*.ipa
  
  build-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20.x'
      
      - name: Set up JDK
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build web app
        run: npm run build
      
      - name: Sync Capacitor
        run: npx cap sync android
      
      - name: Build Android APK
        run: |
          cd android
          ./gradlew assembleRelease
      
      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: android-app
          path: android/app/build/outputs/apk/release/*.apk
      
      - name: Build Android AAB (for Play Store)
        run: |
          cd android
          ./gradlew bundleRelease
      
      - name: Upload AAB
        uses: actions/upload-artifact@v4
        with:
          name: android-bundle
          path: android/app/build/outputs/bundle/release/*.aab
```

#### Limitations:

- **Native Features**: Limited to web APIs + Capacitor plugins
- **Performance**: May not match fully native apps
- **Size**: Larger app size due to embedded web runtime
- **UI**: Must use web-based UI (HTML/CSS/JS)

### Option 2: React Native (For Native Mobile Experience)

If you need true native performance and UI, consider **React Native**:

#### Advantages:
- Native performance
- Native UI components
- Large ecosystem of packages
- Shared business logic with web

#### Disadvantages:
- Requires rewriting UI in React Native
- Separate codebase from Electron
- Different testing requirements
- Platform-specific code needed

#### Setup:
```bash
npx react-native init HallucinateAppMobile
```

Then share:
- Business logic
- API calls
- State management
- Utilities

### Option 3: Flutter (Cross-Platform Native)

**Flutter** provides another native option:

#### Advantages:
- Single codebase for iOS and Android
- High performance
- Rich UI framework
- Growing ecosystem

#### Disadvantages:
- Different language (Dart)
- Complete rewrite required
- No code sharing with Electron

### Option 4: Progressive Web App (PWA)

**PWA** approach allows mobile access via web browser:

#### Advantages:
- No app store submission
- Instant updates
- Single codebase
- Works on all platforms

#### Disadvantages:
- Limited native features
- Requires internet connection
- Less discoverability
- Browser-dependent features

#### Setup:
Add `manifest.json` and service worker to your web build.

## WebNN and WebGPU Support on Mobile

### Overview

For machine learning and GPU-accelerated workloads on mobile platforms, understanding WebNN and WebGPU support is crucial.

### WebGPU Support (Production Ready)

**iOS (Safari/WebKit):**
- ✅ **Available** in Safari 18+ (iOS 18+, released September 2024)
- Full WebGPU support in production browsers
- Works in Safari, Capacitor WebView, and PWAs
- Provides hardware-accelerated compute and graphics
- Best option for GPU-accelerated ML inference on iOS

**Android (Chrome):**
- ✅ **Available** in Chrome 121+ (released January 2024)
- Full WebGPU support in production
- Works in Chrome, Android WebView, Capacitor apps, and PWAs
- Requires Vulkan-capable devices (most modern Android devices from 2019+)
- Excellent performance for ML workloads

**Compatibility Check:**
```javascript
// Check WebGPU availability
if ('gpu' in navigator) {
  const adapter = await navigator.gpu.requestAdapter();
  if (adapter) {
    const device = await adapter.requestDevice();
    console.log('WebGPU is available!');
    // Use WebGPU for ML inference
  }
} else {
  console.log('WebGPU not supported, fallback to WebGL');
}
```

### WebNN Support (Experimental)

**iOS (Safari):**
- ❌ **Not currently available** in Safari
- Safari doesn't support WebNN API yet
- No timeline announced for WebNN support
- **Alternatives for iOS:**
  - Use WebGPU compute shaders for ML
  - Use Core ML via Capacitor native bridge
  - Use TensorFlow.js with WebGPU backend
  - Use ONNX Runtime Web with WebGPU

**Android (Chrome):**
- 🔬 **Experimental** in Chrome 122+ (requires flag)
- Enable via: `chrome://flags/#enable-experimental-web-platform-features`
- Not production-ready yet
- Limited device support
- **Alternatives for Android:**
  - Use WebGPU (production-ready)
  - Use TensorFlow Lite via Capacitor plugin
  - Use TensorFlow.js with WebGPU backend
  - Use ONNX Runtime Web with WebGPU

### ML Framework Compatibility Matrix

| Framework | iOS Support | Android Support | Backend Options |
|-----------|-------------|-----------------|-----------------|
| **TensorFlow.js** | ✅ Excellent | ✅ Excellent | WebGPU, WebGL, WASM |
| **ONNX Runtime Web** | ✅ Good | ✅ Good | WebGPU, WebGL, WASM |
| **Transformers.js** | ✅ Good | ✅ Good | WebGPU, WASM |
| **MediaPipe** | ✅ Good | ✅ Good | WebGPU, WebGL |
| **ML5.js** | ⚠️ WebGL only | ⚠️ WebGL only | WebGL |

### Recommended Approach for Hallucinate App

Since your app has a WebNN developer preview, here's the recommended mobile strategy:

#### 1. Use WebGPU for Production (Recommended)

**Advantages:**
- Works on both iOS 18+ and Android Chrome 121+
- Production-ready and stable
- Excellent performance for ML inference
- Direct GPU access for compute shaders

**Implementation:**
```javascript
// WebGPU-based ML inference
async function runInference(model, input) {
  // Request WebGPU adapter and device
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  
  // Use ONNX Runtime Web with WebGPU backend
  const session = await ort.InferenceSession.create(model, {
    executionProviders: ['webgpu']
  });
  
  // Run inference
  const results = await session.run({ input });
  return results;
}
```

#### 2. Implement Progressive Enhancement

```javascript
// Progressive enhancement strategy
async function initializeMLBackend() {
  if ('gpu' in navigator) {
    // WebGPU available (iOS 18+, Android Chrome 121+)
    console.log('Using WebGPU backend');
    return 'webgpu';
  } else if ('ml' in navigator) {
    // WebNN available (future-proofing)
    console.log('Using WebNN backend');
    return 'webnn';
  } else if (hasWebGL2()) {
    // WebGL2 fallback
    console.log('Using WebGL2 backend');
    return 'webgl';
  } else {
    // WASM fallback
    console.log('Using WASM backend');
    return 'wasm';
  }
}
```

#### 3. Native Acceleration Plugins (Optional)

For maximum performance, add native ML acceleration:

**iOS - Core ML:**
```bash
npm install @capacitor-community/coreml
```

```typescript
import { CoreML } from '@capacitor-community/coreml';

async function runCoreMLInference(model, input) {
  const result = await CoreML.loadModel({ modelPath: model });
  const output = await CoreML.predict({ input });
  return output;
}
```

**Android - TensorFlow Lite:**
```bash
npm install capacitor-tflite
```

```typescript
import { TFLite } from 'capacitor-tflite';

async function runTFLiteInference(model, input) {
  const result = await TFLite.loadModel({ modelPath: model });
  const output = await TFLite.run({ input });
  return output;
}
```

#### 4. Hybrid Strategy (Best Performance)

```javascript
async function runMLInference(model, input) {
  // Check platform and capabilities
  if (Capacitor.isNativePlatform()) {
    if (Capacitor.getPlatform() === 'ios') {
      // Use Core ML on iOS for best performance
      return await runCoreMLInference(model, input);
    } else if (Capacitor.getPlatform() === 'android') {
      // Use TensorFlow Lite on Android
      return await runTFLiteInference(model, input);
    }
  }
  
  // Web fallback with WebGPU/WebGL
  const backend = await initializeMLBackend();
  if (backend === 'webgpu') {
    return await runWebGPUInference(model, input);
  } else {
    return await runWebGLInference(model, input);
  }
}
```

### Browser Compatibility Table

| Platform | Browser | WebGPU | WebNN | Notes |
|----------|---------|--------|-------|-------|
| **iOS 18+** | Safari | ✅ Yes | ❌ No | Full WebGPU support |
| **iOS 17** | Safari | ❌ No | ❌ No | Use WebGL/WASM |
| **iOS PWA** | WebKit | ✅ Yes (18+) | ❌ No | Same as Safari |
| **iOS Capacitor** | WKWebView | ✅ Yes (18+) | ❌ No | Same as Safari |
| **Android 13+** | Chrome 121+ | ✅ Yes | 🔬 Flag | Vulkan required |
| **Android 13+** | Chrome 122+ | ✅ Yes | 🔬 Flag | WebNN experimental |
| **Android PWA** | Chrome | ✅ Yes | 🔬 Flag | Same as Chrome |
| **Android Capacitor** | WebView | ✅ Yes | 🔬 Flag | Chromium-based |

### Testing Recommendations

1. **Device Testing:**
   - iOS: Test on iPhone 12+ with iOS 18+
   - Android: Test on Pixel 6+ or Samsung S21+ with Chrome 121+

2. **Fallback Testing:**
   - Test on older devices without WebGPU
   - Ensure WebGL/WASM fallbacks work
   - Verify performance degradation is acceptable

3. **Performance Benchmarking:**
   ```javascript
   async function benchmarkBackends() {
     const model = 'model.onnx';
     const input = generateTestInput();
     
     // Test WebGPU
     const gpuStart = performance.now();
     await runWebGPUInference(model, input);
     const gpuTime = performance.now() - gpuStart;
     
     // Test WebGL
     const glStart = performance.now();
     await runWebGLInference(model, input);
     const glTime = performance.now() - glStart;
     
     console.log(`WebGPU: ${gpuTime}ms, WebGL: ${glTime}ms`);
   }
   ```

### Additional Resources

**WebGPU:**
- [WebGPU Specification](https://www.w3.org/TR/webgpu/)
- [WebGPU Samples](https://webgpu.github.io/webgpu-samples/)
- [Can I Use WebGPU](https://caniuse.com/webgpu)

**WebNN:**
- [WebNN Specification](https://www.w3.org/TR/webnn/)
- [WebNN Samples](https://webmachinelearning.github.io/webnn-samples/)
- [WebNN Polyfill](https://github.com/webmachinelearning/webnn-polyfill)

**ML Libraries:**
- [TensorFlow.js](https://www.tensorflow.org/js)
- [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/)
- [Transformers.js](https://huggingface.co/docs/transformers.js)
- [MediaPipe](https://developers.google.com/mediapipe)

### Migration Path from Desktop WebNN

If your desktop app uses WebNN:

1. **Detect Environment:**
   ```javascript
   const isDesktop = !Capacitor.isNativePlatform();
   const hasWebNN = 'ml' in navigator;
   ```

2. **Adapt Backend Selection:**
   ```javascript
   if (isDesktop && hasWebNN) {
     // Use WebNN on desktop (Chrome/Edge)
     backend = 'webnn';
   } else if ('gpu' in navigator) {
     // Use WebGPU on mobile
     backend = 'webgpu';
   } else {
     // Fallback to WebGL
     backend = 'webgl';
   }
   ```

3. **Unified Inference API:**
   ```javascript
   class MLInferenceEngine {
     async initialize() {
       this.backend = await this.detectBestBackend();
       this.session = await this.createSession(this.backend);
     }
     
     async run(input) {
       return await this.session.run(input);
     }
   }
   ```

## Recommended Approach

### For This Project:

1. **Short Term**: 
   - Use **Progressive Web App (PWA)** for immediate mobile access
   - Add a service worker for offline support
   - Create a mobile-responsive web interface

2. **Medium Term**:
   - Implement **Capacitor** to package as native mobile apps
   - Maintain single web codebase
   - Deploy to app stores

3. **Long Term** (if needed):
   - Consider **React Native** if native performance is critical
   - Share backend/API logic between platforms
   - Maintain separate UI layers

## Architecture Considerations

### Shared Components:

These can be shared across platforms:
- **Backend API**: Python components
- **Business Logic**: Core functionality
- **Data Models**: Shared data structures
- **IPFS Integration**: File storage/retrieval
- **HuggingFace API**: Model interactions

### Platform-Specific:

These must be platform-specific:
- **UI Layer**: Different for desktop/mobile
- **Navigation**: Platform conventions differ
- **Platform APIs**: Camera, notifications, etc.
- **Performance Optimization**: Different constraints

## Implementation Steps

### Phase 1: Evaluate Requirements
- [ ] Determine mobile feature requirements
- [ ] Assess native feature needs
- [ ] Evaluate performance requirements
- [ ] Consider development resources

### Phase 2: Choose Approach
- [ ] Select mobile framework
- [ ] Plan architecture
- [ ] Design shared components
- [ ] Define platform differences

### Phase 3: Prototype
- [ ] Create basic mobile prototype
- [ ] Test core features
- [ ] Evaluate performance
- [ ] Gather user feedback

### Phase 4: Implementation
- [ ] Implement mobile UI
- [ ] Integrate with backend
- [ ] Add platform-specific features
- [ ] Optimize performance

### Phase 5: Testing
- [ ] Unit tests
- [ ] Integration tests
- [ ] Device testing (iOS/Android)
- [ ] Performance testing
- [ ] User acceptance testing

### Phase 6: Deployment
- [ ] Set up CI/CD pipeline
- [ ] Configure app signing
- [ ] Submit to app stores
- [ ] Monitor and iterate

## Technical Requirements

### iOS Development:
- **macOS**: Required for iOS builds
- **Xcode**: Latest version
- **Apple Developer Account**: $99/year
- **Code Signing**: Certificates and provisioning profiles

### Android Development:
- **Android Studio**: For development and testing
- **JDK**: Java Development Kit 17+
- **Google Play Console**: For distribution
- **Code Signing**: Keystore for release builds

## Cost Considerations

### App Store Fees:
- **Apple App Store**: $99/year developer account
- **Google Play Store**: $25 one-time fee

### Development Tools:
- **macOS Machine**: Required for iOS (~$1000+)
- **Android Device**: For testing (~$200-500)
- **iOS Device**: For testing (~$400+)

### Maintenance:
- **Updates**: OS updates require app updates
- **Testing**: Multiple device testing
- **Support**: User support and bug fixes

## Resources

### Capacitor:
- [Official Documentation](https://capacitorjs.com/docs)
- [Getting Started Guide](https://capacitorjs.com/docs/getting-started)
- [Plugin Marketplace](https://capacitorjs.com/docs/plugins)

### React Native:
- [Official Documentation](https://reactnative.dev/docs/getting-started)
- [Expo Framework](https://expo.dev/)
- [Community Packages](https://reactnative.directory/)

### Flutter:
- [Official Documentation](https://flutter.dev/docs)
- [Widget Catalog](https://flutter.dev/docs/development/ui/widgets)
- [Package Repository](https://pub.dev/)

### PWA:
- [PWA Documentation](https://web.dev/progressive-web-apps/)
- [Workbox](https://developers.google.com/web/tools/workbox)
- [Web App Manifest](https://web.dev/add-manifest/)

## Next Steps

To proceed with mobile support:

1. **Define Requirements**: What features do you need on mobile?
2. **Choose Framework**: Based on requirements and resources
3. **Create Prototype**: Validate approach with minimal app
4. **Implement CI/CD**: Automate builds and releases
5. **Deploy**: Submit to app stores

## Questions?

For questions about mobile implementation:
1. Review this documentation
2. Check framework-specific docs
3. Open an issue in the repository
4. Consult with mobile development experts

## Disclaimer

This document provides guidance only. Actual implementation will depend on:
- Specific feature requirements
- Available development resources
- Performance needs
- Budget constraints
- Timeline requirements

Always evaluate options thoroughly before committing to a mobile strategy.
