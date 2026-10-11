#!/usr/bin/env bash
# Applies the player's Android settings to a freshly generated gen/android project.
#
# (c) Copyright 2026 Liminal HQ, Scott Morris
# SPDX-License-Identifier: Apache-2.0 OR MIT

# `tauri android init` writes the project from templates, so these settings are re-applied after every
# init: the tracked project is a fresh init plus this script, and the dev build (a regenerated project
# with the `.dev` identifier) gets the same settings. It is idempotent and fails loudly when an anchor
# in the generated files is missing, which means the template changed.
#
#   - landscape lock: `screenOrientation="sensorLandscape"` on the activity
#   - fullscreen theme, with the display cutout in `shortEdges` mode, in both theme files
#   - immersive mode: `MainActivity` hides the system bars (transient bars on swipe)
#   - WebView settings: `MainActivity.onWebViewCreate` pins `textZoom` to 100 (the game owns its text
#     size, so the system font scale must not apply) and lets media play without a user gesture
#   - `compileSdk` and `targetSdk` 36 rather than the template's 37, to match the CI images
#
# `android.permission.VIBRATE` is not added here: the haptics plugin's `build.rs` adds it.
#
# Usage: scripts/apply-android-settings.sh [path to gen/android]
set -euo pipefail
cd "$(dirname "$0")/.."

GEN="${1:-apps/player/src-tauri/gen/android}"
MAIN="$GEN/app/src/main"

die() {
  echo "apply-android-settings: $*" >&2
  exit 1
}

# Landscape lock.
MANIFEST="$MAIN/AndroidManifest.xml"
[ -f "$MANIFEST" ] || die "$MANIFEST not found; run tauri android init first"
if ! grep -q 'android:screenOrientation=' "$MANIFEST"; then
  grep -q 'android:launchMode="singleTask"' "$MANIFEST" || die "anchor android:launchMode missing in $MANIFEST"
  sed -i 's#^\( *\)android:launchMode="singleTask"#\1android:screenOrientation="sensorLandscape"\n\1android:launchMode="singleTask"#' "$MANIFEST"
fi
grep -q 'android:screenOrientation="sensorLandscape"' "$MANIFEST" || die "landscape lock not applied"

# Fullscreen theme, in the light and night variants.
for themes in "$MAIN/res/values/themes.xml" "$MAIN/res/values-night/themes.xml"; do
  [ -f "$themes" ] || die "$themes not found"
  if ! grep -q 'android:windowFullscreen' "$themes"; then
    grep -q 'Customize your theme here' "$themes" || die "anchor comment missing in $themes"
    sed -i 's#^\( *\)<!-- Customize your theme here\. -->#\1<!-- The game owns the whole screen, including the display cutout. -->\n\1<item name="android:windowFullscreen">true</item>\n\1<item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>\n\1<item name="android:windowBackground">@android:color/black</item>#' "$themes"
  fi
  grep -q 'android:windowFullscreen' "$themes" || die "fullscreen theme not applied to $themes"
done

# Immersive mode and WebView settings. The package line follows the application identifier, so it is read back from the
# generated file (it differs in the dev build).
ACTIVITY="$(find "$MAIN/java" -name MainActivity.kt | head -n 1)"
[ -n "$ACTIVITY" ] || die "MainActivity.kt not found"
PACKAGE="$(sed -n 's/^package //p' "$ACTIVITY")"
[ -n "$PACKAGE" ] || die "no package line in $ACTIVITY"
# The hook below overrides `WryActivity.onWebViewCreate(WebView)`, which `TauriActivity` inherits.
grep -q 'class MainActivity : TauriActivity()' "$ACTIVITY" || die "anchor 'class MainActivity : TauriActivity()' missing in $ACTIVITY"
cat > "$ACTIVITY" <<EOF
package $PACKAGE

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    hideSystemBars()
  }

  // Called by WryActivity.setWebView once the WebView exists. The WebView applies the system font scale
  // to all text by default, which breaks the game's pixel layout, so pin it to 100%. Audio may start
  // without the tap a browser needs.
  override fun onWebViewCreate(webView: WebView) {
    webView.settings.textZoom = 100
    webView.settings.mediaPlaybackRequiresUserGesture = false
  }

  // Immersive mode: the bars stay hidden and a swipe from the edge shows them briefly. The system
  // brings them back on focus changes (a dialog, the notification shade), so hide them again.
  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) hideSystemBars()
  }

  private fun hideSystemBars() {
    val controller = WindowCompat.getInsetsController(window, window.decorView)
    controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    controller.hide(WindowInsetsCompat.Type.systemBars())
  }
}
EOF
grep -q 'webView.settings.textZoom = 100' "$ACTIVITY" || die "WebView settings not applied to $ACTIVITY"

# SDK levels.
GRADLE="$GEN/app/build.gradle.kts"
[ -f "$GRADLE" ] || die "$GRADLE not found"
sed -i 's/^\( *\)compileSdk = 37$/\1compileSdk = 36/; s/^\( *\)targetSdk = 37$/\1targetSdk = 36/' "$GRADLE"
grep -q 'compileSdk = 36' "$GRADLE" || die "compileSdk is not 36 in $GRADLE"
grep -q 'targetSdk = 36' "$GRADLE" || die "targetSdk is not 36 in $GRADLE"

echo "android settings applied to $GEN"
