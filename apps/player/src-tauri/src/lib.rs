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
        // The game's saves and settings are kept in a store file (`lf-data.json`) in the app data directory.
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![write_store, quit])
        .run(tauri::generate_context!())
        .expect("error while running the Lieutenant Fizz player");
}
