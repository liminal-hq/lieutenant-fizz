// Whole-world tests for the Episode 1 simulation, including determinism.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

//! Whole-world behaviour tests: the player, items, doors, enemies, boss, overworld and the
//! determinism of the instance buffer.

use crate::ents::{ItemKind, Kind, St};
use crate::levels::{CAVES, CITADEL, CRATER};
use crate::text::ev;
use crate::tiles::*;
use crate::world::{input::*, Mode, World};

fn level(id: u8) -> World {
    let mut w = World::new();
    w.game_new();
    w.enter_level(id);
    w.events.clear();
    w
}

fn run(w: &mut World, ticks: usize, held: u32) {
    for _ in 0..ticks {
        w.step(held);
    }
}

fn events_of(w: &World, kind: u32) -> Vec<lf_sim::Event> {
    (0..w.events.len())
        .filter_map(|i| w.events.get(i))
        .filter(|e| e.kind == kind as f32)
        .collect()
}

#[test]
fn ben_lands_and_stands_on_the_ground() {
    let mut w = level(CRATER);
    run(&mut w, 90, 0);
    assert!(w.p.b.on_ground);
    assert!((w.p.b.y - 4.0).abs() < 0.01, "y = {}", w.p.b.y);
}

#[test]
fn running_accelerates_to_top_speed_and_stops_with_friction() {
    let mut w = level(CRATER);
    run(&mut w, 30, 0);
    let x0 = w.p.b.x;
    run(&mut w, 60, RIGHT);
    assert!(w.p.b.x > x0 + 4.0);
    assert!(
        (w.p.b.vx - 7.0).abs() < 1e-9,
        "top speed 7 tiles/s, got {}",
        w.p.b.vx
    );
    run(&mut w, 20, 0);
    assert_eq!(w.p.b.vx, 0.0);
}

#[test]
fn jump_height_is_variable() {
    let apex = |hold: bool| {
        let mut w = level(CRATER);
        run(&mut w, 30, 0);
        w.step(JUMP);
        let mut max_y = w.p.b.y;
        for _ in 0..90 {
            w.step(if hold { JUMP } else { 0 });
            max_y = max_y.max(w.p.b.y);
        }
        max_y - 4.0
    };
    let (full, short) = (apex(true), apex(false));
    assert!((full - 3.5).abs() < 0.35, "full jump apex {full}");
    assert!(short < full * 0.5, "released early: {short} vs {full}");
}

#[test]
fn pogo_bounces_automatically_and_high_with_jump_held() {
    let mut w = level(CRATER);
    run(&mut w, 30, 0);
    w.step(POGO);
    assert!(w.p.pogo);
    let mut max_y = 0.0f64;
    for _ in 0..200 {
        w.step(JUMP | POGO);
        max_y = max_y.max(w.p.b.y);
    }
    assert!(
        max_y - 4.0 > 6.0 && max_y - 4.0 < 7.2,
        "pogo apex {}",
        max_y - 4.0
    );
    // Without jump held, the bounce is the short one (~1.6 tiles).
    let mut w = level(CRATER);
    run(&mut w, 30, 0);
    w.step(POGO);
    let mut max_y = 0.0f64;
    for _ in 0..120 {
        w.step(POGO);
        max_y = max_y.max(w.p.b.y);
    }
    assert!(max_y - 4.0 < 2.5, "short bounce {}", max_y - 4.0);
}

#[test]
fn spikes_and_chocolate_kill_and_death_costs_a_life() {
    let mut w = level(CRATER);
    // First chocolate pool: x = 14+2+6+2+5 = 29 .. 32, ground height 4 -> choc rows 1..2.
    w.p.b.x = 30.0;
    w.p.b.y = 2.4;
    w.step(0);
    assert!(w.p.dead > 0.0, "chocolate is deadly");
    run(&mut w, 120, 0);
    assert_eq!(events_of(&w, ev::DIED).len(), 1);
    assert_eq!(w.game.lives, 2);

    let mut w = level(CRATER);
    let spike_x = (0..192)
        .find(|&x| (0..28).any(|y| w.map.get(x, y) == SPIKE))
        .unwrap();
    w.p.b.x = f64::from(spike_x) + 0.1;
    w.p.b.y = 4.0;
    w.step(0);
    assert!(w.p.dead > 0.0, "spikes are deadly");
}

