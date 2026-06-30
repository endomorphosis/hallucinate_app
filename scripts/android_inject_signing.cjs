#!/usr/bin/env node
/**
 * android_inject_signing.cjs
 * -----------------------------------------------------------------------------
 * The Android project that Capacitor generates (`cap add android`) ships a
 * `release` build type with NO signing config, so `./gradlew assembleRelease`
 * produces `app-release-unsigned.apk` — which Android refuses to install. For
 * CI we generate an ephemeral keystore and need the release build to be signed
 * with it so the published APK/AAB is sideload-installable.
 *
 * This script patches `android/app/build.gradle` (regenerated fresh in CI, so
 * it is never committed) to:
 *   1. add a `signingConfigs.release` block that reads the keystore location and
 *      credentials from environment variables, and
 *   2. wire `signingConfig signingConfigs.release` into the `release` buildType.
 *
 * It is idempotent: running twice will not duplicate the injected blocks.
 *
 * Optionally also bumps versionName / versionCode when ANDROID_VERSION_NAME /
 * ANDROID_VERSION_CODE are set.
 *
 * Usage: node scripts/android_inject_signing.cjs [path/to/app/build.gradle]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const gradlePath =
  process.argv[2] ||
  path.resolve(__dirname, '..', 'android', 'app', 'build.gradle');

if (!fs.existsSync(gradlePath)) {
  console.error(`[android-signing] ERROR: ${gradlePath} not found. Run "cap add android" first.`);
  process.exit(1);
}

let gradle = fs.readFileSync(gradlePath, 'utf8');
const MARKER = '// >>> injected-signing';

if (gradle.includes(MARKER)) {
  console.log('[android-signing] signing config already injected; skipping.');
} else {
  const signingBlock = `    ${MARKER}
    signingConfigs {
        release {
            def ksPath = System.getenv("ANDROID_KEYSTORE_PATH")
            if (ksPath != null && !ksPath.isEmpty()) {
                storeFile file(ksPath)
                storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias System.getenv("ANDROID_KEY_ALIAS")
                keyPassword System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }
    // <<< injected-signing
`;

  // Insert the signingConfigs block right after the opening of `android {`.
  const androidOpen = gradle.match(/android\s*\{/);
  if (!androidOpen) {
    console.error('[android-signing] ERROR: could not find `android {` block.');
    process.exit(1);
  }
  const insertAt = androidOpen.index + androidOpen[0].length;
  gradle = gradle.slice(0, insertAt) + '\n' + signingBlock + gradle.slice(insertAt);

  // Wire the signing config into the release buildType.
  gradle = gradle.replace(
    /(buildTypes\s*\{\s*release\s*\{)/,
    `$1\n            signingConfig signingConfigs.release`
  );

  console.log('[android-signing] injected signingConfigs.release and wired release buildType.');
}

// Optional version bump from the release tag.
const versionName = process.env.ANDROID_VERSION_NAME;
const versionCode = process.env.ANDROID_VERSION_CODE;
if (versionName) {
  gradle = gradle.replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);
  console.log(`[android-signing] set versionName "${versionName}".`);
}
if (versionCode) {
  gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
  console.log(`[android-signing] set versionCode ${versionCode}.`);
}

fs.writeFileSync(gradlePath, gradle);
console.log(`[android-signing] wrote ${gradlePath}`);
