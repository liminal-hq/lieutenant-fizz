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
    assert_eq!(
        w.map.get(36, 5),
        WALLBG,
        "the green door is gone, leaving interior wall"
    );
    assert_ne!(w.map.get(21, 49), 0, "the red door is untouched");
}

fn foundry() -> World {
    let mut w = level(crate::levels::COCOA_FOUNDRY);
    w.ents.retain(|e| e.kind == Kind::Press);
    w
}

#[test]
fn a_belt_carries_ben_and_he_can_walk_against_it() {
    let mut w = foundry();
    w.ents.clear();
    // The first right-hand belt starts at x = 12 on floor 4.
    w.p.b.x = 13.0;
    w.p.b.y = 4.0;
    run(&mut w, 5, 0);
    let x0 = w.p.b.x;
    run(&mut w, 30, 0);
    let drift = (w.p.b.x - x0) / 0.5;
    assert!(
        (drift - 3.0).abs() < 0.4,
        "carried right at 3 tiles/s, got {drift}"
    );
    // Walking left on it nets 7 - 3 tiles/s once he is up to speed; start at the belt's far end so
    // he stays on it for the whole measurement.
    w.p.b.x = 20.8;
    w.p.b.y = 4.0;
    run(&mut w, 25, LEFT);
    let x1 = w.p.b.x;
    run(&mut w, 15, LEFT);
    let net = (x1 - w.p.b.x) / 0.25;
    assert!(w.p.b.x > 12.0, "still on the belt, at {:.1}", w.p.b.x);
    assert!(
        (net - 4.0).abs() < 0.8,
        "net 4 tiles/s against the belt, got {net}"
    );
}

#[test]
fn belts_carry_enemies_too_and_they_still_turn_at_the_end() {
    let mut w = level(crate::levels::COCOA_FOUNDRY);
    w.ents.clear();
    let g = crate::ents::Spawn {
        kind: Kind::Gloop,
        x: 14.0,
        y: 4.0,
        dir: -1.0,
        ride: false,
    };
    let e = w.init_ent(&g);
    w.ents.push(e);
    run(&mut w, 300, 0);
    let b = &w.ents[0].b;
    assert!(
        b.x > 0.0 && b.y > 3.0,
        "stayed on the floor, at {:.1},{:.1}",
        b.x,
        b.y
    );
}

#[test]
fn molten_metal_kills_like_fudge() {
    let mut w = level(crate::levels::COCOA_FOUNDRY);
    w.ents.clear();
    w.game.lives = 3;
    // The first furnace pool is at x 43..45; drop in.
    assert_eq!(w.map.get(44, 1), FURNACE);
    w.p.b.x = 44.0;
    w.p.b.y = 4.0;
    run(&mut w, 60, 0);
    assert!(w.p.dead > 0.0, "Ben fell into molten metal and died");
}

#[test]
fn a_press_kills_while_down_and_is_harmless_while_raised() {
    let mut w = foundry();
    // The press at x = 24 sits over floor 4, raised bottom at y 7.
    let i = w
        .ents
        .iter()
        .position(|e| e.kind == Kind::Press && (e.b.x - 23.5).abs() < 0.01)
        .expect("press at 24");
    // Raised: phase 0.
    w.ents[i].t = 0.0;
    w.p.b.x = 23.8;
    w.p.b.y = 4.0;
    w.p.inv = 0.0;
    w.step(0);
    w.step(0);
    assert_eq!(w.p.dead, 0.0, "a raised press is harmless");
    assert!(w.ents[i].b.y > 6.5, "raised, y = {}", w.ents[i].b.y);
    // Down: half a period later, bottom on the floor.
    w.ents[i].t = std::f64::consts::PI / 1.6;
    w.step(0);
    w.step(0);
    assert!(w.ents[i].b.y < 4.5, "down, y = {}", w.ents[i].b.y);
    assert!(w.p.dead > 0.0, "a press that is down crushes Ben");
}

#[test]
fn jumping_into_a_raised_press_is_harmless_and_it_kills_as_it_comes_down_on_him() {
    let mut w = foundry();
    let i = w
        .ents
        .iter()
        .position(|e| e.kind == Kind::Press && (e.b.x - 23.5).abs() < 0.01)
        .expect("press at 24");
    // Hold the press raised (phase 0 keeps it up) and put Ben inside its box, as if he had jumped
    // up into it from the floor below: nothing happens.
    w.ents[i].t = 0.0;
    w.p.b.x = 23.8;
    w.p.b.y = 7.5;
    w.p.b.vy = 0.0;
    w.p.inv = 0.0;
    w.step(0);
    assert!(w.ents[i].b.y > 6.5, "still raised, y = {}", w.ents[i].b.y);
    assert_eq!(
        w.p.dead, 0.0,
        "a raised press does not hurt even when he is inside it"
    );
    // As soon as it has come down far enough, the same overlap is fatal.
    w.ents[i].t = std::f64::consts::PI / 1.6;
    w.p.b.y = 4.0;
    // Entities move after Ben in a tick, so the press is down by the second one.
    w.step(0);
    w.step(0);
    assert!(w.p.dead > 0.0, "the lowered press crushes him");
}

#[test]
fn presses_are_staggered_deterministically() {
    let a = foundry();
    let b = foundry();
    let phases = |w: &World| -> Vec<f64> {
        w.ents
            .iter()
            .filter(|e| e.kind == Kind::Press)
            .map(|e| e.t)
            .collect()
    };
    assert_eq!(phases(&a), phases(&b), "same every run");
    let p = phases(&a);
    assert!(p.len() >= 10);
    assert!(
        p.windows(2).any(|w| (w[0] - w[1]).abs() > 0.5),
        "not all in step"
    );
}