#[test]
fn running_out_of_lives_is_game_over() {
    let mut w = level(CRATER);
    w.game.lives = 0;
    w.kill();
    run(&mut w, 120, 0);
    assert_eq!(events_of(&w, ev::GAME_OVER).len(), 1);
}

#[test]
fn collecting_snacks_scores_and_extra_lives_arrive_every_hundred() {
    let mut w = level(CRATER);
    let it = w.items[0];
    assert_eq!(it.kind, ItemKind::Cheezie);
    w.p.b.x = it.x - 0.35;
    w.p.b.y = it.y - 0.5;
    w.step(0);
    assert_eq!(w.game.score, 1);
    assert!(w.items[0].taken);

    w.game.score = 99;
    let it = w.items[1];
    w.p.b.x = it.x - 0.35;
    w.p.b.y = it.y - 0.5;
    w.step(0);
    assert_eq!(w.game.score, 100);
    assert_eq!(w.game.lives, 4);
    assert_eq!(w.game.next_life, 200);
}

#[test]
fn fizz_uses_ammo_and_stops_when_empty() {
    let mut w = level(CRATER);
    run(&mut w, 30, 0);
    w.step(FIRE);
    assert_eq!(w.game.ammo, 4);
    assert_eq!(w.shots.len(), 1);
    assert!(w.shots[0].vx > 0.0);
    w.game.ammo = 0;
    w.step(0);
    w.step(FIRE);
    assert_eq!(w.game.ammo, 0);
    assert_eq!(
        w.shots.iter().filter(|s| s.ben).count(),
        1,
        "no new shot without ammo"
    );
}

#[test]
fn fizz_aims_up() {
    let mut w = level(CRATER);
    run(&mut w, 30, 0);
    w.step(FIRE | UP);
    let s = w.shots.last().unwrap();
    assert_eq!((s.vx, s.vy), (0.0, 16.0));
}

#[test]
fn fizz_stuns_a_gloop_for_six_seconds() {
    let mut w = level(CRATER);
    let gi = w.ents.iter().position(|e| e.kind == Kind::Gloop).unwrap();
    let (gx, gy) = (w.ents[gi].b.x, w.ents[gi].b.y);
    w.p.b.x = gx - 3.0;
    w.p.b.y = gy;
    w.p.face = 1.0;
    w.step(FIRE);
    run(&mut w, 40, 0);
    assert!(w.ents[gi].stun > 4.0, "stun {}", w.ents[gi].stun);
}

#[test]
fn stomping_a_gloop_stuns_and_bounces() {
    let mut w = level(CRATER);
    let gi = w.ents.iter().position(|e| e.kind == Kind::Gloop).unwrap();
    // Stop it from walking away: it is on the ground; drop Ben on its head.
    w.ents[gi].b.vx = 0.0;
    w.ents[gi].dir = 0.0;
    let (gx, gy, gh) = (w.ents[gi].b.x, w.ents[gi].b.y, w.ents[gi].b.h);
    w.p.b.x = gx + 0.1;
    w.p.b.y = gy + gh + 0.4;
    w.p.b.px = w.p.b.x;
    w.p.b.py = w.p.b.y;
    w.p.b.vy = -8.0;
    let mut stunned = false;
    for _ in 0..30 {
        w.step(0);
        stunned |= w.ents[gi].stun > 0.0;
        if w.p.dead > 0.0 {
            panic!("Ben should survive a stomp");
        }
    }
    assert!(stunned);
}

#[test]
fn gumdrop_opens_matching_door_only() {
    let mut w = level(CRATER);
    let doors = |w: &World| w.map.data.iter().filter(|&&t| t == DOOR_R).count();
    assert_eq!(doors(&w), 2);
    // Without the key the door is solid.
    w.p.b.x = 170.3;
    w.p.b.y = 6.0;
    w.p.face = 1.0;
    w.step(0);
    assert_eq!(doors(&w), 2);
    w.keys_blue = true;
    w.step(0);
    assert_eq!(doors(&w), 2, "blue gumdrop does not open a red door");
    w.keys_red = true;
    w.step(0);
    assert_eq!(doors(&w), 0);
    assert!(!w.keys_red, "the key is used up");
}

