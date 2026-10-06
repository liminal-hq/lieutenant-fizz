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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_anchors_at_the_start_with_default_size() {
        let p = Platform::new(1.0, 2.0, 5.0, 2.0, 0.5);
        assert_eq!(
            (p.x, p.y, p.ax, p.ay, p.bx, p.by),
            (1.0, 2.0, 1.0, 2.0, 5.0, 2.0)
        );
        assert_eq!((p.w, p.h, p.speed), (2.0, 0.5, 0.5));
        assert_eq!((p.ph, p.dx, p.dy), (0.0, 0.0, 0.0));
    }

    #[test]
    fn tick_eases_toward_the_far_anchor_and_records_the_delta() {
        let mut p = Platform::new(0.0, 0.0, 4.0, 2.0, 1.0);
        // Phase 0.5 is the midpoint of the cosine ease.
        p.tick(0.5);
        assert!((p.x - 2.0).abs() < 1e-9 && (p.y - 1.0).abs() < 1e-9);
        assert!((p.dx - 2.0).abs() < 1e-9 && (p.dy - 1.0).abs() < 1e-9);
        // Phase 1.0 reaches the far anchor, and the delta is the second half only.
        p.tick(0.5);
        assert!((p.x - 4.0).abs() < 1e-9 && (p.y - 2.0).abs() < 1e-9);
        assert!((p.dx - 2.0).abs() < 1e-9 && (p.dy - 1.0).abs() < 1e-9);
    }

    #[test]
    fn tick_returns_to_the_start_after_a_full_period() {
        let mut p = Platform::new(3.0, 1.0, 7.0, 1.0, 1.0);
        p.tick(2.0);
        assert!((p.x - 3.0).abs() < 1e-9 && (p.y - 1.0).abs() < 1e-9);
    }

    #[test]
    fn deltas_sum_to_the_total_displacement() {
        let mut p = Platform::new(0.0, 0.0, 6.0, -3.0, 0.7);
        let (mut sx, mut sy) = (0.0, 0.0);
        for _ in 0..90 {
            p.tick(1.0 / 60.0);
            sx += p.dx;
            sy += p.dy;
        }
        assert!((sx - p.x).abs() < 1e-9 && (sy - p.y).abs() < 1e-9);
    }

    #[test]
    fn zero_speed_or_zero_dt_does_not_move() {
        let mut still = Platform::new(1.0, 1.0, 9.0, 9.0, 0.0);
        still.tick(1.0);
        assert_eq!((still.x, still.y, still.dx, still.dy), (1.0, 1.0, 0.0, 0.0));
        let mut paused = Platform::new(1.0, 1.0, 9.0, 9.0, 2.0);
        paused.tick(0.0);
        assert_eq!(
            (paused.x, paused.y, paused.dx, paused.dy),
            (1.0, 1.0, 0.0, 0.0)
        );
    }
}
