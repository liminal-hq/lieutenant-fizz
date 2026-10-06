// Builders for the Episode 1 levels and overworld tile maps and spawns.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

//! Level and overworld builders: a port of the prototype's `levels.js`.

use crate::ents::{Item, ItemKind, Kind, Spawn};
use crate::tiles::*;
use lf_sim::{Platform, TileMap};

pub const CRATER: u8 = 0;
pub const CAVES: u8 = 1;
pub const CITADEL: u8 = 2;

#[derive(Clone, Copy, Debug)]
pub struct Arena {
    pub x0: f64,
    pub x1: f64,
    pub floor: f64,
}

pub struct LevelData {
    pub id: u8,
    pub map: TileMap,
    pub spawns: Vec<Spawn>,
    pub items: Vec<Item>,
    pub plats: Vec<Platform>,
    pub start: (f64, f64),
    pub arena: Option<Arena>,
}

enum Seg {
    Flat,
    Up,
    Down,
    Up22,
    Down22,
    Gap,
    Pool,
    Spikes,
}
use Seg::*;

struct Builder {
    w: i32,
    h: i32,
    map: TileMap,
    h_at: Vec<f64>,
    spawns: Vec<Spawn>,
    items: Vec<Item>,
    plats: Vec<Platform>,
    x: i32,
    ground: i32,
}

impl Builder {
    fn new(w: i32, h: i32, ground: i32) -> Self {
        Builder {
            w,
            h,
            map: TileMap::new(w, h, props()),
            h_at: vec![-1.0; w as usize],
            spawns: vec![],
            items: vec![],
            plats: vec![],
            x: 0,
            ground,
        }
    }

    fn fill(&mut self, x0: i32, x1: i32, y0: i32, y1: i32, t: u8) -> &mut Self {
        for x in x0..=x1 {
            for y in y0..=y1 {
                self.map.set(x, y, t);
            }
        }
        self
    }

    fn col(&mut self, x: i32, h: i32) {
        self.fill(x, x, 0, h - 1, FILL);
        if x >= 0 && x < self.w {
            self.h_at[x as usize] = f64::from(h);
        }
    }

    fn set_h(&mut self, x: i32, v: f64) {
        if x >= 0 && x < self.w {
            self.h_at[x as usize] = v;
        }
    }

    fn run(&mut self, segs: &[(Seg, i32)]) -> &mut Self {
        for (k, n) in segs {
            for _ in 0..*n {
                let x = self.x;
                match k {
                    Flat => {
                        self.col(x, self.ground);
                        self.x += 1;
                    }
                    Up => {
                        self.col(x, self.ground);
                        self.map.set(x, self.ground, R45);
                        self.set_h(x, f64::from(self.ground) + 0.5);
                        self.x += 1;
                        self.ground += 1;
                    }
                    Down => {
                        self.ground -= 1;
                        self.col(x, self.ground);
                        self.map.set(x, self.ground, L45);
                        self.set_h(x, f64::from(self.ground) + 0.5);
                        self.x += 1;
                    }
                    Up22 => {
                        self.col(x, self.ground);
                        self.map.set(x, self.ground, R22A);
                        self.col(x + 1, self.ground);
                        self.map.set(x + 1, self.ground, R22B);
                        self.x += 2;
                        self.ground += 1;
                    }
                    Down22 => {
                        self.ground -= 1;
                        self.col(x, self.ground);
                        self.map.set(x, self.ground, L22A);
                        self.col(x + 1, self.ground);
                        self.map.set(x + 1, self.ground, L22B);
                        self.x += 2;
                    }
                    Gap => self.x += 1,
                    Pool => {
                        self.map.set(x, 0, FILL);
                        self.fill(x, x, 1, self.ground - 2, CHOC);
                        self.set_h(x, f64::from(self.ground) - 1.0);
                        self.x += 1;
                    }
                    Spikes => {
                        self.col(x, self.ground);
                        self.map.set(x, self.ground, SPIKE);
                        self.x += 1;
                    }
                }
            }
        }
        self
    }