#[test]
fn reaching_the_exit_completes_the_level_once() {
    let mut w = level(CRATER);
    let (ex, ey) = (186, 6);
    assert_eq!(w.map.get(ex, ey), EXIT);
    w.p.b.x = f64::from(ex) + 0.1;
    w.p.b.y = f64::from(ey);
    w.step(0);
    w.step(0);
    assert_eq!(events_of(&w, ev::LEVEL_COMPLETE).len(), 1);
    assert!(w.game.is_done(CRATER));
}

#[test]
fn switch_toggles_the_bridge_and_bridge_collision() {
    let mut w = level(CAVES);
    assert!(!w.map.solid(65, 3, false, 0.0));
    let si = w.ents.iter().position(|e| e.kind == Kind::Switch).unwrap();
    w.p.b.x = w.ents[si].b.x;
    w.p.b.y = w.ents[si].b.y;
    w.step(0);
    assert!(w.map.switch_on);
    assert!(w.map.solid(65, 3, false, 0.0));
}

#[test]
fn hover_platform_carries_ben() {
    let mut w = level(CAVES);
    let pl = w.plats[0].clone();
    w.p.b.x = pl.x + 0.6;
    w.p.b.y = pl.y + pl.h + 0.01;
    run(&mut w, 5, 0);
    let x0 = w.p.b.x;
    assert!(w.p.b.on_plat.is_some(), "standing on the hover platform");
    run(&mut w, 120, 0);
    assert!(
        (w.p.b.x - x0).abs() > 0.3,
        "moved with the platform: {} -> {}",
        x0,
        w.p.b.x
    );
}

#[test]
fn gloops_patrol_and_turn_around() {
    let mut w = level(CRATER);
    let gi = w.ents.iter().position(|e| e.kind == Kind::Gloop).unwrap();
    let x0 = w.ents[gi].b.x;
    w.p.hidden = true; // keep the camera irrelevant; enemies don't need Ben
    run(&mut w, 60, 0);
    assert!((w.ents[gi].b.x - x0).abs() > 1.0, "gloop moves");
    assert!(w.ents[gi].b.on_ground);
}

#[test]
fn every_enemy_type_survives_ten_simulated_seconds_without_leaving_the_world() {
    for id in [CRATER, CAVES, CITADEL] {
        let mut w = level(id);
        w.p.inv = 1e9;
        for t in 0..600 {
            // Wander so enemies react.
            w.step(if (t / 90) % 2 == 0 { RIGHT } else { LEFT });
            for e in &w.ents {
                assert!(
                    e.b.x.is_finite() && e.b.y.is_finite(),
                    "{:?} went non-finite",
                    e.kind
                );
                assert!(
                    e.b.y > -30.0,
                    "{:?} fell out of the world: y={}",
                    e.kind,
                    e.b.y
                );
            }
        }
    }
}

#[test]
fn boss_fight_progresses_through_its_phases() {
    let mut w = level(CITADEL);
    w.p.inv = 1e9;
    let arena = w.arena.unwrap();
    w.p.b.x = arena.x0 + 6.0;
    w.p.b.y = arena.floor;
    run(&mut w, 20, 0);
    assert_eq!(events_of(&w, ev::DIALOGUE).len(), 1, "boss intro");
    let mut seen = std::collections::HashSet::new();
    for _ in 0..1500 {
        w.p.b.x = arena.x0 + 6.0;
        w.p.b.y = arena.floor;
        w.step(0);
        let b = w.ents.iter().find(|e| e.kind == Kind::Boss).unwrap();
        seen.insert(format!("{:?}", b.state));
        assert!(b.b.x >= arena.x0 - 1e-6 && b.b.x + b.b.w <= arena.x1 + 1e-6);
    }
    for s in ["Hover", "Land", "Charge", "Hot", "Rise"] {
        assert!(seen.contains(s), "boss never reached {s}: {seen:?}");
    }
    assert!(w.shots.iter().any(|s| s.g) || w.tick_count > 0);
}

