// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

//! The Episode 1 world: game state, level and overworld simulation, player and enemy logic.
//! A port of the prototype's `engine.js` simulation half, with f64 state and a deterministic
//! fixed 60 Hz step.

use crate::ents::*;
use crate::levels::{self, Arena, MapPoint, PtKind};
use crate::sprites::Spr;
use crate::text::{ev, Cap, Toast};
use crate::tiles::*;
use lf_sim::{
    hashf, Body, EventQueue, InstanceBuffer, LightPool, Platform, Rng, SpriteRect, TileMap,
    GRAVITY, STEP,
};

pub const MAX_INSTANCES: usize = 120_000;

/// Input bits passed to `step`.
pub mod input {
    pub const LEFT: u32 = 1;
    pub const RIGHT: u32 = 2;
    pub const UP: u32 = 4;
    pub const DOWN: u32 = 8;
    pub const JUMP: u32 = 16;
    pub const POGO: u32 = 32;
    pub const FIRE: u32 = 64;
    pub const CONFIRM: u32 = 128;
}
use input::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
    /// Nothing simulated (cinematics are drawn by the shell).
    None,
    /// A level scrolling by behind the title screen.
    Attract,
    Map,
    Level,
}

/// Progress that survives across levels (and is saved).
#[derive(Clone, Debug)]
pub struct Game {
    pub lives: i32,
    pub score: i32,
    pub next_life: i32,
    pub ammo: i32,
    pub done: [bool; 3],
    pub map_pos: Option<(f64, f64)>,
}

impl Game {
    pub fn fresh() -> Self {
        Game {
            lives: 3,
            score: 0,
            next_life: 100,
            ammo: 5,
            done: [false; 3],
            map_pos: None,
        }
    }
}

#[derive(Clone, Debug)]
pub struct Player {
    pub b: Body,
    pub face: f64,
    pub pogo: bool,
    pub cut: bool,
    pub anim: f64,
    pub shoot_t: f64,
    /// 0 while alive, otherwise seconds since death.
    pub dead: f64,
    pub dead_sent: bool,
    pub inv: f64,
    pub squash: f64,
    pub look_down: f64,
    pub rot: f64,
    pub hidden: bool,
}