fn map_world() -> World {
    let mut w = World::new();
    w.game_new();
    w.enter_map();
    w.events.clear();
    w
}

fn stand_on(w: &mut World, i: usize) {
    let pt = w.points[i];
    w.p.b.x = pt.x + 0.2;
    w.p.b.y = pt.y + 0.2;
    w.near = None;
}

#[test]
fn the_island_pad_is_dormant_and_says_nothing_helpful_until_the_secret_is_found() {
    let mut w = map_world();
    stand_on(&mut w, 20);
    w.step(0);
    let p = events_of(&w, ev::MAP_PROMPT).pop().expect("a prompt");
    assert_eq!(p.a, 5.0, "dormant-teleporter prompt");
    w.step(JUMP);
    assert!(
        (w.p.b.x - (w.points[20].x + 0.2)).abs() < 0.3,
        "a dormant pad does not move Ben"
    );
}

#[test]
fn the_hidden_pad_is_neither_drawn_nor_usable_until_the_secret_is_found() {
    use crate::sprites::Spr;
    use lf_sim::{SpriteRect, STRIDE};
    let mut w = map_world();
    let rect = |u: f32| SpriteRect {
        u,
        v: u,
        uw: 0.01,
        vh: 0.01,
        w: 16.0,
        h: 16.0,
    };
    w.spr[Spr::OwTele0 as usize] = rect(0.2);
    w.spr[Spr::OwTele1 as usize] = rect(0.2);
    w.half_w = 40.0;
    w.half_h = 30.0;
    w.cam_x = 30.0;
    w.cam_y = 22.0;
    w.pcx = 30.0;
    w.pcy = 22.0;
    let pads = |w: &mut World| {
        w.render(0.5, 0);
        let data = w.inst.as_slice();
        (0..w.inst.len())
            .filter(|&i| data[i * STRIDE + 16] == 0.2)
            .count()
    };
    let before = pads(&mut w);
    // Stand on the hidden pad: no prompt appears, because nothing is there yet.
    stand_on(&mut w, 21);
    w.events.clear();
    w.step(0);
    assert!(
        events_of(&w, ev::MAP_PROMPT).is_empty(),
        "nothing to prompt about"
    );
    w.game.done |= crate::world::SECRET_FOUND;
    let after = pads(&mut w);
    assert_eq!(
        after,
        before + 1,
        "the hidden pad appears once the secret is found"
    );
    // Now it prompts, and the pair carry Ben across the lake and back.
    stand_on(&mut w, 21);
    w.events.clear();
    w.step(0);
    let p = events_of(&w, ev::MAP_PROMPT).pop().expect("a prompt");
    assert_eq!((p.a, p.c), (2.0, 1.0), "a powered teleporter");
    w.step(JUMP);
    let isle = w.points[20];
    assert!(
        (w.p.b.x - (isle.x + 0.2)).abs() < 0.5 && (w.p.b.y - (isle.y + 0.1)).abs() < 0.5,
        "carried to the island pad at {:.1},{:.1}",
        w.p.b.x,
        w.p.b.y
    );
}

#[test]
fn the_citadel_point_is_locked_until_the_spire_and_the_foundry_are_both_cleared() {
    let mut w = map_world();
    let i = w
        .points
        .iter()
        .position(|p| p.kind == crate::levels::PtKind::Level && p.level == CITADEL)
        .unwrap();
    stand_on(&mut w, i);
    w.step(0);
    let p = events_of(&w, ev::MAP_PROMPT).pop().unwrap();
    assert_eq!(p.a, 4.0, "locked");
    w.step(JUMP);
    assert_eq!(w.mode, Mode::Map);
    w.game.set_done(crate::levels::FROSTING_SPIRE);
    stand_on(&mut w, i);
    w.step(0);
    w.step(JUMP);
    assert_eq!(w.mode, Mode::Map, "one of two is not enough");
    w.game.set_done(crate::levels::COCOA_FOUNDRY);
    stand_on(&mut w, i);
    w.step(0);
    w.step(JUMP);
    assert_eq!(w.mode, Mode::Level);
    assert_eq!(w.level_id, CITADEL);
}

#[test]
fn a_saved_map_position_inside_a_river_snaps_back_to_the_saucer() {
    let mut w = World::new();
    w.game_new();
    // On the old map this was open ground; on the new one it is the vertical river.
    w.game.map_pos = Some((24.5, 10.0));
    w.enter_map();
    let start = crate::levels::build_overworld().start;
    assert_eq!((w.p.b.x, w.p.b.y), start, "snapped to the saucer");
    // So does one off the map altogether, which a hand-edited save could hold.
    for off in [(12.0, -5.0), (-3.0, 10.0), (12.0, 80.0), (90.0, 10.0)] {
        let mut w = World::new();
        w.game_new();
        w.game.map_pos = Some(off);
        w.enter_map();
        assert_eq!((w.p.b.x, w.p.b.y), start, "{off:?} snaps to the saucer");
    }
    // A position on open ground is kept.
    let mut w = World::new();
    w.game_new();
    w.game.map_pos = Some((12.2, 19.0));
    w.enter_map();
    assert_eq!((w.p.b.x, w.p.b.y), (12.2, 19.0));
}