    fn ground_at(&self, x: f64) -> f64 {
        let i = x.floor() as usize;
        self.h_at.get(i).copied().unwrap_or(-1.0)
    }

    fn ent(&mut self, kind: Kind, x: f64) -> &mut Self {
        let y = self.ground_at(x);
        self.spawns.push(Spawn { kind, x, y });
        self
    }

    fn ent_at(&mut self, kind: Kind, x: f64, y: f64) -> &mut Self {
        self.spawns.push(Spawn { kind, x, y });
        self
    }

    fn item(&mut self, kind: ItemKind, x: i32, y: i32) -> &mut Self {
        self.items.push(Item {
            kind,
            x: f64::from(x) + 0.5,
            y: f64::from(y) + 0.5,
            taken: false,
        });
        self
    }

    fn row(&mut self, kind: ItemKind, x0: i32, n: i32, y: i32, step: i32) -> &mut Self {
        for i in 0..n {
            self.item(kind, x0 + i * step, y);
        }
        self
    }

    fn plat(&mut self, x0: i32, x1: i32, y: i32) -> &mut Self {
        self.fill(x0, x1, y, y, PLAT)
    }

    fn hover(&mut self, x: f64, y: f64, bx: f64, by: f64, speed: f64) -> &mut Self {
        self.plats.push(Platform::new(x, y, bx, by, speed));
        self
    }

    fn crys(&mut self, x: i32) -> &mut Self {
        let y = self.ground_at(f64::from(x)).ceil() as i32;
        self.map.set(x, y, CRYS);
        self
    }

    fn walls(&mut self) -> &mut Self {
        let (w, h) = (self.w, self.h);
        self.fill(0, 0, 0, h - 1, BLOCK);
        self.fill(w - 1, w - 1, 0, h - 1, BLOCK);
        self
    }

    fn out(self, id: u8, start: (f64, f64), arena: Option<Arena>) -> LevelData {
        LevelData {
            id,
            map: self.map,
            spawns: self.spawns,
            items: self.items,
            plats: self.plats,
            start,
            arena,
        }
    }
}

use ItemKind::*;

fn crater() -> LevelData {
    let mut b = Builder::new(192, 28, 4);
    b.run(&[
        (Flat, 14),
        (Up, 2),
        (Flat, 6),
        (Down, 2),
        (Flat, 5),
        (Pool, 4),
        (Flat, 8),
        (Up22, 2),
        (Flat, 10),
        (Gap, 3),
        (Flat, 9),
        (Down22, 2),
        (Flat, 6),
        (Spikes, 4),
        (Flat, 10),
        (Up, 3),
        (Flat, 8),
        (Down, 3),
        (Pool, 6),
        (Flat, 10),
        (Up22, 3),
        (Flat, 14),
        (Down, 3),
        (Flat, 12),
        (Spikes, 3),
        (Flat, 8),
        (Up, 2),
        (Flat, 22),
    ]);
    b.walls();
    b.row(Cheezie, 17, 4, 7, 1)
        .row(Cheezie, 29, 4, 7, 1)
        .item(Soda, 36, 5)
        .row(Choc, 46, 3, 8, 3);
    b.fill(49, 51, 10, 10, BLOCK).item(Cookie, 50, 11);
    b.plat(107, 108, 5).row(Cheezie, 105, 6, 8, 1);
    b.row(Cheezie, 72, 3, 5, 1)
        .row(Choc, 94, 4, 8, 2)
        .item(Soda, 125, 9)
        .row(Cheezie, 128, 5, 8, 2);
    b.plat(131, 134, 12)
        .item(KeyRed, 132, 13)
        .row(Choc, 146, 3, 5, 3)
        .item(Cookie, 157, 7);
    b.fill(171, 171, 6, 7, DOOR_R).fill(171, 171, 8, 27, BLOCK);
    b.fill(186, 186, 6, 7, EXIT).row(Cheezie, 175, 4, 7, 2);
    for x in [10, 26, 60, 98, 118, 150, 178] {
        b.crys(x);
    }
    b.ent(Kind::Gloop, 35.0)
        .ent(Kind::Gloop, 62.0)
        .ent(Kind::Gloop, 85.0);
    b.ent(Kind::Hopper, 97.0)
        .ent(Kind::Hopper, 148.0)
        .ent(Kind::Marsh, 115.0)
        .ent(Kind::Pod, 136.0);
    b.ent_at(Kind::Drone, 88.5, 7.5)
        .ent_at(Kind::Drone, 165.5, 7.5);
    b.out(CRATER, (3.0, 4.0), None)
}

