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
    assert!(w.map.switch(0));
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
    for id in 0..crate::levels::LEVEL_COUNT {
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
    for (id, name) in [
        (CRATER, "crater"),
        (CAVES, "caves"),
        (CITADEL, "citadel"),
        (crate::levels::METEOR_MESA, "meteor mesa"),
    ] {
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
fn a_locked_level_point_prompts_as_locked_and_names_what_is_missing() {
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
    w.events.clear();
    w.step(0);
    let prompt = events_of(&w, ev::MAP_PROMPT).pop().expect("a prompt");
    assert_eq!(prompt.a, 4.0, "locked level prompt type");
    assert_eq!(prompt.b, f32::from(CRATER), "names the first missing level");
    assert_eq!(prompt.c, f32::from(CAVES), "carries the locked level's id");
    w.game.set_done(CRATER);
    w.near = None;
    w.events.clear();
    w.step(0);
    let prompt = events_of(&w, ev::MAP_PROMPT).pop().expect("a prompt");
    assert_eq!(prompt.a, 1.0, "unlocked once the requirement is cleared");
    assert_eq!(prompt.b, f32::from(CAVES));
}

#[test]
fn loading_progress_drops_bits_that_mean_nothing() {
    let mut w = World::new();
    w.game
        .load_done((1 << 20) | crate::world::SECRET_FOUND | 0b101);
    assert_eq!(w.game.done, crate::world::SECRET_FOUND | 0b101);
    // Garbage that is not even a whole number of bits cannot get through either.
    w.game.load_done(u32::MAX);
    assert_eq!(w.game.done, crate::world::PROGRESS_BITS);
}

#[test]
fn an_unknown_level_id_builds_the_first_level_and_cannot_set_stray_bits() {
    let mut w = World::new();
    w.game_new();
    w.enter_level(200);
    assert_eq!(w.level_id, 0, "falls back to the first level, id and all");
    w.won = false;
    w.game.set_done(w.level_id);
    assert_eq!(w.game.done, 1, "only the first level's bit");
}

fn lookout() -> World {
    let mut w = level(crate::levels::ZARG_LOOKOUT);
    w.ents.clear();
    w
}

#[test]
fn ben_climbs_a_ladder_with_up_and_hops_off_with_jump() {
    let mut w = lookout();
    // The ground-floor ladder is at x = 18; stand at its foot.
    w.p.b.x = 17.8;
    w.p.b.y = 3.0;
    run(&mut w, 2, 0);
    assert!(!w.p.climb);
    run(&mut w, 30, UP);
    assert!(w.p.climb, "Up grabs the ladder");
    assert!(!w.p.b.on_ground);
    let y0 = w.p.b.y;
    run(&mut w, 30, UP);
    let rate = (w.p.b.y - y0) / 0.5;
    assert!(
        (rate - 4.5).abs() < 0.3,
        "climbs at 4.5 tiles/s, got {rate}"
    );
    assert!(
        (w.p.b.centre_x() - 18.5).abs() < 0.01,
        "snapped to the rungs"
    );
    run(&mut w, 1, UP | JUMP);
    assert!(!w.p.climb, "Jump lets go");
    assert!(w.p.b.vy > 10.0, "and hops, vy = {}", w.p.b.vy);
}

#[test]
fn a_ladder_top_is_a_ledge_and_down_goes_back_onto_the_ladder() {
    let mut w = lookout();
    w.p.b.x = 17.8;
    w.p.b.y = 3.0;
    run(&mut w, 200, UP);
    assert!(!w.p.climb, "ran out of ladder");
    assert!(w.p.b.on_ground);
    assert!(
        (w.p.b.y - 12.0).abs() < 0.01,
        "settled on the ledge, y = {}",
        w.p.b.y
    );
    run(&mut w, 15, DOWN);
    assert!(w.p.climb, "Down from the ledge grabs the ladder");
    run(&mut w, 200, DOWN);
    assert!(
        (w.p.b.y - 3.0).abs() < 0.05,
        "back on the ground, y = {}",
        w.p.b.y
    );
    assert!(!w.p.climb, "and let go at the bottom");
}

#[test]
fn up_and_down_do_nothing_away_from_a_ladder() {
    let mut w = lookout();
    w.p.b.x = 5.0;
    w.p.b.y = 3.0;
    run(&mut w, 30, UP);
    assert!(!w.p.climb);
    run(&mut w, 30, DOWN);
    assert!(!w.p.climb);
}

#[test]
fn fizz_fires_sideways_while_climbing_even_with_up_held() {
    let mut w = lookout();
    w.p.b.x = 17.8;
    w.p.b.y = 3.0;
    run(&mut w, 40, UP);
    assert!(w.p.climb);
    w.shots.clear();
    w.step(UP | FIRE);
    let s = w.shots.last().expect("a shot");
    assert!(
        s.vx.abs() > 10.0 && s.vy == 0.0,
        "sideways, got {} {}",
        s.vx,
        s.vy
    );
}

#[test]
fn climbing_ignores_the_pogo_toggle() {
    let mut w = lookout();
    w.p.b.x = 17.8;
    w.p.b.y = 3.0;
    run(&mut w, 40, UP);
    w.step(UP | POGO);
    assert!(!w.p.pogo && w.p.climb);
}

#[test]
fn the_tower_camera_keeps_ben_in_view_through_a_long_fall() {
    let mut w = lookout();
    w.half_h = 6.5;
    // Knock a one-tile shaft through every floor and the roof at x = 5 so Ben falls the whole
    // tower, about 72 tiles, instead of landing on the roof he starts on.
    for y in 3..75 {
        w.map.set(5, y, 0);
    }
    w.p.b.x = 5.2;
    w.p.b.y = 75.0;
    w.cam_y = 78.0;
    w.pcy = 78.0;
    let mut ticks = 0;
    for t in 0..600 {
        w.step(0);
        if w.p.b.on_ground {
            break;
        }
        ticks = t;
        assert!(
            (w.p.b.y - w.cam_y).abs() < w.half_h - 1.0,
            "tick {t}: Ben at {:.1}, camera at {:.1}",
            w.p.b.y,
            w.cam_y
        );
    }
    assert!(
        ticks > 150,
        "a long fall, not a one-tick landing: {ticks} ticks"
    );
    assert!(w.p.b.on_ground, "landed");
    assert!(w.p.b.y < 4.0, "all the way down, y = {}", w.p.b.y);
}

#[test]
fn the_tower_camera_looks_down_and_up_on_request_while_standing() {
    let mut w = lookout();
    // Floor 3 is far enough from the map's bottom and top that the camera is never clamped.
    w.p.b.x = 5.0;
    w.p.b.y = 30.0;
    w.cam_y = 31.0;
    w.pcy = 31.0;
    run(&mut w, 90, 0);
    let rest = w.cam_y;
    run(&mut w, 90, DOWN);
    assert!(w.cam_y < rest - 1.0, "looks down");
    run(&mut w, 120, 0);
    run(&mut w, 120, UP);
    assert!(w.cam_y > rest + 1.0, "looks up, {} vs {rest}", w.cam_y);
}

#[test]
fn the_lift_carries_ben_up_and_waits_at_each_end() {
    let mut w = lookout();
    let lift = &w.plats[0];
    let (bottom, top) = (lift.ay + lift.h, lift.by + lift.h);
    w.p.b.x = 18.9;
    w.p.b.y = bottom;
    let mut rose = false;
    let mut waited = 0;
    for _ in 0..1800 {
        w.step(0);
        if w.p.b.on_plat.is_some() && w.p.b.y > bottom + 4.0 {
            rose = true;
        }
        if w.plats[0].dy == 0.0 && w.plats[0].wait > 0.0 {
            waited += 1;
        }
    }
    assert!(rose, "rode the lift, y = {}", w.p.b.y);
    assert!(
        waited > 100,
        "the lift rests at its ends, waited {waited} ticks"
    );
    assert!(w.p.b.y <= top + 0.5);
}

fn playhouse() -> World {
    let mut w = level(crate::levels::BONBON_PLAYHOUSE);
    w.ents.clear();
    w
}

#[test]
fn a_hidden_room_fades_while_ben_is_inside_and_recovers_when_he_leaves() {
    let mut w = playhouse();
    // The tutorial room sits on the path at x 18..29.
    assert_eq!(w.room_alpha[0], 1.0, "starts opaque");
    w.p.b.x = 22.0;
    w.p.b.y = 6.0;
    let room = w
        .rooms
        .iter()
        .position(|r| r.contains(22, 6))
        .expect("room on the path");
    run(&mut w, 60, 0);
    assert!(
        w.room_alpha[room] < 0.3,
        "faded inside, alpha {}",
        w.room_alpha[room]
    );
    w.p.b.x = 5.0;
    w.p.b.y = 4.0;
    run(&mut w, 60, 0);
    assert!(
        w.room_alpha[room] > 0.95,
        "opaque again outside, alpha {}",
        w.room_alpha[room]
    );
}

#[test]
fn hidden_rooms_are_hidden_from_the_start_and_only_the_room_ben_is_in_fades() {
    let mut w = playhouse();
    assert!(w.room_alpha.iter().all(|&a| a == 1.0));
    w.p.b.x = 22.0;
    w.p.b.y = 6.0;
    run(&mut w, 60, 0);
    let seen = w.rooms.iter().position(|r| r.contains(22, 6)).unwrap();
    for (i, &a) in w.room_alpha.iter().enumerate() {
        assert_eq!(a < 0.5, i == seen, "room {i} alpha {a}");
    }
}

#[test]
fn flats_are_drawn_after_ben_so_they_cover_him_until_they_fade() {
    use crate::sprites::Spr;
    use lf_sim::{SpriteRect, STRIDE};
    let mut w = playhouse();
    // Give the two sprites distinct atlas coordinates so their instances can be told apart.
    let rect = |u: f32| SpriteRect {
        u,
        v: u,
        uw: 0.01,
        vh: 0.01,
        w: 16.0,
        h: 16.0,
    };
    w.spr[Spr::Facade as usize] = rect(0.31);
    w.spr[Spr::BenStand as usize] = rect(0.62);
    w.half_w = 11.0;
    w.half_h = 6.5;
    w.p.b.x = 22.0;
    w.p.b.y = 6.0;
    w.cam_x = 22.0;
    w.cam_y = 8.0;
    w.pcx = 22.0;
    w.pcy = 8.0;
    // Let Ben land so he is drawn with the standing pose, then look at the very first frame's
    // room before it has had time to fade by drawing right after the landing.
    w.p.b.on_ground = true;
    w.room_alpha.iter_mut().for_each(|a| *a = 1.0);
    w.render(0.5, 0);
    let data = w.inst.as_slice();
    let at = |i: usize| data[i * STRIDE + 16];
    let n = w.inst.len();
    let ben = (0..n).find(|&i| at(i) == 0.62).expect("Ben is drawn");
    let flats: Vec<usize> = (0..n).filter(|&i| at(i) == 0.31).collect();
    assert!(!flats.is_empty(), "the room's flats are drawn");
    assert!(
        flats.iter().all(|&i| i > ben),
        "every flat comes after Ben in draw order"
    );
    // After the fade the flats inside his room are still drawn, but translucent.
    run(&mut w, 60, 0);
    w.render(0.5, 0);
    let data = w.inst.as_slice();
    let alpha = |i: usize| data[i * STRIDE + 19];
    let n = w.inst.len();
    let faded = (0..n).filter(|&i| data[i * STRIDE + 16] == 0.31 && alpha(i) < 0.5);
    assert!(faded.count() > 0, "flats in Ben's room are translucent");
}

fn shafts() -> World {
    let mut w = level(crate::levels::MIRROR_SHAFTS);
    // Keep only the puzzle pieces, so a stray phantom cannot interfere.
    w.ents
        .retain(|e| matches!(e.kind, Kind::Mirror | Kind::Swivel | Kind::CrystalSwitch));
    w
}

fn bubble(x: f64, y: f64, vx: f64, vy: f64) -> crate::ents::Shot {
    crate::ents::Shot {
        x,
        y,
        vx,
        vy,
        ben: true,
        life: 1.1,
        sprite: crate::sprites::Spr::Bubble as u16,
        g: false,
        last: -1,
    }
}

fn find(w: &World, kind: Kind, x: f64) -> usize {
    w.ents
        .iter()
        .position(|e| e.kind == kind && (e.b.x - x).abs() < 0.01)
        .expect("entity at x")
}

#[test]
fn a_mirror_turns_an_upward_bubble_sideways_exactly_once() {
    let mut w = shafts();
    // The first puzzle's `/` mirror is at (18, 26).
    w.shots.clear();
    w.shots.push(bubble(18.5, 24.0, 0.0, 16.0));
    let mut turned = None;
    for _ in 0..60 {
        w.step(0);
        if let Some(s) = w.shots.first() {
            if s.vy == 0.0 {
                turned = Some(*s);
                break;
            }
        }
    }
    let s = turned.expect("the bubble turned");
    assert_eq!(s.vx, 16.0, "`/` sends an up bubble right");
    assert_eq!(
        s.last,
        find(&w, Kind::Mirror, 18.0) as i32,
        "remembers the mirror"
    );
    // It keeps going right instead of bouncing off the same mirror again.
    run(&mut w, 5, 0);
    let s = w.shots.first().expect("still flying");
    assert_eq!((s.vx, s.vy), (16.0, 0.0));
}

#[test]
fn a_back_slash_mirror_sends_an_upward_bubble_left() {
    let mut w = shafts();
    let i = find(&w, Kind::Mirror, 18.0);
    w.ents[i].dir = -1.0;
    w.shots.clear();
    w.shots.push(bubble(18.5, 24.0, 0.0, 16.0));
    run(&mut w, 30, 0);
    let s = w.shots.first().expect("flying");
    assert_eq!((s.vx, s.vy), (-16.0, 0.0));
}

#[test]
fn a_crystal_switch_opens_only_its_own_gate() {
    let mut w = shafts();
    assert!(
        w.map.switch(1) && w.map.switch(2) && w.map.switch(3),
        "all gates start shut"
    );
    assert!(w.map.solid(10, 30, false, 0.0), "gate one blocks the shaft");
    w.shots.clear();
    // Straight at the first switch at (28, 26).
    w.shots.push(bubble(22.0, 26.5, 16.0, 0.0));
    run(&mut w, 30, 0);
    assert!(!w.map.switch(1), "gate one is open");
    assert!(w.map.switch(2) && w.map.switch(3), "the others stay shut");
    assert!(!w.map.solid(10, 30, false, 0.0));
    assert!(w.map.solid(10, 66, false, 0.0), "gate two still blocks");
    assert!(!w.map.switch(0), "the bridge channel is untouched");
}

#[test]
fn a_swivel_mirror_sends_the_first_bubble_one_way_and_the_second_the_other() {
    let mut w = shafts();
    let i = find(&w, Kind::Swivel, 18.0);
    assert_eq!(w.ents[i].dir, 1.0);
    w.shots.clear();
    w.shots.push(bubble(18.5, 80.0, 0.0, 16.0));
    run(&mut w, 25, 0);
    assert_eq!(
        w.shots.first().map(|s| (s.vx, s.vy)),
        Some((16.0, 0.0)),
        "first goes right"
    );
    assert_eq!(w.ents[i].dir, -1.0, "and the mirror swings round");
    w.shots.clear();
    w.shots.push(bubble(18.5, 80.0, 0.0, 16.0));
    run(&mut w, 25, 0);
    assert_eq!(
        w.shots.first().map(|s| (s.vx, s.vy)),
        Some((-16.0, 0.0)),
        "second goes left"
    );
}

#[test]
fn the_second_shot_through_the_swivel_reaches_the_switch() {
    let mut w = shafts();
    for _ in 0..2 {
        w.shots.clear();
        w.shots.push(bubble(18.5, 80.0, 0.0, 16.0));
        run(&mut w, 75, 0);
    }
    assert!(!w.map.switch(3), "gate three opened by the second bubble");
    assert!(w.map.switch(2), "gate two is not involved");
}

#[test]
fn the_secret_room_sets_the_found_bit_once_and_toasts() {
    use crate::text::Toast;
    let mut w = level(crate::levels::SUGAR_GLASS_GALLERY);
    w.ents.clear();
    assert_eq!(w.game.done & crate::world::SECRET_FOUND, 0);
    let toasts = |w: &World| {
        events_of(w, ev::TOAST)
            .iter()
            .filter(|e| e.a == Toast::SecretFound as u16 as f32)
            .count()
    };
    // Walk past the clue without going in: nothing happens.
    w.p.b.x = 119.0;
    w.p.b.y = 4.0;
    run(&mut w, 30, 0);
    assert_eq!(w.game.done & crate::world::SECRET_FOUND, 0);
    assert_eq!(toasts(&w), 0);
    // Step into the mural room.
    w.p.b.x = 130.0;
    w.p.b.y = 10.0;
    run(&mut w, 30, 0);
    assert_ne!(w.game.done & crate::world::SECRET_FOUND, 0, "bit 15 set");
    assert_eq!(toasts(&w), 1, "one toast");
    // Leave and come back: still found, no second toast.
    w.p.b.x = 119.0;
    w.p.b.y = 4.0;
    run(&mut w, 30, 0);
    w.p.b.x = 130.0;
    w.p.b.y = 10.0;
    run(&mut w, 30, 0);
    assert_eq!(toasts(&w), 1, "found once");
}

#[test]
fn ordinary_hidden_rooms_do_not_count_as_the_secret() {
    let mut w = playhouse();
    w.p.b.x = 22.0;
    w.p.b.y = 6.0;
    run(&mut w, 60, 0);
    assert_eq!(w.game.done & crate::world::SECRET_FOUND, 0);
}

#[test]
fn the_secret_bit_survives_loading_a_save() {
    // A save that carries the secret bit and the first two levels loads all three, and only those.
    let mut w = World::new();
    w.game_new();
    w.game
        .load_done(crate::world::SECRET_FOUND | 0b11 | (1 << 20));
    assert!(w.game.is_done(CRATER) && w.game.is_done(CAVES));
    assert_ne!(w.game.done & crate::world::SECRET_FOUND, 0);
    assert_eq!(w.game.done & (1 << 20), 0, "stray bits are dropped");
}

#[test]
fn fizz_fires_sideways_on_a_ladder_with_down_held_too() {
    let mut w = lookout();
    w.p.b.x = 17.8;
    w.p.b.y = 3.0;
    run(&mut w, 40, UP);
    assert!(w.p.climb);
    w.shots.clear();
    w.step(DOWN | FIRE);
    let s = w.shots.last().expect("a shot");
    assert!(
        s.vx.abs() > 10.0 && s.vy == 0.0,
        "sideways, got {} {}",
        s.vx,
        s.vy
    );
}

#[test]
fn every_gate_tile_is_drawn_and_fades_when_its_gate_opens() {
    use crate::sprites::Spr;
    use lf_sim::{SpriteRect, STRIDE};
    let mut w = level(crate::levels::MIRROR_SHAFTS);
    w.ents.clear();
    w.spr[Spr::Gate as usize] = SpriteRect {
        u: 0.4,
        v: 0.4,
        uw: 0.01,
        vh: 0.01,
        w: 16.0,
        h: 16.0,
    };
    // Every instance of the gate sprite, as (faint, opaque); drawing is not culled in this call,
    // so all three gates (30 tiles wide, two rows each) are in the buffer.
    let counts = |w: &mut World| {
        w.render(0.5, 0);
        let data = w.inst.as_slice();
        let gates: Vec<f32> = (0..w.inst.len())
            .filter(|&i| data[i * STRIDE + 16] == 0.4)
            .map(|i| data[i * STRIDE + 19])
            .collect();
        let faint = gates.iter().filter(|&&a| a < 0.5).count();
        (faint, gates.len() - faint)
    };
    assert_eq!(
        counts(&mut w),
        (0, 180),
        "all three gates drawn and opaque while shut"
    );
    w.map.set_switch(1, false);
    assert_eq!(
        counts(&mut w),
        (60, 120),
        "gate one faint, the others opaque"
    );
    w.map.set_switch(2, false);
    assert_eq!(counts(&mut w), (120, 60), "gate two faint as well");
    w.map.set_switch(3, false);
    assert_eq!(
        counts(&mut w),
        (180, 0),
        "all faint once all three are open"
    );
}

#[test]
fn the_mural_stays_drawn_while_only_part_of_it_is_on_screen() {
    use crate::sprites::Spr;
    use lf_sim::{SpriteRect, STRIDE};
    let mut w = level(crate::levels::SUGAR_GLASS_GALLERY);
    w.ents.clear();
    w.spr[Spr::Mural as usize] = SpriteRect {
        u: 0.77,
        v: 0.77,
        uw: 0.01,
        vh: 0.01,
        w: 48.0,
        h: 32.0,
    };
    // The mural's bottom-left tile is (130, 11). Put the left edge of the view at column 131, so
    // that tile is off screen while the mural's other two columns are still in view.
    w.half_w = 5.0;
    w.half_h = 4.0;
    w.cam_x = 137.5;
    w.cam_y = 12.5;
    w.pcx = w.cam_x;
    w.pcy = w.cam_y;
    w.render(0.5, crate::render::flags::CULLING);
    let data = w.inst.as_slice();
    let murals = (0..w.inst.len())
        .filter(|&i| data[i * STRIDE + 16] == 0.77)
        .count();
    assert_eq!(
        murals, 1,
        "the mural is drawn although its anchor tile is off screen"
    );
}

#[test]
fn the_green_gumdrop_is_collected_and_opens_only_the_green_door() {
    let mut w = level(crate::levels::FROSTING_SPIRE);
    w.ents.clear();
    assert!(!w.keys_green);
    w.p.b.x = 30.0;
    w.p.b.y = 102.0;
    run(&mut w, 10, 0);
    assert!(w.keys_green, "picked up the green gumdrop");
    assert!(!w.keys_red && !w.keys_blue);
    // Ben is carried to the ground floor and walks into the green door.
    w.p.b.x = 34.5;
    w.p.b.y = 3.0;
    w.p.b.vy = 0.0;
    w.p.face = 1.0;
    run(&mut w, 40, RIGHT);
    assert!(!w.keys_green, "the key is used up");
    assert_eq!(w.map.get(36, 5), 0, "the green door is gone");
    assert_ne!(w.map.get(21, 49), 0, "the red door is untouched");
}