#[test]
fn every_teleporter_lands_ben_on_walkable_ground() {
    let mut w = map_world();
    w.game.done = crate::world::PROGRESS_BITS;
    let teles: Vec<usize> = w
        .points
        .iter()
        .enumerate()
        .filter(|(_, p)| p.kind == crate::levels::PtKind::Tele)
        .map(|(i, _)| i)
        .collect();
    assert!(teles.len() >= 8);
    for i in teles {
        let from = w.points[i];
        stand_on(&mut w, i);
        w.step(0);
        w.step(JUMP);
        let to = w.points[from.to];
        // Ben's 0.6 by 0.6 body covers only grass or path at the other end.
        for (dx, dy) in [(0.0, 0.0), (0.6, 0.0), (0.0, 0.6), (0.6, 0.6)] {
            let t = w
                .map
                .get((w.p.b.x + dx).floor() as i32, (w.p.b.y + dy).floor() as i32);
            assert!(
                t == GRASS || t == PATH,
                "pad {i} lands Ben on tile {t} at {:.1},{:.1}",
                w.p.b.x + dx,
                w.p.b.y + dy
            );
        }
        assert!(
            (w.p.b.x - (to.x + 0.2)).abs() < 0.01,
            "pad {i} lands at its partner"
        );
        // And he is not wedged: some direction lets him move.
        let (x0, y0) = (w.p.b.x, w.p.b.y);
        let mut moved = false;
        for dir in [LEFT, RIGHT, UP, DOWN] {
            let mut v = map_world();
            v.game.done = w.game.done;
            v.p.b.x = x0;
            v.p.b.y = y0;
            run(&mut v, 12, dir);
            moved |= (v.p.b.x - x0).abs() + (v.p.b.y - y0).abs() > 0.5;
        }
        assert!(moved, "pad {i}: Ben is stuck after landing");
    }
}

#[test]
fn enemies_in_a_hidden_room_wait_there_until_ben_walks_in() {
    let mut w = level(crate::levels::BONBON_PLAYHOUSE);
    // The tutorial room on the path holds a gloop that would otherwise pace out of it.
    let room = w
        .rooms
        .iter()
        .position(|r| r.contains(24, 6))
        .expect("tutorial room");
    let g = w
        .ents
        .iter()
        .position(|e| e.kind == Kind::Gloop && w.rooms[room].contains(e.b.x as i32, e.b.y as i32))
        .expect("a gloop in the room");
    let x0 = w.ents[g].b.x;
    // Ben waits far away, well past the 4 seconds a gloop needs to leave the room.
    w.p.inv = 1e9;
    w.p.b.x = 5.0;
    w.p.b.y = 4.0;
    run(&mut w, 360, 0);
    assert_eq!(w.ents[g].b.x, x0, "the ambusher has not moved");
    assert!(w.rooms[room].contains(w.ents[g].b.x as i32, w.ents[g].b.y as i32));
    // Once Ben is inside and the flat has faded, it moves like any other gloop.
    w.p.b.x = 18.0;
    w.p.b.y = 6.0;
    run(&mut w, 90, 0);
    assert!(w.room_alpha[room] < 0.9, "revealed");
    assert!((w.ents[g].b.x - x0).abs() > 0.2, "and awake now");
}

#[test]
fn enemies_outside_hidden_rooms_are_not_held_back() {
    let mut w = level(crate::levels::BONBON_PLAYHOUSE);
    let g = w
        .ents
        .iter()
        .position(|e| e.kind == Kind::Gloop && e.b.x < 12.0)
        .expect("the first gloop is outside any room");
    let x0 = w.ents[g].b.x;
    run(&mut w, 120, 0);
    assert!((w.ents[g].b.x - x0).abs() > 0.5, "it paces as usual");
}

#[test]
fn the_secret_mural_is_covered_by_the_flat_until_ben_walks_in() {
    use crate::sprites::Spr;
    use lf_sim::{SpriteRect, STRIDE};
    let mut w = level(crate::levels::SUGAR_GLASS_GALLERY);
    w.ents.clear();
    let rect = |u: f32| SpriteRect {
        u,
        v: u,
        uw: 0.01,
        vh: 0.01,
        w: 16.0,
        h: 16.0,
    };
    w.spr[Spr::Mural as usize] = rect(0.77);
    w.spr[Spr::Facade as usize] = rect(0.31);
    w.half_w = 12.0;
    w.half_h = 8.0;
    w.render(0.5, 0);
    let data = w.inst.as_slice();
    let n = w.inst.len();
    let mural = (0..n)
        .find(|&i| data[i * STRIDE + 16] == 0.77)
        .expect("the mural is drawn");
    // Every one of the mural's six cells has a flat drawn over it, after the mural.
    for dx in 0..3 {
        for dy in 0..2 {
            let (cx, cy) = (130.5 + dx as f32, 11.5 + dy as f32);
            let covered = (mural + 1..n).any(|i| {
                data[i * STRIDE + 16] == 0.31
                    && (data[i * STRIDE + 12] - cx).abs() < 0.01
                    && (data[i * STRIDE + 13] - cy).abs() < 0.01
            });
            assert!(covered, "no flat over mural cell {cx},{cy}");
        }
    }
}

