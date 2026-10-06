// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/// Tile solid from every side.
pub const SOLID: u8 = 1;
/// Tile solid only when landing on it from above (one-way platform).
pub const ONEWAY: u8 = 2;
/// Tile solid only while the map's switch is on (switchable bridge).
pub const SWITCHED: u8 = 4;

/// Slope shapes, mapped from tile ids through [`TileProps`].
pub const SLOPE_R45: u8 = 1;
pub const SLOPE_L45: u8 = 2;
pub const SLOPE_R22A: u8 = 3;
pub const SLOPE_R22B: u8 = 4;
pub const SLOPE_L22A: u8 = 5;
pub const SLOPE_L22B: u8 = 6;

/// Surface height (0..1 within the tile) of a slope shape at local x `lx` (0..1).
/// 22.5 degree slopes span two tiles: the A half rises 0..0.5, the B half 0.5..1.
pub fn slope_height(shape: u8, lx: f64) -> f64 {
    match shape {
        SLOPE_R45 => lx,
        SLOPE_L45 => 1.0 - lx,
        SLOPE_R22A => lx / 2.0,
        SLOPE_R22B => 0.5 + lx / 2.0,
        SLOPE_L22A => 1.0 - lx / 2.0,
        SLOPE_L22B => 0.5 - lx / 2.0,
        _ => 0.0,
    }
}

/// Per-tile-id behaviour table: collision flags and slope shape.
#[derive(Clone, Debug)]
pub struct TileProps {
    flags: [u8; 256],
    slope: [u8; 256],
}

impl Default for TileProps {
    fn default() -> Self {
        TileProps {
            flags: [0; 256],
            slope: [0; 256],
        }
    }
}

impl TileProps {
    pub fn set_flags(&mut self, id: u8, flags: u8) {
        self.flags[id as usize] = flags;
    }

    pub fn set_slope(&mut self, id: u8, shape: u8) {
        self.slope[id as usize] = shape;
    }

    pub fn flags(&self, id: u8) -> u8 {
        self.flags[id as usize]
    }

    pub fn slope(&self, id: u8) -> u8 {
        self.slope[id as usize]
    }
}

/// A rectangular tile grid. Row 0 is the bottom of the world (y grows upwards).
#[derive(Clone, Debug)]
pub struct TileMap {
    pub w: i32,
    pub h: i32,
    pub data: Vec<u8>,
    pub props: TileProps,
    /// State of the switchable bridge tiles.
    pub switch_on: bool,
    /// What lies below row 0: solid for the overworld (a hard edge), open for levels (a pit).
    pub floor_solid: bool,
}

impl TileMap {
    pub fn new(w: i32, h: i32, props: TileProps) -> Self {
        TileMap {
            w,
            h,
            data: vec![0; (w * h) as usize],
            props,
            switch_on: false,
            floor_solid: false,
        }
    }

    pub fn in_bounds(&self, x: i32, y: i32) -> bool {
        x >= 0 && x < self.w && y >= 0 && y < self.h
    }

    /// Tile id at (x, y); 0 outside the map.
    pub fn get(&self, x: i32, y: i32) -> u8 {
        if self.in_bounds(x, y) {
            self.data[(y * self.w + x) as usize]
        } else {
            0
        }
    }

    pub fn set(&mut self, x: i32, y: i32, t: u8) {
        if self.in_bounds(x, y) {
            self.data[(y * self.w + x) as usize] = t;
        }
    }

    pub fn is_slope(&self, t: u8) -> bool {
        self.props.slope(t) != 0
    }

    /// True for tiles that are solid from every side regardless of state.
    pub fn is_solid_tile(&self, t: u8) -> bool {
        self.props.flags(t) & SOLID != 0
    }

    /// Whether the cell blocks movement. Outside the left/right edge is a wall, above the top
    /// is open and below the bottom follows `floor_solid`. `down` and `prev_bottom` enable
    /// one-way landing: only solid when the body was entirely above the tile last tick.
    pub fn solid(&self, cx: i32, cy: i32, down: bool, prev_bottom: f64) -> bool {
        if cx < 0 || cx >= self.w {
            return true;
        }
        if cy < 0 {
            return false;
        }
        if cy >= self.h {
            return self.floor_solid;
        }
        let f = self.props.flags(self.data[(cy * self.w + cx) as usize]);
        if f & SOLID != 0 {
            return true;
        }
        if f & SWITCHED != 0 {
            return self.switch_on;
        }
        if f & ONEWAY != 0 {
            return down && prev_bottom >= f64::from(cy) + 1.0 - 1e-6;
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn props() -> TileProps {
        let mut p = TileProps::default();
        p.set_flags(1, SOLID);
        p.set_flags(2, ONEWAY);
        p.set_flags(3, SWITCHED);
        p.set_slope(4, SLOPE_R45);
        p
    }

    #[test]
    fn slope_heights_are_continuous() {
        assert_eq!(slope_height(SLOPE_R22A, 1.0), slope_height(SLOPE_R22B, 0.0));
        assert_eq!(slope_height(SLOPE_L22A, 1.0), slope_height(SLOPE_L22B, 0.0));
        assert_eq!(slope_height(SLOPE_R45, 0.25), 0.25);
        assert_eq!(slope_height(SLOPE_L45, 0.25), 0.75);
    }

    #[test]
    fn solidity_rules() {
        let mut m = TileMap::new(4, 4, props());
        m.set(1, 1, 1);
        m.set(2, 1, 2);
        m.set(3, 1, 3);
        assert!(m.solid(1, 1, false, 0.0));
        assert!(m.solid(-1, 0, false, 0.0), "side edges are walls");
        assert!(!m.solid(0, -1, false, 0.0), "pit below");
        assert!(!m.solid(0, 9, false, 0.0), "open above");
        assert!(!m.solid(2, 1, false, 0.0));
        assert!(m.solid(2, 1, true, 2.0), "one-way solid from above");
        assert!(!m.solid(2, 1, true, 1.5), "one-way open from inside");
        assert!(!m.solid(3, 1, false, 0.0));
        m.switch_on = true;
        assert!(m.solid(3, 1, false, 0.0));
        m.floor_solid = true;
        assert!(m.solid(0, 9, false, 0.0));
    }
}
