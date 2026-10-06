// Moving platforms that ease between anchor points and carry their riders.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/// A moving platform that eases between two anchor points; riders are carried by its
/// per-tick delta (`dx`, `dy`).
#[derive(Clone, Debug, Default)]
pub struct Platform {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub ax: f64,
    pub ay: f64,
    pub bx: f64,
    pub by: f64,
    pub speed: f64,
    pub ph: f64,
    pub dx: f64,
    pub dy: f64,
}

impl Platform {
    pub fn new(x: f64, y: f64, bx: f64, by: f64, speed: f64) -> Self {
        Platform {
            x,
            y,
            ax: x,
            ay: y,
            bx,
            by,
            w: 2.0,
            h: 0.5,
            speed,
            ..Default::default()
        }
    }

    /// Advances the cosine ease and records the movement delta for riders.
    pub fn tick(&mut self, dt: f64) {
        self.ph += dt * self.speed;
        let k = 0.5 - 0.5 * (self.ph * std::f64::consts::PI).cos();
        let nx = self.ax + (self.bx - self.ax) * k;
        let ny = self.ay + (self.by - self.ay) * k;
        self.dx = nx - self.x;
        self.dy = ny - self.y;
        self.x = nx;
        self.y = ny;
    }
}
