// Desktop toast: there is no native one, so it emits an event for the page to draw as a snackbar.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Emitter, Runtime};

use crate::models::ShowToastRequest;

/// Emitted to the frontend so it can render the toast itself -- keeps `showToast()`
/// a single call path for the UI regardless of platform; the plugin is still the
/// entry point either way.
const EVENT_SHOW_TOAST: &str = "toast:show";

/// Emitted when the message showing should come down.
const EVENT_CANCEL_TOAST: &str = "toast:cancel";

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<Toast<R>> {
    Ok(Toast(app.clone()))
}

/// Access to the toast APIs.
pub struct Toast<R: Runtime>(AppHandle<R>);

impl<R: Runtime> Toast<R> {
    pub fn show(&self, payload: ShowToastRequest) -> crate::Result<()> {
        self.0.emit(EVENT_SHOW_TOAST, payload)?;
        Ok(())
    }

    /// Tells the page to take down the message it is showing.
    pub fn cancel(&self) -> crate::Result<()> {
        self.0.emit(EVENT_CANCEL_TOAST, ())?;
        Ok(())
    }
}