#[test]
fn jumping_off_a_ladder_with_up_held_does_not_grab_it_again() {
    let mut w = lookout();
    w.p.b.x = 17.8;
    w.p.b.y = 3.0;
    run(&mut w, 40, UP);
    assert!(w.p.climb);
    // Up stays held through the jump, which is the natural way to leap while climbing.
    w.step(UP | JUMP);
    assert!(!w.p.climb, "let go");
    let y0 = w.p.b.y;
    run(&mut w, 8, UP | JUMP);
    assert!(!w.p.climb, "still not on the ladder with Up held");
    assert!(
        w.p.b.y > y0 + 0.8,
        "the hop carried him up and away, y {} -> {}",
        y0,
        w.p.b.y
    );
    // Letting go of Up lifts the lock, so a fresh press grabs the ladder again.
    w.p.b.x = 17.8;
    w.p.b.vy = 0.0;
    run(&mut w, 2, 0);
    run(&mut w, 3, UP);
    assert!(w.p.climb, "a new press of Up grabs it");
}

#[test]
fn a_bubble_fired_from_beside_a_mirror_still_bounces_off_it() {
    let mut w = shafts();
    w.shots.clear();
    // Fired left from Ben's usual muzzle offset (0.6 in front of him) with Ben against the right
    // edge of the swivel's column (centre 0.35 right of the cell's left edge), so the bubble starts
    // 0.75 left of the mirror's centre and moves away from it.
    let i = find(&w, Kind::Swivel, 18.0);
    let (mx, my) = (w.ents[i].b.x + 0.5, w.ents[i].b.y + 0.5);
    w.shots.push(bubble(mx - 0.75, my, -16.0, 0.0));
    w.step(0);
    let s = w.shots.first().expect("the bubble is still flying");
    assert_ne!(
        (s.vx, s.vy),
        (-16.0, 0.0),
        "it was turned by the mirror, not left to fly on into the corridor"
    );
    assert_eq!(s.last, i as i32);
}

/// A bare arena: a floor two tiles thick, open sky, no enemies or items. Walls and vines are added
/// by each test. Ben starts standing at (4, 2).
fn arena() -> World {
    let mut w = level(CRATER);
    w.ents.clear();
    w.items.clear();
    w.plats.clear();
    w.map = lf_sim::TileMap::new(40, 40, props());
    for x in 0..40 {
        for y in 0..2 {
            w.map.set(x, y, FILL);
        }
    }
    w.p.b.x = 4.0;
    w.p.b.y = 2.0;
    w.p.b.vx = 0.0;
    w.p.b.vy = 0.0;
    w.p.inv = 1e9;
    w.cam_x = 10.0;
    w.cam_y = 10.0;
    run(&mut w, 5, 0);
    w
}

#[test]
fn ben_free_climbs_a_vine_in_every_direction_and_lets_go_when_it_runs_out() {
    let mut w = arena();
    // A patch of vine, five wide and eight tall.
    for x in 10..15 {
        for y in 2..10 {
            w.map.set(x, y, VINE);
        }
    }
    w.p.b.x = 11.65;
    w.p.b.y = 2.0;
    run(&mut w, 2, 0);
    run(&mut w, 20, UP);
    assert!(
        w.p.climb && w.p.wall,
        "Up grabs the vine and he climbs it freely"
    );
    let (x0, y0) = (w.p.b.x, w.p.b.y);
    run(&mut w, 30, UP);
    let rate = (w.p.b.y - y0) / 0.5;
    assert!(
        (rate - VINE_SPEED_FOR_TEST).abs() < 0.4,
        "climbs at the vine speed, got {rate}"
    );
    assert!(
        (w.p.b.x - x0).abs() < 0.01,
        "a plain climb does not drift sideways"
    );
    // Sideways, and diagonally, across the vine.
    run(&mut w, 30, RIGHT);
    let moved = w.p.b.x - x0;
    assert!(moved > 1.2, "crosses the vine sideways, moved {moved}");
    let y1 = w.p.b.y;
    run(&mut w, 20, UP | LEFT);
    assert!(
        w.p.b.y > y1 + 0.8 && w.p.b.x < x0 + moved - 0.6,
        "up and left at once"
    );
    // Out the top: no vine left, so he lets go and falls.
    run(&mut w, 200, UP);
    assert!(!w.p.climb, "ran out of vine");
}

#[test]
fn a_ladder_still_snaps_to_its_column_where_a_vine_does_not() {
    let mut w = arena();
    for y in 2..10 {
        w.map.set(10, y, RUNG);
        w.map.set(14, y, VINE);
    }
    w.p.b.x = 9.8;
    run(&mut w, 2, 0);
    run(&mut w, 10, UP);
    assert!(w.p.climb && !w.p.wall, "a ladder is not a vine");
    assert!(
        (w.p.b.centre_x() - 10.5).abs() < 0.01,
        "snapped to the rung"
    );
    let mut v = arena();
    for y in 2..10 {
        v.map.set(14, y, VINE);
    }
    v.p.b.x = 14.1;
    run(&mut v, 2, 0);
    run(&mut v, 10, UP);
    assert!(v.p.wall);
    assert!((v.p.b.x - 14.1).abs() < 0.01, "not snapped to the column");
}

#[test]
fn a_jump_off_a_vine_hops_clear_and_does_not_regrab_with_up_held() {
    let mut w = arena();
    for x in 10..15 {
        for y in 2..12 {
            w.map.set(x, y, VINE);
        }
    }
    w.p.b.x = 11.65;
    run(&mut w, 2, 0);
    run(&mut w, 30, UP);
    assert!(w.p.climb);
    w.step(UP | JUMP);
    assert!(!w.p.climb && !w.p.wall);
    run(&mut w, 6, UP | JUMP);
    assert!(!w.p.climb, "no immediate re-grab with Up held");
}

