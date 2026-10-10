# Tauri Plugin Predictive Back

Android predictive-back ("peek") gesture support for Tauri apps, copied from Cadence's plugin of the same name (itself ported from Threshold's). It is authored in this repository for now and is meant to move to the shared `tauri-plugins-workspace` once it settles; the plugin name and API stay unchanged so the move is a copy.

This plugin bridges Android's `OnBackAnimationCallback` (API 34+ — `OnBackInvokedDispatcher` registration itself dates to API 33, but the animated callback with progress wasn't added until API 34) to the webview, letting the frontend render a real-time, scrubbable back-gesture animation instead of a discrete back-button press. Below API 34, the system back button behaves as it always has.

## Android Permissions

None required — the plugin only uses `Activity.getOnBackInvokedDispatcher()`, a standard platform API with no manifest permission of its own. The manifest injection pattern (`build.rs`) is still implemented, with an empty permission block, so the mechanism is ready if that ever changes.

The other manifest requirement, `android:enableOnBackInvokedCallback="true"` on the `<application>` tag, ships in the plugin's own `android/src/main/AndroidManifest.xml` and merges into the consuming app's final manifest automatically via Android's standard Gradle library-manifest merge. No consumer-side wiring is needed.

## Setup

1. Add the plugin to `apps/player/src-tauri/Cargo.toml`:

```toml
[dependencies]
tauri-plugin-predictive-back = { path = "../../../plugins/predictive-back" }
```

2. Register it in the app's builder with `.plugin(tauri_plugin_predictive_back::init())`.

3. Enable the capability in a capability file (`capabilities/predictive-back.json`):

```json
"permissions": [
  "predictive-back:default"
]
```

4. `guest-js/index.ts` isn't published as its own workspace package, and a plain relative import across the `plugins/` boundary can't resolve `@tauri-apps/api` (it isn't hoisted to a shared ancestor `node_modules`). The app's copy of these bindings lives in `packages/engine/src/predictive-back.ts`, which loads the Tauri API lazily and only on the Tauri Android host — keep the two in sync by hand if either changes.

## Usage

```ts
import { listen } from '@tauri-apps/api/event';
import { setCanGoBack, PREDICTIVE_BACK_EVENT, type PredictiveBackEvent } from '...';

await setCanGoBack(true);

const unlisten = await listen<PredictiveBackEvent>(PREDICTIVE_BACK_EVENT, (event) => {
	console.log(event.payload.type, event.payload.progress, event.payload.swipeEdge);
});
```

`swipeEdge` (`"left"` or `"right"`) says which edge the gesture came from. It is sent with `started` and `progress` only, and may be absent.