fn caves() -> LevelData {
    let mut b = Builder::new(176, 26, 5);
    b.run(&[
        (Flat, 12),
        (Down22, 1),
        (Flat, 8),
        (Pool, 8),
        (Flat, 10),
        (Up, 2),
        (Flat, 10),
        (Down, 2),
        (Flat, 6),
        (Pool, 14),
        (Flat, 10),
        (Up22, 2),
        (Flat, 8),
        (Spikes, 3),
        (Flat, 12),
        (Down, 3),
        (Flat, 6),
        (Pool, 10),
        (Flat, 8),
        (Up, 3),
        (Flat, 12),
        (Down22, 1),
        (Flat, 20),
    ]);
    b.fill(1, 40, 13, 25, FILL)
        .fill(41, 80, 15, 25, FILL)
        .fill(81, 120, 13, 25, FILL)
        .fill(121, 174, 14, 25, FILL);
    b.fill(30, 33, 11, 12, FILL)
        .fill(95, 97, 11, 12, FILL)
        .fill(160, 161, 12, 13, FILL);
    b.walls();
    b.hover(22.0, 4.0, 27.0, 4.0, 0.3)
        .hover(120.0, 3.5, 123.0, 6.0, 0.4)
        .hover(125.0, 6.0, 128.0, 3.5, 0.4);
    b.ent_at(Kind::Switch, 57.0, 4.0);
    b.fill(60, 73, 3, 3, BRIDGE);
    b.row(Cheezie, 4, 5, 6, 1)
        .row(Cheezie, 22, 6, 7, 1)
        .item(Soda, 34, 5)
        .row(Choc, 43, 4, 8, 2)
        .row(Cheezie, 61, 7, 6, 2);
    b.plat(100, 103, 9)
        .item(KeyBlue, 101, 10)
        .row(Choc, 88, 3, 8, 2)
        .item(Cookie, 112, 7)
        .row(Cheezie, 120, 5, 9, 2)
        .item(Soda, 140, 7);
    b.fill(150, 150, 6, 13, DOOR_B);
    b.fill(170, 170, 5, 6, EXIT).row(Cookie, 158, 2, 7, 3);
    for x in [8, 18, 36, 47, 76, 92, 108, 133, 146, 165] {
        b.crys(x);
    }
    for (x, y) in [(50, 14), (86, 12), (118, 12), (138, 13)] {
        b.map.set(x, y, CRYS);
    }
    // Bats hang from the ceiling; their y is a search start (the prototype lowers it by 0.7).
    for (x, y) in [
        (35.0, 12.0),
        (66.0, 14.0),
        (92.0, 12.0),
        (105.0, 12.0),
        (158.0, 13.0),
    ] {
        b.ent_at(Kind::Bat, x, y - 0.7);
    }
    b.ent(Kind::Beetle, 46.0)
        .ent(Kind::Beetle, 145.0)
        .ent(Kind::Hopper, 78.0)
        .ent(Kind::Gloop, 16.0);
    b.ent(Kind::Gloop, 102.0)
        .ent(Kind::Pod, 108.0)
        .ent_at(Kind::Drone, 124.5, 8.5);
    b.out(CAVES, (3.0, 5.0), None)
}

