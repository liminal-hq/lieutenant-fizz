// Builders for the Episode 1 levels and overworld tile maps and spawns.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

//! Level and overworld builders: a port of the prototype's `levels.js`.

use crate::ents::{Item, ItemKind, Kind, Spawn};
use crate::render::Theme;
use crate::sprites::Spr;
use crate::tiles::*;
use lf_sim::{Platform, TileMap};

pub const CRATER: u8 = 0;
pub const CAVES: u8 = 1;
pub const CITADEL: u8 = 2;
pub const METEOR_MESA: u8 = 3;
pub const ZARG_LOOKOUT: u8 = 4;
pub const MARSHMALLOW_MEADOWS: u8 = 5;
pub const BONBON_PLAYHOUSE: u8 = 6;

/// Number of levels; level ids are `0..LEVEL_COUNT` and double as bit positions in `Game::done`.
pub const LEVEL_COUNT: u8 = 7;

/// Overworld areas, in the order `MapData::areas` and `area_theme` index them.
pub const AREA_CRATER_FIELDS: u8 = 0;
pub const AREA_MARSHMALLOW_MEADOWS: u8 = 1;
pub const AREA_ROCK_CANDY_REACH: u8 = 2;
pub const AREA_FROSTING_FRONTIER: u8 = 3;

/// Static description of one level: how it is built and where it sits on the overworld.
pub struct LevelDef {
    pub id: u8,
    pub build: fn() -> LevelData,
    pub theme: Theme,
    pub area: u8,
    /// Overworld marker sprite.
    pub icon: Spr,
}

/// Every level, indexed by id.
pub const LEVELS: [LevelDef; LEVEL_COUNT as usize] = [
    LevelDef {
        id: CRATER,
        build: crater,
        theme: Theme::Crater,
        area: AREA_CRATER_FIELDS,
        icon: Spr::OwCrater,
    },
    LevelDef {
        id: CAVES,
        build: caves,
        theme: Theme::Caves,
        area: AREA_ROCK_CANDY_REACH,
        icon: Spr::OwCave,
    },
    LevelDef {
        id: CITADEL,
        build: citadel,
        theme: Theme::Citadel,
        area: AREA_FROSTING_FRONTIER,
        icon: Spr::OwCastle,
    },
    LevelDef {
        id: METEOR_MESA,
        build: meteor_mesa,
        theme: Theme::OpenSky,
        area: AREA_CRATER_FIELDS,
        icon: Spr::OwMesa,
    },
    LevelDef {
        id: ZARG_LOOKOUT,
        build: zarg_lookout,
        theme: Theme::Building,
        area: AREA_CRATER_FIELDS,
        icon: Spr::OwTower,
    },
    LevelDef {
        id: MARSHMALLOW_MEADOWS,
        build: marshmallow_meadows,
        theme: Theme::OpenSky,
        area: AREA_MARSHMALLOW_MEADOWS,
        icon: Spr::OwMeadow,
    },
    LevelDef {
        id: BONBON_PLAYHOUSE,
        build: bonbon_playhouse,
        theme: Theme::Theatre,
        area: AREA_MARSHMALLOW_MEADOWS,
        icon: Spr::OwPlayhouse,
    },
];

/// Bit in `Game::done` for a cleared level.
/// `id` must be a real level id: anything from 32 up would overflow the shift.
pub const fn level_bit(id: u8) -> u32 {
    debug_assert!(id < LEVEL_COUNT);
    1 << id
}
#[derive(Clone, Copy, Debug)]
pub struct Arena {
    pub x0: f64,
    pub x1: f64,
    pub floor: f64,
}

/// A rectangle of tiles (inclusive) hidden behind `FACADE` tiles until Ben steps inside.
#[derive(Clone, Copy, Debug)]
pub struct Room {
    pub x0: i32,
    pub y0: i32,
    pub x1: i32,
    pub y1: i32,
}

