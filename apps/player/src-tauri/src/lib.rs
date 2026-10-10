// The Tauri shell: a WebView that loads the bundled player pages and episode builds.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/// The store file the page reads its saves and settings from (`STORE_FILE` in the engine's `tauri-storage.ts`).
const STORE_FILE: &str = "lf-data.json";

/// Applies a batch of writes to the store file (a `None` value removes the key) and saves it, in one call.
/// The page sends the batch as it is hidden, and Android may suspend it before a second call could be made,
/// so the set, delete and save steps all happen here instead of as separate calls from the page.
#[tauri::command]
async fn write_store(
    app: tauri::AppHandle,
    batch: Vec<(String, Option<String>)>,
) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    for (key, value) in batch {
        match value {
            Some(text) => store.set(key, text),
            None => {
                store.delete(key);
            }
        }
    }
    store.save().map_err(|e| e.to_string())
}

/// Closes the app: the game's Quit game row on the desktop. An app-defined command needs no capability entry,
/// which is why this is not the process plugin (a crate, a permission and an `exit` anyone could call).
/// The page only offers it on the desktop; Android leaves a game with Back and Home.
#[tauri::command]
fn quit(app: tauri::AppHandle) {
    app.exit(0);
}

/// The log plugin: Debug in debug builds and Info in release, to stdout (the desktop terminal and Android's
/// logcat), a rotated file in the app's log directory and the WebView's devtools console. The format
/// matches Threshold's (local time with its UTC offset) so entries line up across the apps.
fn log_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

    let level = if cfg!(debug_assertions) {
        log::LevelFilter::Debug
    } else {
        log::LevelFilter::Info
    };

    tauri_plugin_log::Builder::default()
        .level(level)
        // The plugin's default, `KeepOne`, deletes the active file at its size limit and keeps nothing; keep
        // the previous file (renamed with its date) beside the new one.
        .rotation_strategy(RotationStrategy::KeepSome(1))
        .level_for("jni", log::LevelFilter::Warn)
        .level_for("tao", log::LevelFilter::Info)
        // The debug MCP bridge's websocket internals are very chatty at Trace.
        .level_for("tungstenite", log::LevelFilter::Warn)
        .level_for("tokio_tungstenite", log::LevelFilter::Warn)
        .targets([
            Target::new(TargetKind::Stdout),
            Target::new(TargetKind::LogDir { file_name: None }),
            // Only Rust's own records: the page's console output is already in its devtools console.
            Target::new(TargetKind::Webview).filter(|metadata| {
                !metadata
                    .target()
                    .starts_with(tauri_plugin_log::WEBVIEW_TARGET)
            }),
        ])
        .format(|out, message, record| {
            // A WebView record carries the page's call site (file and line) in the record, not the target.
            let site = match (record.file(), record.line()) {
                (Some(file), Some(line)) => format!(" ({file}:{line})"),
                _ => String::new(),
            };
            out.finish(format_args!(
                "[{}][{}][{}] {}{}",
                chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f %:z"),
                record.level(),
                record.target(),
                message,
                site
            ))
        })
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // `mut` is only needed when the debug-only plugin below is compiled in.
    #[cfg_attr(not(debug_assertions), allow(unused_mut))]
    let mut builder = tauri::Builder::default();

    // The MCP bridge lets tooling drive the WebView (screenshots, scripts, logs) in debug builds.
    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(tauri_plugin_mcp_bridge::init());
    }

    builder
        // Rust and WebView logs, one format everywhere: see `docs/APP.md`, "Logs".
        .plugin(log_plugin())
        // The game's saves and settings are kept in a store file (`lf-data.json`) in the app data directory.
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_haptics::init())
        // The Android Back gesture: the page says whether Back has somewhere to go and hears when it completes.
        // The desktop build gets a no-op stub, so the plugin is registered everywhere.
        .plugin(tauri_plugin_predictive_back::init())
        .invoke_handler(tauri::generate_handler![write_store, quit])
        .setup(|app| {
            let info = app.package_info();
            log::info!(
                "{} {} ({}) starting on {}",
                info.name,
                info.version,
                app.config().identifier,
                std::env::consts::OS
            );
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the Lieutenant Fizz player");
}