#[test]
fn ben_pulls_himself_up_onto_a_ledge_he_nearly_made() {
    let mut w = arena();
    // A wall four tiles tall: a plain jump (about 3.4) falls just short of its top.
    for x in 12..30 {
        for y in 2..6 {
            w.map.set(x, y, FILL);
        }
    }
    w.p.b.x = 10.5;
    run(&mut w, 2, 0);
    run(&mut w, 6, RIGHT);
    w.step(RIGHT | JUMP);
    run(&mut w, 40, RIGHT | JUMP);
    assert!(w.p.b.on_ground, "ended up standing");
    assert!(
        (w.p.b.y - 6.0).abs() < 0.01,
        "on top of the wall, y = {}",
        w.p.b.y
    );
    assert!(w.p.b.x >= 12.0, "over the wall, x = {}", w.p.b.x);
}

#[test]
fn a_ledge_that_is_too_high_or_too_cramped_is_not_mantled() {
    // Too high: a six-tile wall.
    let mut w = arena();
    for y in 2..8 {
        w.map.set(12, y, FILL);
    }
    w.p.b.x = 10.5;
    run(&mut w, 2, 0);
    run(&mut w, 6, RIGHT);
    w.step(RIGHT | JUMP);
    run(&mut w, 60, RIGHT | JUMP);
    assert!(
        w.p.b.y < 3.0,
        "a six-tile wall is not pulled up, y = {}",
        w.p.b.y
    );
    // Too cramped: the same four-tile wall under a ceiling with no room to stand on top.
    let mut c = arena();
    for y in 2..6 {
        c.map.set(12, y, FILL);
    }
    for x in 12..16 {
        c.map.set(x, 7, FILL);
    }
    c.p.b.x = 10.5;
    run(&mut c, 2, 0);
    run(&mut c, 6, RIGHT);
    c.step(RIGHT | JUMP);
    run(&mut c, 40, RIGHT | JUMP);
    assert!(
        c.p.b.y < 3.0,
        "no pull-up into a spot he cannot fit, y = {}",
        c.p.b.y
    );
}

#[test]
fn ben_kicks_off_a_wall_up_and_away_once_per_side() {
    let mut w = arena();
    for y in 2..30 {
        w.map.set(12, y, FILL);
    }
    // Airborne against the left face of the wall.
    w.p.b.x = 11.28;
    w.p.b.y = 8.0;
    w.p.b.vy = 0.0;
    w.p.b.on_ground = false;
    w.step(RIGHT);
    w.step(RIGHT | JUMP);
    assert!(w.p.b.vy > 15.0, "kicked upwards, vy {}", w.p.b.vy);
    assert!(w.p.b.vx < -3.0, "and away from the wall, vx {}", w.p.b.vx);
    assert_eq!(w.p.kick_side, 1.0);
    // Back against the same wall: a second kick on the same side is refused.
    w.p.b.x = 11.28;
    w.p.b.y = 15.0;
    w.p.b.vy = 0.0;
    w.p.b.vx = 0.0;
    w.p.wall_t = 0.0;
    w.step(RIGHT);
    let before = w.p.b.vy;
    w.step(RIGHT | JUMP);
    assert!(
        w.p.b.vy <= before + 0.1,
        "no second kick off the same wall, vy {}",
        w.p.b.vy
    );
}

#[test]
fn a_single_wall_cannot_be_climbed_by_kicking_but_two_facing_walls_can() {
    let climb = |both: bool| {
        let mut w = arena();
        for y in 2..38 {
            w.map.set(12, y, FILL);
            if both {
                w.map.set(16, y, FILL);
            }
        }
        // Between the walls (a gap three tiles wide) or beside one, kicking whenever he touches one.
        w.p.b.x = if both { 14.0 } else { 11.28 };
        w.p.b.y = 3.0;
        let mut top = 0.0_f64;
        for t in 0..420 {
            // Head for the next wall, tap Jump (every other tick) while he touches one, so each kick is a
            // fresh press.
            let towards = if !both || w.p.b.vx >= 0.0 {
                RIGHT
            } else {
                LEFT
            };
            let jump = if w.wall_side().is_some() && t % 2 == 0 {
                JUMP
            } else {
                0
            };
            w.step(towards | jump);
            top = top.max(w.p.b.y);
        }
        top
    };
    let single = climb(false);
    let double = climb(true);
    assert!(single < 9.0, "one wall gives one kick, reached {single}");
    assert!(
        double > single + 4.0,
        "two walls chain kicks: {double} vs {single}"
    );
}

/// The vine speed the tests expect (kept in step with `VINE_SPEED`).
const VINE_SPEED_FOR_TEST: f64 = crate::world::VINE_SPEED;

#[test]
fn a_fizz_shot_brings_down_a_cracked_wall_and_its_cracked_neighbours() {
    let mut w = arena();
    for y in 2..6 {
        w.map.set(10, y, CRACKED);
    }
    w.map.set(10, 6, FILL);
    w.map.set(11, 2, FILL);
    w.p.b.x = 6.0;
    w.p.b.y = 2.0;
    w.p.face = 1.0;
    w.step(FIRE);
    run(&mut w, 40, 0);
    for y in 2..6 {
        assert_eq!(w.map.get(10, y), EMPTY, "cracked tile at row {y} crumbled");
    }
    assert_eq!(w.map.get(10, 6), FILL, "plain rock is untouched");
    assert_eq!(w.map.get(11, 2), FILL);
    // A bubble that is not Ben's leaves it alone.
    w.map.set(20, 2, CRACKED);
    w.shots.push(crate::ents::Shot {
        x: 19.0,
        y: 2.5,
        vx: 10.0,
        vy: 0.0,
        ben: false,
        life: 2.0,
        sprite: 0,
        g: false,
        last: -1,
    });
    run(&mut w, 30, 0);
    assert_eq!(w.map.get(20, 2), CRACKED);
}