fn citadel() -> LevelData {
    let mut b = Builder::new(158, 26, 4);
    b.run(&[
        (Flat, 14),
        (Up22, 2),
        (Flat, 8),
        (Down, 2),
        (Spikes, 3),
        (Flat, 10),
        (Up, 4),
        (Flat, 10),
        (Down, 4),
        (Flat, 12),
        (Pool, 6),
        (Flat, 12),
        (Up22, 2),
        (Flat, 14),
        (Down, 2),
        (Flat, 8),
        (Flat, 40),
    ]);
    b.fill(1, 116, 15, 25, FILL).fill(117, 156, 18, 25, FILL);
    b.fill(117, 117, 8, 17, BLOCK);
    b.fill(148, 156, 4, 8, BLOCK);
    b.walls();
    b.plat(124, 127, 8).plat(137, 140, 8);
    b.row(Cookie, 18, 3, 8, 3)
        .row(Choc, 32, 5, 6, 2)
        .row(Cheezie, 45, 8, 10, 1)
        .item(Soda, 60, 5)
        .row(Cheezie, 71, 6, 7, 1)
        .row(Choc, 80, 4, 6, 2);
    b.plat(96, 99, 10)
        .row(Cookie, 96, 2, 11, 2)
        .item(Soda, 104, 7)
        .row(Cheezie, 109, 6, 6, 1);
    b.fill(10, 10, 4, 4, CRYS);
    b.fill(64, 64, 4, 4, CRYS);
    b.fill(110, 110, 4, 4, CRYS);
    b.ent_at(Kind::Roller, 50.0, 8.0).ent(Kind::Marsh, 36.0);
    b.ent_at(Kind::Sentry, 66.0, 8.0)
        .ent_at(Kind::Sentry, 101.0, 10.0);
    b.ent(Kind::Phantom, 84.0)
        .ent(Kind::Phantom, 112.0)
        .ent(Kind::Beetle, 95.0);
    b.ent_at(Kind::Boss, 138.0, 4.0)
        .ent_at(Kind::Terminal, 120.0, 4.0)
        .ent_at(Kind::Cage, 152.0, 9.0);
    b.out(
        CITADEL,
        (3.0, 4.0),
        Some(Arena {
            x0: 118.0,
            x1: 147.0,
            floor: 4.0,
        }),
    )
}

pub fn build_level(id: u8) -> LevelData {
    match id {
        CAVES => caves(),
        CITADEL => citadel(),
        _ => crater(),
    }
}

// ---------- Overworld ----------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PtKind {
    Saucer,
    Level,
    Tele,
}

#[derive(Clone, Copy, Debug)]
pub struct MapPoint {
    pub kind: PtKind,
    /// Level id for `Level` points.
    pub level: u8,
    pub x: f64,
    pub y: f64,
    /// Index of the paired teleporter.
    pub to: usize,
    /// Level that must be cleared to power this teleporter.
    pub req: u8,
    pub big: bool,
}

pub struct MapData {
    pub map: TileMap,
    pub points: Vec<MapPoint>,
    pub start: (f64, f64),
}

