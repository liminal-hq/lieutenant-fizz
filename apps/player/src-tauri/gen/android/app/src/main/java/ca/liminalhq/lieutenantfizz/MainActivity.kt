package ca.liminalhq.lieutenantfizz

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
