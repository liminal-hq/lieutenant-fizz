// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

use lf_sim::tilemap::{
    TileProps, ONEWAY, SLOPE_L22A, SLOPE_L22B, SLOPE_L45, SLOPE_R22A, SLOPE_R22B, SLOPE_R45, SOLID,
    SWITCHED,
};

pub const EMPTY: u8 = 0;
pub const FILL: u8 = 1;
pub const BLOCK: u8 = 2;
pub const PLAT: u8 = 3;
pub const SPIKE: u8 = 4;
pub const CHOC: u8 = 5;
pub const R45: u8 = 6;
pub const L45: u8 = 7;
pub const R22A: u8 = 8;
pub const R22B: u8 = 9;
pub const L22A: u8 = 10;
pub const L22B: u8 = 11;
pub const DOOR_R: u8 = 12;
pub const DOOR_B: u8 = 13;
pub const BRIDGE: u8 = 14;
pub const CRYS: u8 = 16;
pub const EXIT: u8 = 17;
pub const GRASS: u8 = 20;
pub const PATH: u8 = 21;
pub const RIVER: u8 = 22;
pub const TREE: u8 = 23;
pub const ROCK: u8 = 24;

/// Collision behaviour for every Episode 1 tile id.
pub fn props() -> TileProps {
    let mut p = TileProps::default();
    for t in [FILL, BLOCK, DOOR_R, DOOR_B, RIVER, TREE, ROCK] {
        p.set_flags(t, SOLID);
    }
    p.set_flags(PLAT, ONEWAY);
    p.set_flags(BRIDGE, SWITCHED);
    for (t, s) in [
        (R45, SLOPE_R45),
        (L45, SLOPE_L45),
        (R22A, SLOPE_R22A),
        (R22B, SLOPE_R22B),
        (L22A, SLOPE_L22A),
        (L22B, SLOPE_L22B),
    ] {
        p.set_slope(t, s);
    }
    p
}
