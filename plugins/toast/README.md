# tauri-plugin-toast

Generic Android-first toast bridge plugin for Tauri v2. Copied from Threshold and authored here until it moves to `tauri-plugins-workspace`.

## Purpose

This plugin exposes a minimal command surface to show native toast messages.
It intentionally does not include app-specific alarm logic.

## Command

- `cancel`: takes down the toast that is showing (on the desktop it emits `toast:cancel`)
- `show`
  - payload:
    - `message` (required)
    - `duration` (`short` | `long`, default `short`)
    - `position` (`top` | `centre` | `bottom`, default `bottom`)
    - `replace` (default `true`): take down the toast that is showing first, so a quick run of messages (such as a count) ends with only the last one fading away. With `false`, Android queues each toast behind the others

## Platform support

- Android: native `Toast`
- Desktop: emits a `toast:show` event with the same payload, for the page to draw itself (a snackbar); there is no native desktop toast
- iOS: not currently supported by this plugin