#[test]
fn a_cracked_wall_blocks_ben_until_it_is_shot() {
    let mut w = arena();
    for y in 2..8 {
        w.map.set(10, y, CRACKED);
    }
    w.p.b.x = 6.0;
    run(&mut w, 120, RIGHT);
    assert!(w.p.b.x < 10.0, "held at the wall, at {:.1}", w.p.b.x);
}

#[test]
fn shooting_a_lantern_pops_it_into_snacks() {
    let mut w = arena();
    let t = crate::ents::Spawn {
        kind: Kind::Target,
        x: 12.0,
        y: 3.0,
        dir: 4.0,
        ride: false,
    };
    let e = w.init_ent(&t);
    w.ents.push(e);
    w.p.b.x = 6.0;
    w.p.b.y = 2.0;
    w.p.face = 1.0;
    w.step(FIRE);
    run(&mut w, 40, 0);
    assert!(w.ents[0].dead, "popped");
    assert_eq!(w.items.len(), 4);
    assert!(w.items.iter().all(|i| i.kind == ItemKind::Cheezie));
}

#[test]
fn a_wall_painting_shows_its_line_once_per_visit() {
    use crate::text::Toast;
    let mut w = arena();
    let g = crate::ents::Spawn {
        kind: Kind::Glyph,
        x: 8.0,
        y: 2.0,
        dir: 2.0,
        ride: false,
    };
    let e = w.init_ent(&g);
    w.ents.push(e);
    let count = |w: &World| {
        events_of(w, ev::TOAST)
            .iter()
            .filter(|e| e.a == Toast::GlyphFizz as u16 as f32)
            .count()
    };
    w.p.b.x = 8.2;
    run(&mut w, 30, 0);
    assert_eq!(count(&w), 1, "read once while standing in front");
}

/// Plays a scripted visit to a vine nook: walk to the vine, climb to the shelf, step off towards
/// the cracked wall, shoot it, and walk into the room. Returns where Ben ends up.
fn visit_nook(id: u8, start: (f64, f64), vx: i32, shelf: i32, dir: f64, fire: bool) -> (f64, f64) {
    let mut w = level(id);
    w.ents.retain(|e| e.kind == Kind::Glyph);
    w.p.b.x = start.0;
    w.p.b.y = start.1;
    w.p.inv = 1e9;
    w.game.ammo = 5;
    let (toward, away) = if dir > 0.0 {
        (RIGHT, LEFT)
    } else {
        (LEFT, RIGHT)
    };
    // Walk under the vine (it is on the side opposite the direction of the pocket).
    let vine_x = f64::from(vx) + 0.5;
    for _ in 0..600 {
        let dx = vine_x - (w.p.b.x + w.p.b.w / 2.0);
        if dx.abs() < 0.15 {
            break;
        }
        w.step(if dx > 0.0 { RIGHT } else { LEFT });
    }
    let _ = away;
    // Climb until level with the shelf, then step off.
    for _ in 0..600 {
        w.step(UP);
        if w.p.b.y >= f64::from(shelf) + 0.3 {
            break;
        }
    }
    for _ in 0..90 {
        w.step(toward);
    }
    assert!(
        w.p.b.on_ground,
        "standing on the shelf, at {:.1},{:.1}",
        w.p.b.x, w.p.b.y
    );
    if fire {
        w.step(toward | FIRE);
        run(&mut w, 60, 0);
        run(&mut w, 150, toward);
    } else {
        // Without a shot, try everything: run at the wall, jumping again and again.
        for t in 0..300 {
            w.step(toward | if t % 25 < 12 { JUMP } else { 0 });
        }
    }
    (w.p.b.x, w.p.b.y)
}

#[test]
fn the_caves_hidden_room_can_be_reached_by_vine() {
    let (x, y) = visit_nook(crate::levels::CAVES, (91.5, 8.0), 89, 13, -1.0, true);
    assert!(x < 85.0 && y >= 13.0, "inside the room, at {x:.1},{y:.1}");
}

#[test]
fn the_bogs_hidden_room_can_be_reached_by_vine() {
    let (x, y) = visit_nook(crate::levels::FUDGE_BOG, (40.0, 7.0), 36, 12, 1.0, true);
    assert!(x > 40.0 && y >= 12.0, "inside the room, at {x:.1},{y:.1}");
}

#[test]
fn mirror_shafts_has_a_vine_shortcut_past_the_second_gate_that_pays_in_cookies() {
    let mut w = level(crate::levels::MIRROR_SHAFTS);
    w.ents.retain(|e| e.kind == Kind::Glyph);
    // On the wide ledge under gate two, facing the right-hand wall.
    w.p.b.x = 29.0;
    w.p.b.y = 63.0;
    w.p.face = 1.0;
    w.p.inv = 1e9;
    w.game.ammo = 5;
    run(&mut w, 10, 0);
    assert!(w.p.b.on_ground, "standing on the ledge at {:.1}", w.p.b.y);
    assert!(w.map.switch(2), "gate two is closed");
    w.step(RIGHT | FIRE);
    run(&mut w, 40, 0);
    assert_eq!(w.map.get(33, 63), EMPTY, "the cracked wall crumbled");
    // Into the wall, up the vine, and out on top of the gate.
    let score = w.game.score;
    run(&mut w, 60, RIGHT);
    for _ in 0..400 {
        w.step(UP);
        if w.p.b.y >= 68.3 {
            break;
        }
    }
    run(&mut w, 60, LEFT);
    assert!(
        w.p.b.on_ground && w.p.b.y >= 68.0,
        "on top of the gate at {:.1},{:.1}",
        w.p.b.x,
        w.p.b.y
    );
    assert!(w.p.b.x < 33.0, "back in the shaft, at {:.1}", w.p.b.x);
    assert!(w.map.switch(2), "gate two never opened");
    assert!(w.game.score > score, "the cookies paid out");
}

