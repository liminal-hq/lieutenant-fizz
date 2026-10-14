# tauri-plugin-toast

Generic Android-first toast bridge plugin for Tauri v2. Copied from Threshold and authored here until it moves to `tauri-plugins-workspace`.

## Purpose

This plugin exposes a minimal command surface to show native toast messages.
It intentionally does not include app-specific alarm logic.

## Command

- `show`
  - payload:
    - `message` (required)
    - `duration` (`short` | `long`, default `short`)
    - `position` (`top` | `centre` | `bottom`, default `bottom`)

## Platform support

- Android: native `Toast`
- Desktop: emits a `toast:show` event with the same payload, for the page to draw itself (a snackbar); there is no native desktop toast
- iOS: not currently supported by this plugin