impl Player {
    pub fn level(x: f64, y: f64) -> Self {
        Player {
            b: Body::new(x, y, 0.7, 1.4),
            face: 1.0,
            pogo: false,
            cut: false,
            anim: 0.0,
            shoot_t: 0.0,
            dead: 0.0,
            dead_sent: false,
            inv: 0.0,
            squash: 0.0,
            look_down: 0.0,
            rot: 0.0,
            hidden: false,
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct StaticLight {
    pub x: f64,
    pub y: f64,
    pub c: [f64; 3],
}

#[derive(Clone, Copy, Debug)]
pub struct Hazard {
    pub x: f64,
    pub y: f64,
    pub w: f64,
}

pub struct World {
    pub mode: Mode,
    pub game: Game,
    pub pogo_height: f64,
    pub held: u32,
    pub prev_held: u32,
    pub edge: u32,
    pub tick_count: u32,
    pub rng: Rng,
    pub t: f64,
    pub half_w: f64,
    pub half_h: f64,

    // Camera (world units). `p` prefix = previous tick, for interpolation.
    pub cam_x: f64,
    pub cam_y: f64,
    pub pcx: f64,
    pub pcy: f64,
    pub shake: f64,

    // Scene (level or overworld)
    pub level_id: u8,
    pub biome: u8,
    pub map: TileMap,
    pub ents: Vec<Ent>,
    pub items: Vec<Item>,
    pub plats: Vec<Platform>,
    pub shots: Vec<Shot>,
    pub fx: Vec<Fx>,
    pub static_lights: Vec<StaticLight>,
    pub hazards: Vec<Hazard>,
    pub p: Player,
    pub keys_red: bool,
    pub keys_blue: bool,
    pub has_usb: bool,
    pub hacked: bool,
    pub won: bool,
    pub end_timer: Option<f64>,
    pub arena: Option<Arena>,
    pub solid_count: usize,
    pub points: Vec<MapPoint>,
    pub near: Option<usize>,

    // Output buffers shared with the shell
    pub inst: InstanceBuffer,
    pub lights: LightPool,
    pub lights_pos: [f32; 64],
    pub lights_col: [f32; 48],
    pub events: EventQueue,
    pub spr: Vec<SpriteRect>,
    pub out: [f32; 16],
}

pub fn sign(x: f64) -> f64 {
    if x > 0.0 {
        1.0
    } else if x < 0.0 {
        -1.0
    } else {
        0.0
    }
}

fn sign_or1(x: f64) -> f64 {
    let s = sign(x);
    if s == 0.0 {
        1.0
    } else {
        s
    }
}

pub fn ground_ahead(map: &TileMap, e: &Ent) -> bool {
    let fx = if e.dir > 0.0 {
        e.b.x + e.b.w + 0.05
    } else {
        e.b.x - 0.05
    };
    let cx = fx.floor() as i32;
    let cy = (e.b.y - 0.1).floor() as i32;
    let t = map.get(cx, cy);
    let t2 = map.get(cx, e.b.y.floor() as i32);
    if t == SPIKE || t == CHOC || t2 == SPIKE {
        return false;
    }
    map.solid(cx, cy, true, e.b.y) || map.is_slope(t) || map.is_slope(t2)
}

impl Default for World {
    fn default() -> Self {
        Self::new()
    }
}

impl World {
    pub fn new() -> Self {
        World {
            mode: Mode::None,
            game: Game::fresh(),
            pogo_height: 6.6,
            held: 0,
            prev_held: 0,
            edge: 0,
            tick_count: 0,
            rng: Rng::new(0x5eed),
            t: 0.0,
            half_w: 10.0,
            half_h: 6.5,
            cam_x: 0.0,
            cam_y: 0.0,
            pcx: 0.0,
            pcy: 0.0,
            shake: 0.0,
            level_id: 0,
            biome: 0,
            map: TileMap::new(1, 1, props()),
            ents: vec![],
            items: vec![],
            plats: vec![],
            shots: vec![],
            fx: vec![],
            static_lights: vec![],
            hazards: vec![],
            p: Player::level(0.0, 0.0),
            keys_red: false,
            keys_blue: false,
            has_usb: false,
            hacked: false,
            won: false,
            end_timer: None,
            arena: None,
            solid_count: 0,
            points: vec![],
            near: None,
            inst: InstanceBuffer::new(MAX_INSTANCES),
            lights: LightPool::new(256),
            lights_pos: [0.0; 64],
            lights_col: [0.0; 48],
            events: EventQueue::new(256),
            spr: vec![SpriteRect::default(); crate::sprites::SPRITE_NAMES.len()],
            out: [0.0; 16],
        }
    }

    // ---------- Flow ----------

    pub fn game_new(&mut self) {
        self.game = Game::fresh();
        self.hud();
    }

    pub fn hud(&mut self) {
        self.events.emit(ev::HUD, 0.0, 0.0, 0.0);
    }

    pub fn cap(&mut self, x: f64, y: f64, c: Cap) {
        self.events.emit(ev::CAPTION, x, y, f64::from(c as u16));
    }

    fn toast(&mut self, t: Toast) {
        self.events.emit(ev::TOAST, f64::from(t as u16), 0.0, 0.0);
    }

    pub fn load_attract(&mut self) {
        self.load_level(levels::CRATER);
        self.mode = Mode::Attract;
        self.p.hidden = true;
    }

    pub fn enter_level(&mut self, id: u8) {
        if self.mode == Mode::Map {
            if let Some(pt) = self
                .points
                .iter()
                .find(|p| p.kind == PtKind::Level && p.level == id)
            {
                self.game.map_pos = Some((pt.x + 0.2, pt.y - 1.0));
            }
        }
        self.load_level(id);
        self.mode = Mode::Level;
        self.hud();
        self.events.emit(ev::LEVEL_START, f64::from(id), 0.0, 0.0);
    }

    pub fn load_level(&mut self, id: u8) {
        let d = levels::build_level(id);
        self.level_id = id;
        self.biome = id;
        self.map = d.map;
        self.t = 0.0;
        self.shots.clear();
        self.fx.clear();
        self.keys_red = false;
        self.keys_blue = false;
        self.has_usb = false;
        self.hacked = false;
        self.won = false;
        self.end_timer = None;
        self.shake = 0.0;
        self.near = None;
        self.points.clear();
        self.items = d.items;
        self.plats = d.plats;
        self.arena = d.arena;
        self.ents = d.spawns.iter().map(|s| self.init_ent(s)).collect();
        self.p = Player::level(d.start.0, d.start.1);
        self.cam_x = d.start.0 + 6.0;
        self.cam_y = d.start.1 + 3.0;
        self.pcx = self.cam_x;
        self.pcy = self.cam_y;
        let (w, h) = (self.map.w, self.map.h);
        let bio = crate::render::biome(self.biome);
        self.static_lights.clear();
        for y in 0..h {
            for x in 0..w {
                let t = self.map.get(x, y);
                if t == CRYS {
                    self.static_lights.push(StaticLight {
                        x: f64::from(x) + 0.5,
                        y: f64::from(y) + 0.7,
                        c: bio.lc,
                    });
                }
                if t == EXIT && self.map.get(x, y + 1) != EXIT {
                    self.static_lights.push(StaticLight {
                        x: f64::from(x) + 0.5,
                        y: f64::from(y) + 0.4,
                        c: [0.35, 0.9, 0.4],
                    });
                }
            }
        }
        self.solid_count = self.map.data.iter().filter(|&&t| t != 0).count();
        self.hazards.clear();
        for y in 0..h {
            let mut run: i32 = -1;
            for x in 0..=w {
                let t = if x < w { self.map.get(x, y) } else { 0 };
                let top = t == SPIKE || (t == CHOC && self.map.get(x, y + 1) != CHOC);
                if top && run < 0 {
                    run = x;
                }
                if !top && run >= 0 {
                    self.hazards.push(Hazard {
                        x: f64::from(run + x) / 2.0,
                        y: f64::from(y) + 0.7,
                        w: f64::from(x - run),
                    });
                    run = -1;
                }
            }
        }
    }

    fn init_ent(&self, s: &Spawn) -> Ent {
        let d = info(s.kind);
        let mut e = Ent {
            kind: s.kind,
            b: Body::new(s.x - d.w / 2.0 + 0.5, s.y, d.w, d.h),
            dir: -1.0,
            stun: 0.0,
            t: hashf(s.x as i32, 7) * 10.0,
            cd: 0.0,
            fire_t: 1.5,
            state: St::Idle,
            st: 0.0,
            ax: 0.0,
            ay: 0.0,
            rot: 0.0,
            alpha: 1.0,
            hp: 0,
            puff: false,
            touch: false,
            dead: false,
        };
        e.ax = e.b.x;
        e.ay = e.b.y;
        if s.kind == Kind::Bat {
            let (w, h) = (self.map.w, self.map.h);
            let _ = w;
            let mut y = s.y.floor() as i32;
            let cx = s.x.floor() as i32;
            while y < h - 1 && !self.map.is_solid_tile(self.map.get(cx, y)) {
                y += 1;
            }
            e.b.y = f64::from(y) - e.b.h;
            e.ay = e.b.y;
            e.b.py = e.b.y;
        }
        if s.kind == Kind::Boss {
            e.hp = 3;
            e.state = St::Wait;
            e.b.x = s.x;
            e.b.px = s.x;
            e.ax = s.x;
        }
        e
    }

    pub fn enter_map(&mut self) {
        let m = levels::build_overworld();
        self.map = m.map;
        self.points = m.points;
        self.mode = Mode::Map;
        self.t = 0.0;
        self.fx.clear();
        self.shots.clear();
        self.ents.clear();
        self.items.clear();
        self.plats.clear();
        self.near = None;
        let at = self.game.map_pos.unwrap_or(m.start);
        let mut b = Body::new(at.0, at.1, 0.6, 0.6);
        b.px = at.0;
        b.py = at.1;
        self.p = Player::level(at.0, at.1);
        self.p.b = b;
        self.cam_x = at.0;
        self.cam_y = at.1;
        self.pcx = at.0;
        self.pcy = at.1;
        self.hud();
        self.events.emit(ev::MAP_PROMPT, 0.0, 0.0, 0.0);
    }

    // ---------- Tick ----------

    pub fn step(&mut self, held: u32) {
        self.edge = held & !self.prev_held;
        self.prev_held = held;
        self.held = held;
        if self.mode == Mode::None {
            return;
        }
        let dt = STEP;
        self.tick_count = self.tick_count.wrapping_add(1);
        self.t += dt;
        self.p.b.px = self.p.b.x;
        self.p.b.py = self.p.b.y;
        self.pcx = self.cam_x;
        self.pcy = self.cam_y;
        for f in &mut self.fx {
            f.t += dt;
        }
        self.fx.retain(|f| f.t < f.life);
        match self.mode {
            Mode::Map => {
                self.tick_map(dt);
                self.follow(dt, 0.0, 0.0);
            }
            Mode::Attract => {
                let w = f64::from(self.map.w);
                self.cam_x = 14.0 + ((self.t * 0.04 - 1.57).sin() * 0.5 + 0.5) * (w - 28.0);
                self.cam_y = 9.0;
                self.pcx = self.cam_x;
                self.tick_ents(dt);
            }
            Mode::Level => {
                for pl in &mut self.plats {
                    pl.tick(dt);
                }
                self.tick_ben(dt);
                self.tick_ents(dt);
                self.tick_shots(dt);
                if let Some(t) = self.end_timer {
                    if t - dt <= 0.0 {
                        self.end_timer = None;
                        self.events.emit(ev::ENDING, 0.0, 0.0, 0.0);
                    } else {
                        self.end_timer = Some(t - dt);
                    }
                }
                if self.shake > 0.0 {
                    self.shake = (self.shake - dt * 2.0).max(0.0);
                }
                let up = if self.p.look_down > 0.2 { -3.6 } else { 1.6 };
                self.follow(dt, self.p.face * 1.5, up);
            }
            Mode::None => {}
        }
    }

    fn follow(&mut self, dt: f64, look: f64, up: f64) {
        let (hw, hh) = (self.half_w, self.half_h);
        if self.p.dead == 0.0 {
            let tx = self.p.b.x + self.p.b.w / 2.0 + look;
            let ty = self.p.b.y + up;
            self.cam_x += (tx - self.cam_x) * (5.0 * dt).min(1.0);
            self.cam_y += (ty - self.cam_y) * (3.5 * dt).min(1.0);
        }
        let (w, h) = (f64::from(self.map.w), f64::from(self.map.h));
        self.cam_x = if hw * 2.0 < w {
            self.cam_x.clamp(hw, w - hw)
        } else {
            w / 2.0
        };
        self.cam_y = if hh * 2.0 < h {
            self.cam_y.clamp(hh, h - hh)
        } else {
            h / 2.0
        };
    }

    // ---------- Overworld ----------

    fn tick_map(&mut self, dt: f64) {
        let h = self.held;
        let vx = f64::from(u8::from(h & RIGHT != 0)) - f64::from(u8::from(h & LEFT != 0));
        let vy = f64::from(u8::from(h & UP != 0)) - f64::from(u8::from(h & DOWN != 0));
        let l = vx.hypot(vy);
        let l = if l == 0.0 { 1.0 } else { l };
        self.p.b.vx = vx / l * 5.0;
        self.p.b.vy = vy / l * 5.0;
        if vx != 0.0 {
            self.p.face = vx;
        }
        let (dx, dy) = (self.p.b.vx * dt, self.p.b.vy * dt);
        self.p.b.move_x(&self.map, dx, false);
        self.p.b.move_y(&self.map, dy);
        if vx != 0.0 || vy != 0.0 {
            self.p.anim += dt * 6.0;
        }
        let mut near = None;
        for (i, pt) in self.points.iter().enumerate() {
            let d = (self.p.b.x + 0.3 - (pt.x + 0.5)).hypot(self.p.b.y + 0.3 - (pt.y + 0.5));
            if d < if pt.big { 1.6 } else { 0.95 } {
                near = Some(i);
            }
        }
        if near != self.near {
            self.near = near;
            match near {
                None => self.events.emit(ev::MAP_PROMPT, 0.0, 0.0, 0.0),
                Some(i) => {
                    let pt = self.points[i];
                    match pt.kind {
                        PtKind::Level => {
                            let done = self.game.done[pt.level as usize];
                            self.events.emit(
                                ev::MAP_PROMPT,
                                1.0,
                                f64::from(pt.level),
                                f64::from(u8::from(done)),
                            );
                        }
                        PtKind::Tele => {
                            let done = self.game.done[pt.req as usize];
                            self.events.emit(
                                ev::MAP_PROMPT,
                                2.0,
                                f64::from(pt.req),
                                f64::from(u8::from(done)),
                            );
                        }
                        PtKind::Saucer => self.events.emit(ev::MAP_PROMPT, 3.0, 0.0, 0.0),
                    }
                }
            }
        }
        if let Some(i) = near {
            if self.edge & (JUMP | FIRE | CONFIRM) != 0 {
                self.activate(i);
            }
        }
    }

    fn activate(&mut self, i: usize) {
        let pt = self.points[i];
        match pt.kind {
            PtKind::Level => self.enter_level(pt.level),
            PtKind::Tele if self.game.done[pt.req as usize] => {
                let to = self.points[pt.to];
                let (px, py) = (self.p.b.x, self.p.b.y);
                self.cap(px, py + 1.0, Cap::Vworp);
                self.p.b.x = to.x + 0.2;
                self.p.b.y = to.y - 1.2;
                self.p.b.px = self.p.b.x;
                self.p.b.py = self.p.b.y;
                self.cam_x = self.p.b.x;
                self.cam_y = self.p.b.y;
                self.pcx = self.cam_x;
                self.pcy = self.cam_y;
                self.near = None;
            }
            _ => {}
        }
    }

    // ---------- Player ----------

    fn tick_ben(&mut self, dt: f64) {
        let (h, e) = (self.held, self.edge);
        if self.p.dead > 0.0 {
            let p = &mut self.p;
            p.dead += dt;
            p.b.vy -= 30.0 * dt;
            p.b.x += p.b.vx * dt;
            p.b.y += p.b.vy * dt;
            p.rot += dt * 8.0;
            if p.dead > 1.4 && !p.dead_sent {
                p.dead_sent = true;
                self.on_death();
            }
            return;
        }
        if self.won {
            return;
        }
        if self.p.inv > 0.0 {
            self.p.inv -= dt;
        }
        if self.p.shoot_t > 0.0 {
            self.p.shoot_t -= dt;
        }
        if let Some(i) = self.p.b.on_plat {
            let (dx, dy) = (self.plats[i].dx, self.plats[i].dy);
            self.p.b.x += dx;
            self.p.b.y += dy;
        }
        if e & POGO != 0 {
            self.p.pogo = !self.p.pogo;
        }
        let ax = f64::from(u8::from(h & RIGHT != 0)) - f64::from(u8::from(h & LEFT != 0));
        let jump_held = h & JUMP != 0;
        {
            let p = &mut self.p;
            if ax != 0.0 {
                p.face = ax;
            }
            p.look_down = if h & DOWN != 0 && h & UP == 0 && p.b.on_ground && !p.pogo && ax == 0.0 {
                p.look_down + dt
            } else {
                0.0
            };
            let b = &mut p.b;
            if b.on_ground && !p.pogo {
                if ax != 0.0 {
                    b.vx += ax * if sign(b.vx) == -ax { 90.0 } else { 55.0 } * dt;
                } else {
                    let f = 60.0 * dt;
                    b.vx = if b.vx.abs() <= f {
                        0.0
                    } else {
                        b.vx - sign(b.vx) * f
                    };
                }
            } else {
                b.vx += ax * 32.0 * dt;
                if ax == 0.0 {
                    b.vx *= 1.0 - 1.5 * dt;
                }
            }
            b.vx = b.vx.clamp(-7.0, 7.0);
        }
        if self.p.b.on_ground {
            if self.p.pogo {
                let hgt = self.pogo_height;
                self.p.b.vy = if jump_held {
                    (2.0 * GRAVITY * hgt).sqrt()
                } else {
                    14.0
                };
                self.p.b.on_ground = false;
                self.p.squash = 0.12;
                let (x, y) = (self.p.b.x + 0.35, self.p.b.y);
                self.cap(x, y, Cap::Boing);
            } else if e & JUMP != 0 {
                let (x, y) = (self.p.b.x, self.p.b.y);
                self.cap(x, y, Cap::Jump);
                self.p.b.vy = 20.5;
                self.p.cut = true;
                self.p.b.on_ground = false;
            }
        }
        {
            let p = &mut self.p;
            if p.cut && !jump_held && p.b.vy > 0.0 {
                p.b.vy *= 0.45;
                p.cut = false;
            }
            if p.b.vy <= 0.0 {
                p.cut = false;
            }
            if p.squash > 0.0 {
                p.squash -= dt;
            }
            p.b.vy = (p.b.vy - GRAVITY * dt).max(-22.0);
        }
        if e & FIRE != 0 {
            self.fire();
        }
        self.p.b.phys(&self.map, &self.plats, dt);
        if self.p.b.bonk && self.p.pogo {
            self.p.b.vy = 0.0;
        }
        self.p.anim += self.p.b.vx.abs() * dt;

        // Hazards, doors, exit.
        let (px, py, pw, ph) = (self.p.b.x, self.p.b.y, self.p.b.w, self.p.b.h);
        let mut die = py < -1.5;
        for cx in (px.floor() as i32)..=((px + pw).floor() as i32) {
            for cy in (py.floor() as i32)..=((py + ph).floor() as i32) {
                let t = self.map.get(cx, cy);
                if t == SPIKE && py < f64::from(cy) + 0.55 {
                    die = true;
                }
                if t == CHOC {
                    let lim = if self.map.get(cx, cy + 1) == CHOC {
                        1.0
                    } else {
                        0.55
                    };
                    if py < f64::from(cy) + lim {
                        die = true;
                    }
                }
                if t == EXIT && !self.won {
                    self.won = true;
                    self.game.done[self.level_id as usize] = true;
                    self.cap(px, py + 2.0, Cap::TaDa);
                    self.hud();
                    self.events
                        .emit(ev::LEVEL_COMPLETE, f64::from(self.level_id), 0.0, 0.0);
                    return;
                }
            }
        }
        for (tt, red) in [(DOOR_R, true), (DOOR_B, false)] {
            let has = if red { self.keys_red } else { self.keys_blue };
            if !has {
                continue;
            }
            let cx = if self.p.face > 0.0 {
                (px + pw + 0.1).floor() as i32
            } else {
                (px - 0.1).floor() as i32
            };
            if self.map.get(cx, (py + 0.2).floor() as i32) == tt {
                for v in self.map.data.iter_mut() {
                    if *v == tt {
                        *v = 0;
                    }
                }
                if red {
                    self.keys_red = false;
                } else {
                    self.keys_blue = false;
                }
                self.cap(f64::from(cx) + 0.5, py + 2.0, Cap::Clunk);
                self.hud();
                self.toast(if red { Toast::RedDoor } else { Toast::BlueDoor });
            }
        }
        if die {
            self.kill();
            return;
        }

        // Items
        for i in 0..self.items.len() {
            let it = self.items[i];
            if it.taken || !self.p.b.overlaps(it.x - 0.4, it.y - 0.4, 0.8, 0.8) {
                continue;
            }
            self.items[i].taken = true;
            match it.kind {
                ItemKind::Cheezie | ItemKind::Choc | ItemKind::Cookie => {
                    self.game.score += match it.kind {
                        ItemKind::Cheezie => 1,
                        ItemKind::Choc => 2,
                        _ => 5,
                    };
                    self.cap(it.x, it.y + 0.6, Cap::Crunch);
                    while self.game.score >= self.game.next_life {
                        self.game.lives += 1;
                        self.game.next_life += 100;
                        self.cap(px, py + 2.2, Cap::ExtraLife);
                        self.toast(Toast::ExtraLife);
                    }
                }
                ItemKind::Soda => {
                    self.game.ammo += 5;
                    self.cap(it.x, it.y + 0.6, Cap::Fsssht);
                }
                ItemKind::KeyRed => {
                    self.keys_red = true;
                    self.cap(it.x, it.y + 0.6, Cap::RedGumdrop);
                }
                ItemKind::KeyBlue => {
                    self.keys_blue = true;
                    self.cap(it.x, it.y + 0.6, Cap::BlueGumdrop);
                }
                ItemKind::Usb => {
                    self.has_usb = true;
                    self.cap(it.x, it.y + 0.6, Cap::GoldUsb);
                    self.toast(Toast::UsbFound);
                }
            }
            self.hud();
        }

        // Entity contact
        for i in 0..self.ents.len() {
            let en = self.ents[i].clone();
            let b = &en.b;
            if en.dead || !self.p.b.overlaps(b.x, b.y, b.w, b.h) {
                self.ents[i].touch = false;
                continue;
            }
            let first = !en.touch;
            self.ents[i].touch = true;
            let d = info(en.kind);
            match en.kind {
                Kind::Switch => {
                    if first {
                        self.map.switch_on = !self.map.switch_on;
                        self.cap(b.x + 0.4, b.y + 1.4, Cap::ClickClack);
                        self.toast(if self.map.switch_on {
                            Toast::BridgeOn
                        } else {
                            Toast::BridgeOff
                        });
                    }
                    continue;
                }
                Kind::Terminal => {
                    if first {
                        if self.has_usb && !self.hacked {
                            self.hacked = true;
                            self.has_usb = false;
                            self.hud();
                            self.cap(b.x + 0.5, b.y + 2.0, Cap::BeepBoop);
                            self.end_timer = Some(1.4);
                        } else if !self.hacked {
                            self.cap(b.x + 0.5, b.y + 2.0, Cap::NeedsDrive);
                        }
                    }
                    continue;
                }
                _ => {}
            }
            if d.prop {
                continue;
            }
            let stomp = self.p.b.vy < 0.0 && self.p.b.py >= b.y + b.h * 0.55;
            if en.kind == Kind::Marsh {
                if stomp {
                    self.p.b.vy = if self.p.pogo { 26.0 } else { 18.0 };
                    let (x, y) = (self.p.b.x, self.p.b.y);
                    self.cap(x, y, Cap::Sproing);
                } else if first {
                    let diff = self.p.b.x - b.x;
                    self.p.b.vx = sign(if diff == 0.0 { 1.0 } else { diff }) * 12.0;
                    self.p.b.vy = self.p.b.vy.max(7.0);
                    self.p.b.on_ground = false;
                    self.cap(b.x, b.y + 1.2, Cap::Bwomp);
                }
                continue;
            }
            if en.stun > 0.0 || d.harmless {
                if stomp {
                    self.p.b.vy = if self.p.pogo { 20.0 } else { 12.0 };
                }
                continue;
            }
            if en.kind == Kind::Boss {
                if stomp && en.state == St::Hot {
                    self.hit_boss(i);
                    self.p.b.vy = 22.0;
                    continue;
                }
            } else if stomp && d.stun {
                self.ents[i].stun = 3.0;
                self.p.b.vy = if self.p.pogo { 20.0 } else { 12.0 };
                self.cap(b.x + b.w / 2.0, b.y + b.h + 0.4, Cap::Bonk);
                continue;
            }
            if en.kind == Kind::Boss && en.state == St::Down {
                continue;
            }
            if self.p.inv <= 0.0 {
                self.kill();
                return;
            }
        }
        for i in 0..self.ents.len() {
            let en = &self.ents[i];
            if en.kind == Kind::Pod && en.puff && en.stun <= 0.0 {
                let (x, y, w) = (en.b.x, en.b.y, en.b.w);
                if self.p.b.overlaps(x - 2.2, y, 2.1, 1.2)
                    || self.p.b.overlaps(x + w + 0.1, y, 2.1, 1.2)
                {
                    self.kill();
                    return;
                }
            }
        }
    }

    fn fire(&mut self) {
        let (px, py) = (self.p.b.x, self.p.b.y);
        if self.game.ammo <= 0 {
            self.cap(px + 0.35, py + 1.6, Cap::NoFizz);
            return;
        }
        self.game.ammo -= 1;
        self.hud();
        let p = &self.p;
        let (mut vx, mut vy) = (p.face * 16.0, 0.0);
        let (mut sx, mut sy) = (p.b.x + p.b.w / 2.0 + p.face * 0.6, p.b.y + 0.85);
        if self.held & UP != 0 {
            (vx, vy, sx, sy) = (0.0, 16.0, p.b.x + p.b.w / 2.0, p.b.y + 1.5);
        } else if self.held & DOWN != 0 && !p.b.on_ground {
            (vx, vy, sx, sy) = (0.0, -16.0, p.b.x + p.b.w / 2.0, p.b.y);
        }
        self.shots.push(Shot {
            x: sx,
            y: sy,
            vx,
            vy,
            ben: true,
            life: 1.1,
            sprite: Spr::Bubble as u16,
            g: false,
        });
        self.p.shoot_t = 0.25;
        self.cap(sx, sy + 0.5, Cap::Fzzt);
    }

    pub fn kill(&mut self) {
        if self.p.dead > 0.0 {
            return;
        }
        let p = &mut self.p;
        p.dead = 0.001;
        p.b.vy = 14.0;
        p.b.vx = -p.face * 2.0;
        p.pogo = false;
        self.shake = 0.6;
        let (x, y) = (self.p.b.x, self.p.b.y + 1.6);
        self.cap(x, y, Cap::Whoa);
    }

    fn on_death(&mut self) {
        self.game.lives -= 1;
        self.hud();
        if self.game.lives < 0 {
            self.events
                .emit(ev::GAME_OVER, f64::from(self.game.score), 0.0, 0.0);
        } else {
            self.events.emit(
                ev::DIED,
                f64::from(self.game.lives),
                f64::from(self.level_id),
                0.0,
            );
        }
    }

    // ---------- Enemies ----------

    fn tick_ents(&mut self, dt: f64) {
        for i in 0..self.ents.len() {
            let mut e = self.ents[i].clone();
            e.b.px = e.b.x;
            e.b.py = e.b.y;
            e.t += dt;
            if e.dead || info(e.kind).prop {
                self.ents[i] = e;
                continue;
            }
            if e.kind == Kind::Boss {
                self.ents[i] = e;
                self.tick_boss(i, dt);
                continue;
            }
            self.ai(&mut e, dt);
            self.ents[i] = e;
        }
    }

    fn ai(&mut self, e: &mut Ent, dt: f64) {
        let d = info(e.kind);
        if e.stun > 0.0 {
            e.stun -= dt;
            if !d.fly {
                e.b.vx = 0.0;
                e.b.fall(dt, 20.0);
                e.b.phys(&self.map, &self.plats, dt);
            } else if e.kind == Kind::Bat {
                e.b.move_y(&self.map, -4.0 * dt);
            }
            return;
        }
        let (pcx, py) = (self.p.b.x + self.p.b.w / 2.0, self.p.b.y);
        let dx = pcx - (e.b.x + e.b.w / 2.0);
        let dy = py - e.b.y;
        let ben = self.p.dead == 0.0 && !self.p.hidden;
        match e.kind {
            Kind::Gloop => {
                e.b.vx = e.dir * 1.5;
                e.b.fall(dt, 20.0);
                e.b.phys(&self.map, &self.plats, dt);
                if e.b.hit_x || (e.b.on_ground && !ground_ahead(&self.map, e)) {
                    e.dir *= -1.0;
                }
            }
            Kind::Hopper => {
                e.b.fall(dt, 20.0);
                e.cd -= dt;
                let behind = sign(e.b.x - self.p.b.x) == -self.p.face;
                if e.b.on_ground {
                    e.b.vx = 0.0;
                    if ben && behind && dx.abs() < 10.0 && dy.abs() < 4.0 && e.cd <= 0.0 {
                        e.dir = sign_or1(dx);
                        e.b.vy = 13.0;
                        e.b.vx = e.dir * 5.5;
                        e.cd = 0.55;
                    }
                }
                e.b.phys(&self.map, &self.plats, dt);
            }
            Kind::Marsh => {
                e.b.vx = e.dir * 2.2;
                e.b.fall(dt, 20.0);
                e.b.phys(&self.map, &self.plats, dt);
                if e.b.on_ground {
                    e.b.vy = 11.0;
                }
                if e.b.hit_x {
                    e.dir *= -1.0;
                }
            }
            Kind::Beetle => {
                e.b.fall(dt, 20.0);
                if e.state == St::Charge {
                    e.b.vx = e.dir * 9.0;
                    e.st -= dt;
                    e.b.phys(&self.map, &self.plats, dt);
                    if e.b.hit_x {
                        e.state = St::Idle;
                        e.stun = 1.2;
                        let (x, y) = (e.b.x + 0.5, e.b.y + 1.0);
                        self.cap(x, y, Cap::Thunk);
                    } else if e.st <= 0.0 || (e.b.on_ground && !ground_ahead(&self.map, e)) {
                        e.state = St::Idle;
                        e.b.vx = 0.0;
                    }
                } else {
                    e.b.vx = 0.0;
                    e.b.phys(&self.map, &self.plats, dt);
                    if ben && dy.abs() < 1.2 && dx.abs() < 11.0 {
                        e.state = St::Charge;
                        e.dir = sign_or1(dx);
                        e.st = 2.2;
                        let (x, y) = (e.b.x + 0.5, e.b.y + 1.2);
                        self.cap(x, y, Cap::Snort);
                    }
                }
            }
            Kind::Bat => match e.state {
                St::Idle => {
                    e.b.x = e.ax;
                    e.b.y = e.ay;
                    if ben && dx.abs() < 2.4 && dy < -0.5 && dy > -11.0 {
                        e.state = St::Drop;
                        e.b.vx = sign(dx) * 2.0;
                        let (x, y) = (e.b.x, e.b.y);
                        self.cap(x, y, Cap::Skreee);
                    }
                }
                St::Drop => {
                    e.b.move_x(&self.map, e.b.vx * dt, false);
                    let landed = e.b.move_y(&self.map, -15.0 * dt);
                    if landed || e.b.y <= py - 0.2 || e.b.y < 0.0 {
                        e.state = St::Rise;
                    }
                }
                _ => {
                    e.b.x += (e.ax - e.b.x) * (dt * 2.0).min(1.0);
                    e.b.move_y(&self.map, 6.0 * dt);
                    if e.b.y >= e.ay - 0.02 || e.b.bonk {
                        e.state = St::Idle;
                    }
                }
            },
            Kind::Pod => {
                let c = e.t % 3.0;
                let was = e.puff;
                e.puff = c > 2.0;
                if e.puff && !was {
                    let (x, y) = (e.b.x + 0.4, e.b.y + 1.4);
                    self.cap(x, y, Cap::Pfff);
                }
            }
            Kind::Phantom => {
                e.b.fall(dt, 20.0);
                e.b.vx = 0.0;
                e.b.phys(&self.map, &self.plats, dt);
                e.dir = sign_or1(dx);
                e.cd -= dt;
                e.fire_t -= dt;
                if e.alpha < 1.0 {
                    e.alpha = (e.alpha + dt * 2.0).min(1.0);
                }
                if ben && dx.abs() < 12.0 && dy.abs() < 6.0 && e.fire_t <= 0.0 {
                    e.fire_t = 2.6;
                    let a0 = (dy + 0.5).atan2(dx);
                    for o in [-0.3, 0.0, 0.3] {
                        self.shots.push(Shot {
                            x: e.b.x + e.b.w / 2.0,
                            y: e.b.y + 0.9,
                            vx: (a0 + o).cos() * 6.0,
                            vy: (a0 + o).sin() * 6.0,
                            ben: false,
                            life: 3.0,
                            sprite: Spr::Zshot as u16,
                            g: false,
                        });
                    }
                    let (x, y) = (e.b.x + 0.4, e.b.y + 2.0);
                    self.cap(x, y, Cap::ZapZapZap);
                }
            }
            Kind::Roller => {
                e.b.fall(dt, 20.0);
                let sl = e.b.on_slope;
                let down = if sl == R45 || sl == R22A || sl == R22B {
                    -1.0
                } else if sl != 0 {
                    1.0
                } else {
                    0.0
                };
                let acc = if sl == R45 || sl == L45 { 14.0 } else { 7.0 };
                if down != 0.0 {
                    e.b.vx += down * acc * dt;
                } else if e.b.vx.abs() < 2.5 {
                    let s = sign(e.b.vx);
                    e.b.vx = (if s == 0.0 { e.dir } else { s }) * 2.5;
                }
                e.b.vx = e.b.vx.clamp(-8.5, 8.5);
                let vx = e.b.vx;
                e.b.phys(&self.map, &self.plats, dt);
                if e.b.hit_x {
                    e.b.vx = -vx * 0.6;
                    let s = sign(e.b.vx);
                    e.dir = if s == 0.0 { -e.dir } else { s };
                    let (x, y) = (e.b.x + 1.0, e.b.y + 2.2);
                    self.cap(x, y, Cap::Krunch);
                    self.shake = self.shake.max(0.3);
                }
                e.rot -= e.b.vx * dt / 0.95;
            }
            Kind::Sentry => {
                let ty = (py + 0.3).clamp(e.ay - 4.0, e.ay + 4.0);
                e.b.y += ((ty - e.b.y) * 2.0).clamp(-2.5, 2.5) * dt;
                e.b.x = e.ax + (e.t * 0.9).sin() * 0.8;
                e.dir = sign_or1(dx);
                e.fire_t -= dt;
                if ben && dx.abs() < 9.0 && e.fire_t <= 0.0 {
                    e.fire_t = 1.8;
                    for o in [-0.2f64, 0.0, 0.2] {
                        self.shots.push(Shot {
                            x: e.b.x + e.b.w / 2.0 + e.dir * 0.8,
                            y: e.b.y + 0.4,
                            vx: o.cos() * 7.0 * e.dir,
                            vy: o.sin() * 7.0,
                            ben: false,
                            life: 2.5,
                            sprite: Spr::Zshot as u16,
                            g: false,
                        });
                    }
                    let (x, y) = (e.b.x + 0.7, e.b.y + 1.4);
                    self.cap(x, y, Cap::Brrrt);
                }
            }
            Kind::Drone => {
                e.b.x = e.ax + 2.6 * (e.t * 1.6).sin();
                e.b.y = e.ay + 1.4 * (e.t * 3.2).sin();
            }
            Kind::Boss | Kind::Switch | Kind::Terminal | Kind::Cage => {}
        }
    }

    fn tick_boss(&mut self, i: usize, dt: f64) {
        let a = self.arena.unwrap_or(Arena {
            x0: 0.0,
            x1: 40.0,
            floor: 4.0,
        });
        let floor = a.floor;
        let (pcx, pdead, px) = (self.p.b.x + self.p.b.w / 2.0, self.p.dead > 0.0, self.p.b.x);
        let mut e = self.ents[i].clone();
        let dx = pcx - (e.b.x + e.b.w / 2.0);
        e.st += dt;
        match e.state {
            St::Wait => {
                if px > a.x0 + 3.0 && !pdead {
                    e.state = St::Rise;
                    e.st = 0.0;
                    self.events.emit(ev::DIALOGUE, 0.0, 0.0, 0.0);
                }
            }
            St::Hover => {
                e.b.y += ((floor + 4.5 + (e.t * 2.0).sin() * 0.4) - e.b.y) * (dt * 3.0).min(1.0);
                e.b.x += (dx * 2.0).clamp(-3.0, 3.0) * dt;
                e.b.x = e.b.x.clamp(a.x0, a.x1 - e.b.w);
                if (e.st / 0.9).floor() != ((e.st - dt) / 0.9).floor() {
                    self.shots.push(Shot {
                        x: e.b.x + e.b.w / 2.0,
                        y: e.b.y,
                        vx: 0.0,
                        vy: -1.0,
                        ben: false,
                        life: 4.0,
                        sprite: Spr::Glob as u16,
                        g: true,
                    });
                    let (x, y) = (e.b.x + 1.4, e.b.y - 0.3);
                    self.cap(x, y, Cap::Splorp);
                }
                if e.st > 4.2 {
                    e.state = St::Land;
                    e.st = 0.0;
                }
            }
            St::Land => {
                e.b.y -= 9.0 * dt;
                if e.b.y <= floor {
                    e.b.y = floor;
                    e.state = St::Charge;
                    e.st = 0.0;
                    e.dir = sign_or1(dx);
                    self.shake = 0.8;
                    let (x, y) = (e.b.x + 1.4, e.b.y + 3.0);
                    self.cap(x, y, Cap::Thoom);
                }
            }
            St::Charge => {
                e.b.vx = e.dir * 10.0;
                let before = e.b.x;
                e.b.x += e.b.vx * dt;
                if e.b.x < a.x0 || e.b.x + e.b.w > a.x1 {
                    e.b.x = before.clamp(a.x0, a.x1 - e.b.w);
                    e.state = St::Hot;
                    e.st = 0.0;
                    self.shake = 0.5;
                    let (x, y) = (e.b.x + 1.4, e.b.y + 3.0);
                    self.cap(x, y, Cap::Clang);
                }
            }
            St::Hot => {
                if e.st > 2.4 {
                    e.state = St::Rise;
                    e.st = 0.0;
                }
            }
            St::Rise => {
                e.b.y += 5.0 * dt;
                if e.b.y >= floor + 4.5 {
                    e.state = St::Hover;
                    e.st = 0.0;
                }
            }
            St::Down => {
                e.b.y = (e.b.y - 6.0 * dt).max(floor);
                if self.rng.next_f64() < 0.3 {
                    let (rx, ry) = (self.rng.next_f64(), self.rng.next_f64());
                    self.fx.push(Fx {
                        x: e.b.x + rx * e.b.w,
                        y: e.b.y + ry * e.b.h,
                        t: 0.0,
                        life: 0.5,
                        tint: 0xffff55,
                    });
                }
                if e.st > 2.0 {
                    e.dead = true;
                    self.items.push(Item {
                        kind: ItemKind::Usb,
                        x: e.b.x + e.b.w / 2.0,
                        y: floor + 0.6,
                        taken: false,
                    });
                    self.events.emit(ev::DIALOGUE, 1.0, 0.0, 0.0);
                }
            }
            St::Idle | St::Drop => {}
        }
        self.ents[i] = e;
    }

    #[cfg(test)]
    pub fn hit_boss_for_test(&mut self, i: usize) {
        self.hit_boss(i);
    }

    fn hit_boss(&mut self, i: usize) {
        let (x, y) = (self.ents[i].b.x + 1.4, self.ents[i].b.y + 3.2);
        self.ents[i].hp -= 1;
        self.cap(x, y, Cap::Zzzap);
        self.shake = 0.5;
        let hp = self.ents[i].hp;
        self.events.emit(ev::BOSS_HP, f64::from(hp), 0.0, 0.0);
        self.ents[i].st = 0.0;
        self.ents[i].state = if hp <= 0 { St::Down } else { St::Rise };
    }

    fn tick_shots(&mut self, dt: f64) {
        let mut i = self.shots.len();
        while i > 0 {
            i -= 1;
            let mut b = self.shots[i];
            if b.g {
                b.vy -= 20.0 * dt;
            }
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.life -= dt;
            let mut gone = b.life <= 0.0
                || self
                    .map
                    .solid(b.x.floor() as i32, b.y.floor() as i32, false, 0.0)
                || b.y < 0.0;
            if b.ben && !gone {
                for j in 0..self.ents.len() {
                    let e = &self.ents[j];
                    let d = info(e.kind);
                    if e.dead || d.prop {
                        continue;
                    }
                    let (ex, ey, ew, eh) = (e.b.x, e.b.y, e.b.w, e.b.h);
                    if e.kind == Kind::Phantom
                        && e.cd <= 0.0
                        && (b.x - (ex + ew / 2.0)).abs() < 2.6
                        && (b.y - (ey + 0.7)).abs() < 1.2
                        && e.stun <= 0.0
                    {
                        self.teleport_phantom(j);
                        continue;
                    }
                    if b.x > ex - 0.15
                        && b.x < ex + ew + 0.15
                        && b.y > ey - 0.2
                        && b.y < ey + eh.max(1.1) + 0.2
                    {
                        gone = true;
                        let (kind, state) = (e.kind, e.state);
                        if kind == Kind::Boss {
                            if state == St::Hot {
                                self.hit_boss(j);
                            } else {
                                self.cap(b.x, b.y + 0.5, Cap::Plink);
                            }
                        } else if d.inv {
                            self.cap(
                                b.x,
                                b.y + 0.5,
                                if kind == Kind::Marsh {
                                    Cap::Blorp
                                } else {
                                    Cap::Plink
                                },
                            );
                        } else {
                            self.ents[j].stun = 6.0;
                            self.ents[j].state = St::Idle;
                            self.cap(ex + ew / 2.0, ey + eh + 0.4, Cap::Fizzled);
                        }
                        break;
                    }
                }
            } else if !b.ben && !gone && self.p.dead == 0.0 {
                let p = &self.p.b;
                if b.x > p.x && b.x < p.x + p.w && b.y > p.y && b.y < p.y + p.h {
                    gone = true;
                    if self.p.inv <= 0.0 {
                        self.kill();
                    }
                }
            }
            if gone {
                self.fx.push(Fx {
                    x: b.x,
                    y: b.y,
                    t: 0.0,
                    life: 0.3,
                    tint: if b.ben { 0x55ffff } else { 0xff5555 },
                });
                self.shots.swap_remove(i);
            } else {
                self.shots[i] = b;
            }
        }
    }

    fn teleport_phantom(&mut self, j: usize) {
        let p = self.p.b.clone();
        for tries in 0..6i32 {
            let dir = if hashf(self.tick_count as i32, tries) < 0.5 {
                -1.0
            } else {
                1.0
            };
            let nx = (p.x + dir * f64::from(5 + tries % 3)).floor() as i32;
            let mut y = (self.map.h - 3).min(p.y.floor() as i32 + 4);
            while y > 0 {
                let m = &self.map;
                if m.solid(nx, y - 1, false, 0.0)
                    && !m.solid(nx, y, false, 0.0)
                    && !m.solid(nx, y + 1, false, 0.0)
                    && m.get(nx, y) != CHOC
                    && m.get(nx, y - 1) != CHOC
                {
                    let (ex, ey) = (self.ents[j].b.x, self.ents[j].b.y);
                    self.fx.push(Fx {
                        x: ex + 0.4,
                        y: ey + 0.7,
                        t: 0.0,
                        life: 0.6,
                        tint: 0xffffff,
                    });
                    let e = &mut self.ents[j];
                    e.b.x = f64::from(nx) + 0.1;
                    e.b.y = f64::from(y);
                    e.b.px = e.b.x;
                    e.b.py = e.b.y;
                    e.cd = 2.4;
                    e.alpha = 0.0;
                    e.fire_t = e.fire_t.min(0.8);
                    let (x, y) = (e.b.x + 0.4, e.b.y + 2.0);
                    self.cap(x, y, Cap::Poof);
                    return;
                }
                y -= 1;
            }
        }
    }
}
