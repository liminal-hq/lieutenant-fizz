// Wire models for the predictive-back plugin's command and event payloads.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetCanGoBackRequest {
    pub can_go_back: bool,
}

/// A single frame of the native `OnBackAnimationCallback` lifecycle, forwarded from Kotlin
/// via a Channel and re-emitted as a Tauri event. `kind` is one of "started", "progress",
/// "cancelled", or "invoked"; `progress` is 0..1 (always 0 for "cancelled", 1 for "invoked").
/// `swipe_edge` ("left" or "right") is the edge the gesture came from; Kotlin sends it with
/// "started" and "progress" only, and it is left out of the emitted event when absent.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PredictiveBackEvent {
    #[serde(rename = "type")]
    pub kind: String,
    pub progress: f32,
    #[serde(default, rename = "swipeEdge", skip_serializing_if = "Option::is_none")]
    pub swipe_edge: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_event_with_an_edge_round_trips_in_camel_case() {
        let event: PredictiveBackEvent =
            serde_json::from_str(r#"{"type":"progress","progress":0.5,"swipeEdge":"right"}"#)
                .unwrap();
        assert_eq!(event.swipe_edge.as_deref(), Some("right"));
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains(r#""swipeEdge":"right""#));
    }

    #[test]
    fn an_event_without_an_edge_still_parses_and_leaves_it_out() {
        let event: PredictiveBackEvent =
            serde_json::from_str(r#"{"type":"cancelled","progress":0}"#).unwrap();
        assert_eq!(event.swipe_edge, None);
        assert!(!serde_json::to_string(&event).unwrap().contains("swipeEdge"));
    }
}
