// Plugin entry point and cross-platform extension trait.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;

// Only Android has a native toast. Every other host (the desktop, and iOS) emits an event for the page to draw.
#[cfg(not(target_os = "android"))]
mod desktop;
#[cfg(target_os = "android")]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(not(target_os = "android"))]
use desktop::Toast;
#[cfg(target_os = "android")]
use mobile::Toast;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the toast APIs.
pub trait ToastExt<R: Runtime> {
    fn toast(&self) -> &Toast<R>;
}

impl<R: Runtime, T: Manager<R>> ToastExt<R> for T {
    fn toast(&self) -> &Toast<R> {
        self.state::<Toast<R>>().inner()
    }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("toast")
        .invoke_handler(tauri::generate_handler![commands::show, commands::cancel])
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            let toast = mobile::init(app, api)?;
            #[cfg(not(target_os = "android"))]
            let toast = desktop::init(app, api)?;
            app.manage(toast);
            Ok(())
        })
        .build()
}
