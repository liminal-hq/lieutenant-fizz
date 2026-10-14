// Request/response models for the toast command.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ToastDuration {
    #[default]
    Short,
    Long,
}

#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ToastPosition {
    Top,
    Centre,
    #[default]
    Bottom,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShowToastRequest {
    pub message: String,
    #[serde(default)]
    pub duration: ToastDuration,
    #[serde(default)]
    pub position: ToastPosition,
    /// Takes down the toast that is showing first, so a quick run of messages ends with only the last one
    /// fading away. Off, Android queues each behind the others.
    #[serde(default = "replace_by_default")]
    pub replace: bool,
}

fn replace_by_default() -> bool {
    true
}
