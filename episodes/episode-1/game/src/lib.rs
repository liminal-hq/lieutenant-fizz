//! Episode 1 simulation, exported to the TypeScript shell as raw C-ABI functions.
//!
//! (c) Copyright 2026 Liminal HQ, Scott Morris
//! SPDX-License-Identifier: Apache-2.0 OR MIT

/// Engine stride sanity export so the shell can confirm both sides agree.
#[no_mangle]
pub extern "C" fn stride() -> u32 {
    lf_sim::STRIDE as u32
}