/// Ben bounces on a pogo (Jump held) or hops (Jump tapped) under `x`, and reports whether the
/// cookie on the ledge there got taken.
fn takes_cache_cookie(id: u8, x: f64, pogo: bool) -> bool {
    let mut w = level(id);
    w.ents.clear();
    w.p.inv = 1e9;
    w.p.b.x = x;
    w.p.b.y = 5.5;
    run(&mut w, 120, 0);
    w.p.b.x = x;
    if pogo {
        w.step(POGO);
    }
    for t in 0..600 {
        let jump = if pogo || t % 12 < 8 { JUMP } else { 0 };
        w.step(jump);
        if w.items
            .iter()
            .any(|i| i.kind == ItemKind::Cookie && i.taken && (i.x - x).abs() < 3.0)
        {
            return true;
        }
    }
    false
}

#[test]
fn each_pogo_cache_needs_a_pogo_bounce() {
    use crate::levels::{CAVES, CRATER, FUDGE_BOG};
    for (id, x) in [(CRATER, 9.2), (FUDGE_BOG, 19.2), (CAVES, 6.2)] {
        assert!(
            takes_cache_cookie(id, x, true),
            "level {id}: pogo reaches the cache"
        );
        assert!(
            !takes_cache_cookie(id, x, false),
            "level {id}: a plain jump does not"
        );
    }
}

#[test]
fn rare_actions_earn_a_joke_once() {
    use crate::text::Toast;
    let count = |w: &World, t: Toast| {
        events_of(w, ev::TOAST)
            .iter()
            .filter(|e| e.a == t as u16 as f32)
            .count()
    };
    // Standing around.
    let mut w = arena();
    run(&mut w, 60 * 25, 0);
    assert_eq!(count(&w, Toast::JokeIdle), 1);
    // Thirty pogo bounces.
    let mut w = arena();
    w.step(POGO);
    run(&mut w, 60 * 30, 0);
    assert_eq!(
        count(&w, Toast::JokePogo),
        1,
        "pogo joke fires exactly once"
    );
    // Wall-kicking back and forth.
    let mut w = arena();
    for y in 2..38 {
        w.map.set(12, y, FILL);
        w.map.set(16, y, FILL);
    }
    w.p.b.x = 14.0;
    w.p.b.y = 3.0;
    for t in 0..900 {
        let towards = if w.p.b.vx >= 0.0 { RIGHT } else { LEFT };
        let jump = if w.wall_side().is_some() && t % 2 == 0 {
            JUMP
        } else {
            0
        };
        w.step(towards | jump);
        if w.p.b.y > 30.0 {
            w.p.b.y = 3.0;
            w.p.b.vy = 0.0;
        }
    }
    assert_eq!(count(&w, Toast::JokeKick), 1);
}

#[test]
fn chalk_drawings_of_billy_and_mortimer_have_their_say() {
    use crate::text::Toast;
    let mut w = arena();
    for (x, dir, toast) in [
        (8.0, 0.0, Toast::CameoBilly),
        (20.0, 1.0, Toast::CameoMortimer),
    ] {
        let e = w.init_ent(&crate::ents::Spawn {
            kind: Kind::Cameo,
            x,
            y: 2.0,
            dir,
            ride: false,
        });
        w.ents.push(e);
        w.p.b.x = x + 0.1;
        w.p.b.y = 2.0;
        run(&mut w, 20, 0);
        assert!(
            events_of(&w, ev::TOAST)
                .iter()
                .any(|e| e.a == toast as u16 as f32),
            "{toast:?} shown"
        );
    }
}

#[test]
fn jumping_off_a_vine_beside_a_wall_hops_instead_of_kicking() {
    let mut w = arena();
    for y in 2..20 {
        w.map.set(12, y, FILL);
        w.map.set(13, y, VINE);
    }
    w.p.b.x = 13.02;
    w.p.b.y = 6.0;
    w.p.b.on_ground = false;
    w.step(UP);
    assert!(w.p.climb, "holding the vine");
    w.step(RIGHT | JUMP);
    assert!(
        (w.p.b.vy - 12.0).abs() < 2.0,
        "a hop, not a kick, vy {}",
        w.p.b.vy
    );
    assert!(
        w.p.b.vx >= 0.0,
        "pressed away from the wall, vx {}",
        w.p.b.vx
    );
}

#[test]
fn nothing_gets_past_a_hidden_rooms_cracked_wall_without_a_shot() {
    let (x, _) = visit_nook(crate::levels::CAVES, (91.5, 8.0), 89, 13, -1.0, false);
    assert!(x > 86.0, "stopped at the wall, at {x:.1}");
    let (x, _) = visit_nook(crate::levels::FUDGE_BOG, (40.0, 7.0), 36, 12, 1.0, false);
    assert!(x < 39.0, "stopped at the wall, at {x:.1}");
}

fn ladder_world() -> World {
    let mut w = level(CRATER);
    w.ents.clear();
    for y in 4..14 {
        w.map.set(10, y, RUNG);
    }
    w.p.b.x = 10.15;
    w.p.b.y = 8.0;
    w.p.b.vx = 0.0;
    w.p.b.vy = 0.0;
    w.p.b.on_ground = false;
    w.game.ammo = 9;
    run(&mut w, 2, UP);
    assert!(w.p.climb, "on the ladder");
    w
}

