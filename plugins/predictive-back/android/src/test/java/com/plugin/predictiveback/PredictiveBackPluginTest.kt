// Tests the API-level + eligibility gate for registering the predictive-back callback
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

package com.plugin.predictiveback

import android.os.Build
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PredictiveBackPluginTest {
    @Test
    fun `registers when canGoBack is true on API 34 and above`() {
        assertTrue(
            shouldRegisterPredictiveBack(Build.VERSION_CODES.UPSIDE_DOWN_CAKE, canGoBack = true)
        )
        assertTrue(
            shouldRegisterPredictiveBack(Build.VERSION_CODES.UPSIDE_DOWN_CAKE + 1, canGoBack = true)
        )
    }

    @Test
    fun `does not register when canGoBack is false, even on API 34 and above`() {
        assertFalse(
            shouldRegisterPredictiveBack(Build.VERSION_CODES.UPSIDE_DOWN_CAKE, canGoBack = false)
        )
    }

    @Test
    fun `never registers below API 34, regardless of canGoBack -- OnBackAnimationCallback itself requires API 34`() {
        assertFalse(
            shouldRegisterPredictiveBack(Build.VERSION_CODES.UPSIDE_DOWN_CAKE - 1, canGoBack = true)
        )
        // API 33 specifically: OnBackInvokedDispatcher registration exists, but
        // OnBackAnimationCallback (the class this plugin instantiates) does not -- referencing it
        // would throw on a real API 33 device, so this must stay false right up to API 34.
        assertFalse(shouldRegisterPredictiveBack(Build.VERSION_CODES.TIRAMISU, canGoBack = true))
    }
}