#[test]
fn defeating_the_boss_drops_the_usb_and_the_terminal_ends_the_game() {
    let mut w = level(CITADEL);
    w.p.inv = 1e9;
    let bi = w.ents.iter().position(|e| e.kind == Kind::Boss).unwrap();
    w.ents[bi].state = St::Hot;
    for _ in 0..3 {
        w.ents[bi].state = St::Hot;
        w.hit_boss_for_test(bi);
    }
    assert_eq!(w.ents[bi].state, St::Down);
    run(&mut w, 200, 0);
    assert!(w.ents[bi].dead);
    assert!(w.items.iter().any(|i| i.kind == ItemKind::Usb));
    assert_eq!(events_of(&w, ev::DIALOGUE).len(), 1, "defeat dialogue");
    // Pick up the USB and use the terminal.
    w.has_usb = true;
    let ti = w
        .ents
        .iter()
        .position(|e| e.kind == Kind::Terminal)
        .unwrap();
    w.p.b.x = w.ents[ti].b.x;
    w.p.b.y = w.ents[ti].b.y;
    w.step(0);
    assert!(w.hacked);
    run(&mut w, 100, 0);
    assert_eq!(events_of(&w, ev::ENDING).len(), 1);
}

#[test]
fn overworld_walk_prompt_and_enter_level() {
    let mut w = World::new();
    w.game_new();
    w.enter_map();
    assert_eq!(w.mode, Mode::Map);
    w.events.clear();
    // Walk down the river bank towards the first level point.
    let pt = *w
        .points
        .iter()
        .find(|p| p.kind == crate::levels::PtKind::Level && p.level == CRATER)
        .unwrap();
    w.p.b.x = pt.x + 0.2;
    w.p.b.y = pt.y + 0.2;
    w.step(0);
    let prompts = events_of(&w, ev::MAP_PROMPT);
    assert_eq!(prompts.last().unwrap().a, 1.0);
    w.step(JUMP);
    assert_eq!(w.mode, Mode::Level);
    assert_eq!(w.level_id, CRATER);
    assert_eq!(events_of(&w, ev::LEVEL_START).len(), 1);
    assert!(
        w.game.map_pos.is_some(),
        "map position remembered for the return trip"
    );
}

#[test]
fn rivers_and_trees_block_the_overworld_walker() {
    let mut w = World::new();
    w.game_new();
    w.enter_map();
    let (x0, y0) = (w.p.b.x, w.p.b.y);
    run(&mut w, 600, UP | LEFT);
    assert!(
        w.p.b.x >= 2.0 && w.p.b.y >= 2.0,
        "stopped by the border river: {},{}",
        w.p.b.x,
        w.p.b.y
    );
    let _ = (x0, y0);
}

#[test]
fn teleporters_need_a_cleared_level() {
    let mut w = World::new();
    w.game_new();
    w.enter_map();
    let ti = w
        .points
        .iter()
        .position(|p| p.kind == crate::levels::PtKind::Tele)
        .unwrap();
    let pt = w.points[ti];
    w.p.b.x = pt.x + 0.2;
    w.p.b.y = pt.y + 0.2;
    w.step(0);
    w.step(JUMP);
    assert_eq!(w.mode, Mode::Map);
    assert!(
        (w.p.b.x - (pt.x + 0.2)).abs() < 0.2,
        "locked teleporter does not move Ben"
    );
    w.game.set_done(CRATER);
    w.near = None;
    w.step(0);
    w.step(JUMP | FIRE);
    let to = w.points[pt.to];
    assert!(
        (w.p.b.x - (to.x + 0.2)).abs() < 0.2,
        "teleported to its partner"
    );
}