#[test]
fn firing_on_a_ladder_goes_where_up_or_down_points() {
    let mut w = ladder_world();
    w.step(DOWN | FIRE);
    assert!(w.shots.last().unwrap().vy < 0.0, "fired down");
    assert_eq!(w.shots.last().unwrap().vx, 0.0);
    let mut w = ladder_world();
    w.step(UP | FIRE);
    assert!(w.shots.last().unwrap().vy > 0.0, "fired up");
    let mut w = ladder_world();
    w.p.face = 1.0;
    w.step(FIRE);
    let s = w.shots.last().unwrap();
    assert!(s.vx > 0.0 && s.vy == 0.0, "sideways when neither is held");
}

#[test]
fn an_opened_cookie_door_in_a_tower_shows_the_interior_wall_not_the_sky() {
    let mut w = level(crate::levels::ZARG_LOOKOUT);
    w.ents.clear();
    let (dx, dy) = (0..w.map.w)
        .flat_map(|x| (0..w.map.h).map(move |y| (x, y)))
        .find(|&(x, y)| w.map.get(x, y) == DOOR_R)
        .expect("a red door");
    w.keys_red = true;
    w.p.b.x = f64::from(dx) - 0.85;
    w.p.b.y = f64::from(dy);
    w.p.face = 1.0;
    run(&mut w, 3, 0);
    run(&mut w, 20, RIGHT);
    assert_eq!(
        w.map.get(dx, dy),
        WALLBG,
        "the gap is backed by interior wall"
    );
}

#[test]
fn enemies_ignore_lift_trays_and_are_not_carried_off() {
    use lf_sim::Platform;
    let mut w = level(CRATER);
    w.ents.clear();
    // A tray hanging just above the ground, right over where a gloop walks.
    w.plats = vec![Platform::new(7.0, 6.0, 7.0, 12.0, 1.0).sized(3.0, 0.5)];
    let g = w.init_ent(&crate::ents::Spawn {
        kind: Kind::Gloop,
        x: 8.0,
        y: 6.6,
        dir: -1.0,
        ride: false,
    });
    w.ents.push(g);
    run(&mut w, 120, 0);
    assert!(
        w.ents[0].b.y < 5.0,
        "fell through the tray to the ground, at {:.1}",
        w.ents[0].b.y
    );
}

#[test]
fn an_enemy_found_far_from_its_floor_is_sent_home() {
    let mut w = level(CRATER);
    w.ents.clear();
    let g = w.init_ent(&crate::ents::Spawn {
        kind: Kind::Gloop,
        x: 12.0,
        y: 4.0,
        dir: -1.0,
        ride: false,
    });
    let home = (g.b.x, g.b.y);
    w.ents.push(g);
    w.ents[0].b.y += 12.0;
    w.ents[0].b.on_ground = false;
    // Keep it up there (as if on a ledge) for a few seconds.
    let mut sent_home_after = 0;
    for t in 0..400 {
        if w.ents[0].b.y > home.1 + 6.0 {
            w.ents[0].b.y = home.1 + 12.0;
            w.ents[0].b.vy = 0.0;
        } else {
            sent_home_after = t;
            break;
        }
        w.step(0);
    }
    assert!(
        (170..200).contains(&sent_home_after),
        "sent home after about three seconds, at tick {sent_home_after}"
    );
    assert!(
        (w.ents[0].b.x - home.0).abs() < 4.0 && (w.ents[0].b.y - home.1).abs() < 1.0,
        "back home"
    );
}

#[test]
fn ben_remembers_which_way_he_fired_for_his_pose() {
    let mut w = ladder_world();
    w.step(UP | FIRE);
    assert_eq!(w.p.aim, 1);
    let mut w = ladder_world();
    w.step(DOWN | FIRE);
    assert_eq!(w.p.aim, -1);
    let mut w = ladder_world();
    w.step(FIRE);
    assert_eq!(w.p.aim, 0);
}

#[test]
fn holding_up_or_down_on_the_ground_starts_a_look_that_ends_on_release() {
    let mut w = level(CRATER);
    w.ents.clear();
    run(&mut w, 30, 0);
    run(&mut w, 10, UP);
    assert!(w.p.look_up > 0.0 && w.p.look_down == 0.0);
    run(&mut w, 2, 0);
    assert_eq!(w.p.look_up, 0.0);
    run(&mut w, 10, DOWN);
    assert!(w.p.look_down > 0.0);
}

#[test]
fn a_rider_is_carried_by_a_moving_platform_and_is_never_sent_home() {
    use lf_sim::Platform;
    let mut w = level(CRATER);
    w.ents.clear();
    w.plats = vec![Platform::new(8.0, 8.0, 14.0, 8.0, 1.0).sized(3.0, 0.5)];
    let spawn = |ride| crate::ents::Spawn {
        kind: Kind::Beetle,
        x: 9.0,
        y: 8.5,
        dir: -1.0,
        ride,
    };
    let rider = w.init_ent(&spawn(true));
    w.ents.push(rider);
    let start = w.ents[0].b.x;
    run(&mut w, 150, 0);
    assert!(
        w.ents[0].b.y > 7.5,
        "still up on the tray, at {:.1}",
        w.ents[0].b.y
    );
    assert!((w.ents[0].b.x - start).abs() > 0.5, "carried along");
}
