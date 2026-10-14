// Shows a native Android Toast message
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package com.plugin.toast

import android.app.Activity
import android.view.Gravity
import android.widget.Toast

class ToastBridge(private val activity: Activity) {
    // The toast on screen (or queued by the system). Only touched on the UI thread.
    private var current: Toast? = null

    /**
     * Shows a toast. By default it replaces the one showing, so a quick run of messages ends with
     * only the last one fading away instead of every one being played in turn. With `replace` off,
     * Android queues it behind the others as it normally does.
     */
    fun show(message: String, duration: String?, position: String?, replace: Boolean = true) {
        val toastDuration = when (duration?.lowercase()) {
            "long" -> Toast.LENGTH_LONG
            else -> Toast.LENGTH_SHORT
        }

        activity.runOnUiThread {
            if (replace) current?.cancel()
            val toast = Toast.makeText(activity.applicationContext, message, toastDuration)
            when (position?.lowercase()) {
                "top" -> toast.setGravity(Gravity.TOP or Gravity.CENTER_HORIZONTAL, 0, 180)
                "centre" -> toast.setGravity(Gravity.CENTER, 0, 0)
                else -> toast.setGravity(Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL, 0, 180)
            }
            current = toast
            toast.show()
        }
    }

    /** Takes down the toast that is showing, if there is one. */
    fun cancel() {
        activity.runOnUiThread {
            current?.cancel()
            current = null
        }
    }
}