pub fn build_overworld() -> MapData {
    let (w, h) = (60, 44);
    let mut map = TileMap::new(w, h, props());
    map.floor_solid = true;
    map.data.fill(GRASS);
    for x in 0..w {
        for y in 0..h {
            if x < 2 || y < 2 || x >= w - 2 || y >= h - 2 {
                map.set(x, y, RIVER);
            }
        }
    }
    for y in 0..h {
        map.set(24, y, RIVER);
        map.set(25, y, RIVER);
    }
    for x in 24..w {
        map.set(x, 22, RIVER);
        map.set(x, 23, RIVER);
    }
    let pt = |kind, level, x, y, to, req, big| MapPoint {
        kind,
        level,
        x: f64::from(x),
        y: f64::from(y),
        to,
        req,
        big,
    };
    let points = vec![
        pt(PtKind::Saucer, 0, 8, 10, 0, 0, false),
        pt(PtKind::Level, CRATER, 12, 30, 0, 0, false),
        pt(PtKind::Tele, 0, 20, 38, 3, CRATER, false),
        pt(PtKind::Tele, 0, 29, 38, 2, CRATER, false),
        pt(PtKind::Level, CAVES, 46, 35, 0, 0, false),
        pt(PtKind::Tele, 0, 53, 27, 6, CAVES, false),
        pt(PtKind::Tele, 0, 53, 18, 5, CAVES, false),
        pt(PtKind::Level, CITADEL, 41, 8, 0, 0, true),
    ];
    let mut path = |x0: i32, y0: i32, x1: i32, y1: i32| {
        let (sx, sy) = ((x1 - x0).signum(), (y1 - y0).signum());
        if sx != 0 {
            let mut x = x0;
            while x != x1 + sx {
                map.set(x, y0, PATH);
                x += sx;
            }
        }
        if sy != 0 {
            let mut y = y0;
            while y != y1 + sy {
                map.set(x1, y, PATH);
                y += sy;
            }
        }
        map.set(x1, y1, PATH);
    };
    path(8, 9, 12, 30);
    path(12, 30, 20, 38);
    path(29, 38, 46, 35);
    path(46, 35, 53, 27);
    path(53, 18, 41, 8);
    let mut s: u64 = 99;
    let mut r = move || {
        s = (s * 16807) % 2_147_483_647;
        s as f64 / 2_147_483_647.0
    };
    for x in 2..w - 2 {
        for y in 2..h - 2 {
            if map.get(x, y) != GRASS {
                continue;
            }
            let mut near = points
                .iter()
                .any(|p| (p.x - f64::from(x)).abs() < 3.0 && (p.y - f64::from(y)).abs() < 3.0);
            for dx in -1..=1 {
                for dy in -1..=1 {
                    let t = if map.in_bounds(x + dx, y + dy) {
                        map.get(x + dx, y + dy)
                    } else {
                        RIVER
                    };
                    if t == PATH {
                        near = true;
                    }
                }
            }
            if !near {
                let q = r();
                if q < 0.16 {
                    map.set(x, y, TREE);
                } else if q < 0.18 {
                    map.set(x, y, ROCK);
                }
            }
        }
    }
    MapData {
        map,
        points,
        start: (9.2, 8.2),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn count(m: &TileMap, t: u8) -> usize {
        m.data.iter().filter(|&&v| v == t).count()
    }

    #[test]
    fn every_level_has_a_free_start_and_the_right_features() {
        for id in [CRATER, CAVES, CITADEL] {
            let l = build_level(id);
            let (sx, sy) = l.start;
            for dy in 0..2 {
                assert!(
                    !l.map.solid(sx as i32, sy as i32 + dy, false, 0.0),
                    "level {id} start blocked"
                );
            }
            assert!(
                l.map.solid(sx as i32, sy as i32 - 1, false, 0.0),
                "level {id} start floating"
            );
            assert!(count(&l.map, CRYS) > 0);
            assert!(!l.items.is_empty());
            assert!(!l.spawns.is_empty());
        }
        assert_eq!(count(&build_level(CRATER).map, EXIT), 2);
        assert_eq!(count(&build_level(CAVES).map, EXIT), 2);
        assert!(build_level(CITADEL).arena.is_some());
        assert_eq!(build_level(CAVES).plats.len(), 3);
    }

    #[test]
    fn doors_are_paired_with_keys() {
        let c = build_level(CRATER);
        assert!(c.items.iter().any(|i| i.kind == KeyRed));
        assert!(count(&c.map, DOOR_R) > 0);
        let v = build_level(CAVES);
        assert!(v.items.iter().any(|i| i.kind == KeyBlue));
        assert!(count(&v.map, DOOR_B) > 0);
    }

    #[test]
    fn overworld_points_are_walkable_and_teleporters_pair_up() {
        let m = build_overworld();
        for p in &m.points {
            let t = m.map.get(p.x as i32, p.y as i32);
            assert!(
                t == PATH || t == GRASS,
                "point at {},{} on tile {t}",
                p.x,
                p.y
            );
            if p.kind == PtKind::Tele {
                let q = &m.points[p.to];
                assert_eq!(q.kind, PtKind::Tele);
                assert_eq!(
                    q.to,
                    m.points.iter().position(|z| std::ptr::eq(z, p)).unwrap()
                );
            }
        }
        assert_eq!(m.points.len(), 8);
    }
}