impl Room {
    pub fn overlaps(&self, x: f64, y: f64, w: f64, h: f64) -> bool {
        x < f64::from(self.x1 + 1)
            && x + w > f64::from(self.x0)
            && y < f64::from(self.y1 + 1)
            && y + h > f64::from(self.y0)
    }

    pub fn contains(&self, x: i32, y: i32) -> bool {
        x >= self.x0 && x <= self.x1 && y >= self.y0 && y <= self.y1
    }
}

pub struct LevelData {
    pub id: u8,
    pub theme: Theme,
    pub area: u8,
    pub map: TileMap,
    pub spawns: Vec<Spawn>,
    pub items: Vec<Item>,
    pub plats: Vec<Platform>,
    pub start: (f64, f64),
    pub arena: Option<Arena>,
    pub rooms: Vec<Room>,
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
    rooms: Vec<Room>,
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
            rooms: vec![],
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

    /// Hides a rectangle behind painted flats: every empty cell in it becomes `FACADE`, so floors,
    /// ledges and ladders inside stay solid and visible once the flat fades.
    fn room(&mut self, x0: i32, y0: i32, x1: i32, y1: i32) -> &mut Self {
        for x in x0..=x1 {
            for y in y0..=y1 {
                if self.map.get(x, y) == EMPTY {
                    self.map.set(x, y, FACADE);
                }
            }
        }
        self.rooms.push(Room { x0, y0, x1, y1 });
        self
    }

    /// A ladder from standing row `y0` up to the ledge at row `y1`: rungs below, a standable top.
    fn ladder(&mut self, x: i32, y0: i32, y1: i32) -> &mut Self {
        self.fill(x, x, y0, y1 - 1, RUNG);
        self.map.set(x, y1, RUNG_TOP);
        self
    }

    /// `n` columns of stairs rising to the right from standing row `y`; the last column's slope
    /// tile sits on row `y + n - 1`, so the walkable floor above begins at `y + n`.
    fn stairs_right(&mut self, x0: i32, y: i32, n: i32) -> &mut Self {
        for i in 0..n {
            self.fill(x0 + i, x0 + i, y, y + i - 1, FILL);
            self.map.set(x0 + i, y + i, R45);
        }
        self
    }

    /// The mirror image: stairs rising to the left.
    fn stairs_left(&mut self, x0: i32, y: i32, n: i32) -> &mut Self {
        for i in 0..n {
            let h = n - 1 - i;
            self.fill(x0 + i, x0 + i, y, y + h - 1, FILL);
            self.map.set(x0 + i, y + h, L45);
        }
        self
    }