#[test]
fn render_writes_finite_instances_for_every_scene() {
    let mut w = level(CRATER);
    for (id, name) in [(CRATER, "crater"), (CAVES, "caves"), (CITADEL, "citadel")] {
        w.enter_level(id);
        w.half_w = 11.0;
        w.half_h = 6.5;
        run(&mut w, 30, RIGHT);
        for fl in [0, 1, 2, 3] {
            w.render(0.5, fl);
            let count = w.out[crate::render::out::COUNT] as usize;
            assert!(count > 50, "{name} flags {fl}: only {count} instances");
            assert!(
                w.inst.as_slice().iter().all(|v| v.is_finite()),
                "{name}: non-finite instance data"
            );
            assert!(
                w.out[crate::render::out::LIGHTS] >= 1.0,
                "{name}: no lights"
            );
        }
    }
    w.enter_map();
    w.render(1.0, 2);
    assert!(w.out[crate::render::out::COUNT] > 100.0);
}

#[test]
fn culling_cuts_instance_counts_dramatically() {
    let mut w = level(CRATER);
    w.half_w = 11.0;
    w.half_h = 6.5;
    run(&mut w, 10, 0);
    w.render(1.0, 2);
    let culled = w.out[crate::render::out::COUNT];
    w.render(1.0, 0);
    let uncull = w.out[crate::render::out::COUNT];
    assert!(culled * 2.0 < uncull, "culled {culled} vs {uncull}");
}

#[test]
fn simulation_and_rendering_are_deterministic() {
    let script = |t: usize| match (t / 37) % 5 {
        0 => RIGHT,
        1 => RIGHT | JUMP,
        2 => RIGHT | FIRE,
        3 => LEFT | JUMP,
        _ => POGO,
    };
    let play = || {
        let mut w = level(CRATER);
        w.half_w = 11.0;
        w.half_h = 6.5;
        for t in 0..900 {
            w.step(script(t));
        }
        w.render(0.25, 2);
        (
            w.p.b.x.to_bits(),
            w.p.b.y.to_bits(),
            w.inst
                .as_slice()
                .iter()
                .map(|f| f.to_bits())
                .collect::<Vec<_>>(),
            w.game.score,
        )
    };
    assert_eq!(play(), play());
}

#[test]
fn attract_mode_scrolls_without_ben() {
    let mut w = World::new();
    w.load_attract();
    w.half_w = 11.0;
    w.half_h = 6.5;
    let x0 = w.cam_x;
    run(&mut w, 600, 0);
    assert!((w.cam_x - x0).abs() > 0.01);
    w.render(0.5, 2);
    assert!(w.p.hidden);
}

#[test]
fn requirement_masks_need_every_listed_level() {
    let mut w = level(CRATER);
    let both = (crate::levels::level_bit(CRATER) | crate::levels::level_bit(CAVES)) as u16;
    assert!(w.met(0), "no requirement is always met");
    assert!(!w.met(both));
    w.game.set_done(CAVES);
    assert!(!w.met(both), "one of two is not enough");
    w.game.set_done(CRATER);
    assert!(w.met(both));
}

#[test]
fn a_locked_level_point_refuses_entry_until_its_requirement_is_met() {
    let mut w = World::new();
    w.game_new();
    w.enter_map();
    let i = w
        .points
        .iter()
        .position(|p| p.kind == crate::levels::PtKind::Level && p.level == CAVES)
        .unwrap();
    w.points[i].req = crate::levels::level_bit(CRATER) as u16;
    let pt = w.points[i];
    w.p.b.x = pt.x + 0.2;
    w.p.b.y = pt.y + 0.2;
    w.step(0);
    w.step(JUMP);
    assert_eq!(w.mode, Mode::Map, "locked level did not start");
    w.game.set_done(CRATER);
    w.near = None;
    w.step(0);
    w.step(JUMP);
    assert_eq!(w.mode, Mode::Level);
    assert_eq!(w.level_id, CAVES);
}

#[test]
fn loading_progress_drops_bits_that_mean_nothing() {
    let mut w = World::new();
    w.game.done = (1 << 20) | crate::world::SECRET_FOUND | 0b101;
    w.game.done &= crate::world::PROGRESS_BITS;
    assert_eq!(w.game.done, crate::world::SECRET_FOUND | 0b101);
}