    /// Fills every empty cell in the rectangle with interior wall.
    fn wall_behind(&mut self, x0: i32, x1: i32, y0: i32, y1: i32) -> &mut Self {
        for x in x0..=x1 {
            for y in y0..=y1 {
                if self.map.get(x, y) == EMPTY {
                    self.map.set(x, y, WALLBG);
                }
            }
        }
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
        let def = &LEVELS[id as usize];
        LevelData {
            id,
            theme: def.theme,
            area: def.area,
            map: self.map,
            spawns: self.spawns,
            items: self.items,
            plats: self.plats,
            start,
            arena,
            rooms: self.rooms,
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

/// Open-sky daylight level: biscuit-rock mesas separated by gaps that cloud ledges and a hover
/// platform bridge. Gaps are at most 3 wide unless a ledge or hover platform carries Ben across: Ben
/// only clears 4 tiles by jumping within a tenth of a second of the edge.
fn meteor_mesa() -> LevelData {
    let mut b = Builder::new(200, 30, 4);
    b.run(&[
        (Flat, 12),
        (Up, 2),
        (Flat, 6),
        (Gap, 3),
        (Flat, 9),
        (Up, 3),
        (Flat, 6),
        (Down, 2),
        (Gap, 3),
        (Flat, 6),
        (Up22, 1),
        (Flat, 8),
        (Gap, 6),
        (Flat, 10),
        (Down, 3),
        (Flat, 5),
        (Spikes, 3),
        (Flat, 8),
        (Gap, 8),
        (Flat, 8),
        (Up, 4),
        (Flat, 8),
        (Gap, 5),
        (Flat, 6),
        (Down, 3),
        (Flat, 8),
        (Gap, 3),
        (Flat, 7),
        (Down, 2),
        (Flat, 8),
        (Gap, 6),
        (Flat, 27),
    ]);
    b.walls();
    // Cloud ledges across the wide gaps, level with the neighbouring ground.
    b.plat(64, 65, 7).plat(127, 128, 8).plat(169, 170, 3);
    b.hover(97.0, 4.5, 103.0, 4.5, 0.3);
    b.row(Cheezie, 6, 5, 6, 1)
        .row(Choc, 20, 3, 9, 2)
        .row(Cheezie, 35, 6, 11, 1)
        .item(Cookie, 38, 11)
        .item(Soda, 40, 11)
        .row(Choc, 43, 2, 9, 2)
        .row(Cheezie, 62, 6, 10, 1)
        .row(Cheezie, 68, 5, 10, 2)
        .row(Cheezie, 85, 5, 8, 1)
        .row(Choc, 98, 3, 8, 2)
        .row(Cheezie, 118, 5, 11, 1)
        .item(Soda, 122, 11)
        .item(Cookie, 127, 10)
        .row(Choc, 130, 3, 11, 2)
        .row(Cheezie, 147, 4, 9, 1)
        .row(Choc, 167, 6, 7, 1)
        .row(Cookie, 185, 2, 6, 3);
    b.fill(195, 195, 4, 5, EXIT);
    for x in [8, 30, 50, 74, 110, 121, 154, 182] {
        b.crys(x);
    }
    b.ent(Kind::Gloop, 26.0)
        .ent(Kind::Gloop, 48.0)
        .ent(Kind::Gloop, 72.0)
        .ent(Kind::Gloop, 180.0);
    b.ent(Kind::Hopper, 57.0)
        .ent(Kind::Hopper, 120.0)
        .ent(Kind::Hopper, 162.0)
        .ent(Kind::Gloop, 154.0)
        .ent(Kind::Pod, 108.0);
    b.ent_at(Kind::Drone, 84.5, 11.5)
        .ent_at(Kind::Drone, 141.0, 12.5);
    b.out(METEOR_MESA, (3.0, 4.0), None)
}

/// Nine floors of a Zarg watchtower, 9 tiles apart: climb ladders, stairs and a lift to the roof for
/// the red key, then come back down to the cookie door that guards the exit.
///
/// A flight of stairs lands beyond the end of its run, so each one delivers Ben to a small pocket of
/// floor that holds the next ladder. Floors that no connector reaches have no slab, which leaves
/// tall atriums instead of rooms nobody can enter.
fn zarg_lookout() -> LevelData {
    const W: i32 = 40;
    const H: i32 = 84;
    // Standing row of floor `k`; the slab under it is the row below.
    let y = |k: i32| 3 + 9 * k;
    let mut b = Builder::new(W, H, 3);
    b.fill(0, W - 1, 0, 2, FILL);
    b.fill(0, 0, 0, 80, BLOCK).fill(W - 1, W - 1, 0, 80, BLOCK);
    // Slabs: whole floors for 1, 3, 5, 6 and the roof; pockets for 2, 4 and 7.
    for k in [1, 3, 5, 6, 8] {
        b.fill(1, W - 2, y(k) - 1, y(k) - 1, FILL);
    }
    b.fill(33, 38, y(2) - 1, y(2) - 1, FILL)
        .fill(1, 5, y(4) - 1, y(4) - 1, FILL)
        .fill(35, 38, y(7) - 1, y(7) - 1, FILL);
    // Ground to floor 1: a ladder, with the cookie door sealing the exit closet at the far end.
    b.ladder(18, y(0), y(1) - 1);
    b.fill(36, 36, 3, y(1) - 2, DOOR_R).fill(38, 38, 3, 4, EXIT);
    // Floor 1 to the floor 2 pocket: stairs rising to the right, then a ladder from the pocket.
    b.stairs_right(24, y(1), 9);
    b.ladder(36, y(2), y(3) - 1);
    // Floor 3 to the floor 4 pocket on the left: stairs rising to the left, then a ladder.
    b.stairs_left(6, y(3), 9);
    b.ladder(3, y(4), y(5) - 1);
    // Floor 5 to floor 6: a lift in the middle that waits two seconds at each end.
    b.fill(18, 20, y(6) - 1, y(6) - 1, EMPTY);
    b.plats.push(
        Platform::new(
            18.0,
            f64::from(y(5)) - 0.5,
            18.0,
            f64::from(y(6)) - 0.5,
            0.1,
        )
        .sized(3.0, 0.5)
        .with_dwell(2.0),
    );
    // Floor 6 to the floor 7 pocket: stairs rising to the right, then the last ladder, to the roof.
    b.stairs_right(26, y(6), 9);
    b.ladder(37, y(7), y(8) - 1);
    b.wall_behind(1, W - 2, 3, y(8) - 1);
    // Snacks along the floors, with bigger prizes at the connectors.
    b.row(Cheezie, 6, 6, y(0), 1)
        .row(Cheezie, 8, 6, y(1), 2)
        .row(Cheezie, 34, 4, y(2), 1)
        .row(Cheezie, 16, 6, y(3), 2)
        .row(Cheezie, 12, 6, y(5), 2)
        .row(Cheezie, 22, 3, y(6), 1)
        .row(Cheezie, 36, 3, y(7), 1)
        .row(Cheezie, 8, 6, y(8), 2)
        .item(Soda, 14, y(1))
        .item(Soda, 24, y(5))
        .item(Cookie, 20, y(3))
        .item(Cookie, 30, y(5))
        .item(Cookie, 28, y(8))
        .row(Choc, 3, 3, y(4), 1)
        .row(Choc, 8, 3, y(6), 2)
        .item(KeyRed, 19, y(8));
    for (x, k) in [(14, 0), (20, 1), (22, 3), (12, 5), (15, 6)] {
        b.map.set(x, y(k), CRYS);
    }
    b.ent_at(Kind::Gloop, 14.0, f64::from(y(0)))
        .ent_at(Kind::Hopper, 24.0, f64::from(y(0)))
        .ent_at(Kind::Gloop, 12.0, f64::from(y(1)))
        .ent_at(Kind::Gloop, 20.0, f64::from(y(3)))
        .ent_at(Kind::Hopper, 30.0, f64::from(y(3)))
        .ent_at(Kind::Gloop, 28.0, f64::from(y(5)))
        .ent_at(Kind::Pod, 8.0, f64::from(y(6)))
        .ent_at(Kind::Gloop, 14.0, f64::from(y(6)))
        .ent_at(Kind::Gloop, 14.0, f64::from(y(8)))
        .ent_at(Kind::Hopper, 26.0, f64::from(y(8)));
    // Bats hang from the slab above the fifth floor.
    for x in [10, 14, 28, 33] {
        b.ent_at(Kind::Bat, f64::from(x), f64::from(y(5)) + 7.3);
    }
    b.out(ZARG_LOOKOUT, (3.0, 3.0), None)
}

/// Open sky with soft ground: marshmallows bounce in fenced corrals (pogo onto one for a springboard),
/// and the blue key sits at the top of a stack of cloud ledges. Rises and falls are slopes; gaps are
/// 3 wide.
fn marshmallow_meadows() -> LevelData {
    let mut b = Builder::new(220, 32, 4);
    b.run(&[
        (Flat, 14),
        (Up, 3),
        (Flat, 8),
        (Down, 3),
        (Flat, 10),
        (Gap, 3),
        (Flat, 12),
        (Up22, 2),
        (Flat, 10),
        (Down22, 2),
        (Flat, 10),
        (Gap, 3),
        (Flat, 8),
        (Up, 2),
        (Flat, 24),
        (Gap, 3),
        (Flat, 14),
        (Down, 3),
        (Flat, 6),
        (Gap, 3),
        (Flat, 10),
        (Up, 4),
        (Flat, 14),
        (Gap, 3),
        (Flat, 10),
        (Down, 2),
        (Flat, 30),
    ]);
    b.walls();
    // Corral fences: a marshmallow bounces between two posts Ben can jump over.
    b.fill(29, 29, 4, 5, BLOCK)
        .fill(36, 36, 4, 5, BLOCK)
        .fill(100, 100, 6, 7, BLOCK)
        .fill(108, 108, 6, 7, BLOCK);
    // The blue key, three cloud ledges up: each step is three tiles, within a jump.
    b.plat(58, 60, 8).plat(62, 64, 11).plat(58, 60, 14);
    b.item(KeyBlue, 59, 15);
    b.fill(150, 150, 3, 4, DOOR_B).fill(150, 150, 5, 31, BLOCK);
    b.fill(215, 215, 5, 6, EXIT);
    b.row(Cheezie, 6, 6, 6, 1)
        .row(Cheezie, 18, 6, 9, 1)
        .row(Cheezie, 30, 6, 9, 1)
        .item(Soda, 33, 7)
        .row(Choc, 38, 3, 8, 1)
        .row(Cheezie, 44, 8, 6, 1)
        .item(Cookie, 63, 12)
        .row(Cheezie, 70, 6, 6, 1)
        .row(Choc, 81, 3, 8, 1)
        .row(Cheezie, 96, 4, 9, 1)
        .row(Cheezie, 102, 5, 11, 1)
        .item(Soda, 104, 12)
        .row(Cheezie, 118, 3, 9, 1)
        .row(Cheezie, 125, 6, 8, 1)
        .item(Cookie, 140, 6)
        .row(Choc, 144, 3, 7, 1)
        .row(Cheezie, 160, 5, 9, 1)
        .row(Choc, 175, 3, 11, 1)
        .item(Soda, 182, 10)
        .row(Cookie, 196, 3, 8, 3);
    for x in [8, 24, 48, 74, 96, 126, 142, 164, 185, 205] {
        b.crys(x);
    }
    b.ent(Kind::Marsh, 32.0).ent(Kind::Marsh, 104.0);
    b.ent(Kind::Gloop, 20.0)
        .ent(Kind::Gloop, 45.0)
        .ent(Kind::Gloop, 74.0)
        .ent(Kind::Gloop, 125.0)
        .ent(Kind::Gloop, 195.0)
        .ent(Kind::Hopper, 60.0)
        .ent(Kind::Hopper, 112.0)
        .ent(Kind::Hopper, 165.0)
        .ent(Kind::Pod, 141.0);
    b.ent_at(Kind::Drone, 90.5, 10.5)
        .ent_at(Kind::Drone, 170.5, 12.5);
    b.out(MARSHMALLOW_MEADOWS, (3.0, 4.0), None)
}

/// A candy playhouse whose backstage rooms are hidden behind painted flats: the walls fade away
/// while Ben is inside. The red key is in a room up a stack of ledges, the blue key in one over a
/// bat-haunted stretch, and a beetle waits in a room on the path.
fn bonbon_playhouse() -> LevelData {
    let mut b = Builder::new(170, 30, 4);
    b.run(&[
        (Flat, 16),
        (Up, 2),
        (Flat, 12),
        (Down, 2),
        (Flat, 10),
        (Gap, 3),
        (Flat, 12),
        (Up22, 1),
        (Flat, 10),
        (Down22, 1),
        (Flat, 14),
        (Gap, 3),
        (Flat, 10),
        (Up, 3),
        (Flat, 14),
        (Down, 3),
        (Flat, 10),
        (Gap, 3),
        (Flat, 14),
        (Flat, 25),
    ]);
    b.walls();
    // Red key room: a floor over the path, reached by ledges that start over the first pit.
    b.fill(45, 56, 9, 9, FILL);
    b.plat(42, 43, 5).plat(44, 44, 7);
    b.item(KeyRed, 50, 10)
        .item(Cookie, 54, 10)
        .row(Cheezie, 46, 4, 10, 1);
    b.ent_at(Kind::Hopper, 52.0, 10.0);
    b.room(45, 10, 56, 15);
    // A tutorial room right on the path, with a gloop lying in wait.
    b.row(Cheezie, 20, 6, 7, 1).item(Soda, 27, 7);
    b.ent_at(Kind::Gloop, 24.0, 6.0);
    b.room(18, 6, 29, 11);
    // A room on the path that hides a beetle; it stops at the ledge at the room's end.
    b.row(Choc, 74, 4, 5, 2);
    b.ent_at(Kind::Beetle, 80.0, 4.0);
    b.room(71, 4, 84, 9);
    // Blue key room over the path, reached by four ledges, with bats hanging underneath.
    b.fill(101, 114, 13, 13, FILL);
    b.plat(92, 93, 6).plat(95, 96, 9).plat(98, 99, 12);
    b.item(KeyBlue, 108, 14)
        .item(Cookie, 104, 14)
        .row(Cheezie, 110, 4, 14, 1);
    b.room(101, 14, 114, 19);
    for x in [104.0, 110.0] {
        b.ent_at(Kind::Bat, x, 11.3);
    }
    // Cookie doors seal the way on, with a wall of painted flats above each.
    b.fill(60, 60, 5, 6, DOOR_R).fill(60, 60, 7, 29, BLOCK);
    b.fill(122, 122, 4, 5, DOOR_B).fill(122, 122, 6, 29, BLOCK);
    b.fill(165, 165, 4, 5, EXIT);
    b.row(Cheezie, 6, 6, 6, 1)
        .row(Choc, 34, 3, 7, 1)
        .row(Cheezie, 62, 6, 8, 1)
        .item(Soda, 66, 9)
        .row(Cheezie, 88, 3, 8, 2)
        .row(Cheezie, 118, 4, 8, 1)
        .row(Choc, 134, 4, 7, 2)
        .row(Cookie, 148, 3, 7, 3);
    for x in [10, 36, 64, 90, 118, 138, 158] {
        b.crys(x);
    }
    b.ent(Kind::Gloop, 10.0)
        .ent(Kind::Gloop, 36.0)
        .ent(Kind::Gloop, 66.0)
        .ent(Kind::Gloop, 92.0)
        .ent(Kind::Gloop, 120.0)
        .ent(Kind::Gloop, 140.0)
        .ent(Kind::Pod, 63.0)
        .ent(Kind::Pod, 135.0);
    b.out(BONBON_PLAYHOUSE, (3.0, 4.0), None)
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

/// Builds a level by id; an unknown id falls back to the first level.
pub fn build_level(id: u8) -> LevelData {
    let def = LEVELS.get(usize::from(id)).unwrap_or(&LEVELS[0]);
    (def.build)()
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
    /// Levels (as `level_bit`s) that must all be cleared before this point works; 0 means none.
    pub req: u16,
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
    let req = |id: u8| level_bit(id) as u16;
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
        pt(PtKind::Tele, 0, 20, 38, 3, req(CRATER), false),
        pt(PtKind::Tele, 0, 29, 38, 2, req(CRATER), false),
        pt(PtKind::Level, CAVES, 46, 35, 0, 0, false),
        pt(PtKind::Tele, 0, 53, 27, 6, req(CAVES), false),
        pt(PtKind::Tele, 0, 53, 18, 5, req(CAVES), false),
        pt(PtKind::Level, CITADEL, 41, 8, 0, 0, true),
        // Appended last so the teleporter pairs above keep their indices.
        pt(PtKind::Level, METEOR_MESA, 12, 19, 0, 0, false),
        pt(PtKind::Level, ZARG_LOOKOUT, 15, 19, 0, 0, false),
        pt(PtKind::Level, MARSHMALLOW_MEADOWS, 15, 23, 0, 0, false),
        pt(PtKind::Level, BONBON_PLAYHOUSE, 15, 27, 0, 0, false),
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
        for id in 0..LEVEL_COUNT {
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
            for it in &l.items {
                assert!(
                    !l.map
                        .solid(it.x.floor() as i32, it.y.floor() as i32, false, 0.0),
                    "level {id}: {:?} at {:.1},{:.1} is inside solid ground",
                    it.kind,
                    it.x,
                    it.y
                );
            }
            assert!(!l.spawns.is_empty());
        }
        assert_eq!(count(&build_level(CRATER).map, EXIT), 2);
        assert_eq!(count(&build_level(CAVES).map, EXIT), 2);
        assert!(build_level(CITADEL).arena.is_some());
        assert_eq!(build_level(CAVES).plats.len(), 3);
    }

    #[test]
    fn the_level_table_is_indexed_by_id_and_every_builder_agrees() {
        assert_eq!(LEVELS.len(), usize::from(LEVEL_COUNT));
        for (i, def) in LEVELS.iter().enumerate() {
            assert_eq!(usize::from(def.id), i, "table slot {i} holds id {}", def.id);
            let l = (def.build)();
            assert_eq!(l.id, def.id);
            assert_eq!(l.theme, def.theme);
            assert_eq!(l.area, def.area);
        }
        assert_eq!(
            build_level(200).id,
            0,
            "unknown ids fall back to the first level"
        );
    }

    /// Widest run of columns with nothing to stand on, ignoring columns a hover platform spans.
    fn widest_unsupported_gap(l: &LevelData) -> i32 {
        let (mut widest, mut run) = (0, 0);
        for x in 1..l.map.w - 1 {
            let carried = l.plats.iter().any(|p| {
                f64::from(x) + 1.0 > p.ax.min(p.bx) && f64::from(x) < p.ax.max(p.bx) + p.w
            });
            let supported = (0..l.map.h - 1).any(|y| {
                let t = l.map.get(x, y);
                let top = l.map.props.flags(t) != 0 || l.map.is_slope(t);
                top && t != CHOC && l.map.get(x, y + 1) == EMPTY
            });
            if supported || carried {
                run = 0;
            } else {
                run += 1;
                widest = widest.max(run);
            }
        }
        widest
    }

    #[test]
    fn meteor_mesa_has_no_gap_wider_than_a_comfortable_jump() {
        let l = build_level(METEOR_MESA);
        assert!(
            widest_unsupported_gap(&l) <= 3,
            "gap of {} columns",
            widest_unsupported_gap(&l)
        );
        assert_eq!(count(&l.map, EXIT), 2);
        assert!(l.arena.is_none() && l.plats.len() == 1);
        assert_eq!(l.theme, Theme::OpenSky);
    }

    #[test]
    fn progress_bits_cover_every_level() {
        for id in 0..LEVEL_COUNT {
            assert_ne!(crate::world::PROGRESS_BITS & level_bit(id), 0);
        }
        assert_eq!(
            crate::world::PROGRESS_BITS & crate::world::SECRET_FOUND,
            crate::world::SECRET_FOUND
        );
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
        assert_eq!(m.points.len(), 12);
    }
}
