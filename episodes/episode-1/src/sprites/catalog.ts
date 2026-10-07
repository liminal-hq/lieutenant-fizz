// Collects every Episode 1 sprite into the named definitions the atlas packs.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { SpriteDef } from '@lieutenant-fizz/engine/atlas';
import { ben, benMap, billy, mortimer, type BenPose } from './characters';
import * as e from './enemies';
import * as it from './items';
import * as sc from './scenes';
import * as t from './tiles';

/** Every sprite in Episode 1, in atlas order. Names are the contract with the Rust sim. */
export function defineSprites(): SpriteDef[] {
  const d: SpriteDef[] = [];
  const add = (name: string, grid: SpriteDef['grid'], tile = false): void => {
    d.push({ name, grid, tile });
  };
  for (const pose of [
    'stand',
    'run1',
    'run2',
    'jump',
    'shoot',
    'pogo',
    'pogo2',
    'climb1',
    'climb2',
  ] as BenPose[]) {
    add(`ben_${pose}`, ben(pose));
  }
  add('benMap0', benMap(0));
  add('benMap1', benMap(1));
  add('billyCage', billy(true));
  add('billy', billy(false));
  add('billyAlt', mortimer());
  const pairs: [string, (f: 0 | 1) => SpriteDef['grid']][] = [
    ['gloop', e.gloop],
    ['hopper', e.hopper],
    ['marsh', e.marsh],
    ['beetle', e.beetle],
    ['bat', e.bat],
    ['pod', e.pod],
    ['phantom', e.phantom],
    ['sentry', e.sentry],
    ['drone', e.drone],
    ['boss', e.boss],
    ['spore', e.spore],
  ];
  for (const [n, f] of pairs) {
    add(`${n}0`, f(0));
    add(`${n}1`, f(1));
  }
  add('roller', e.roller());
  add('bubble', e.bubble());
  add('zshot', e.zshot());
  add('glob', e.glob());
  add('stars0', e.stars(0));
  add('stars1', e.stars(1));
  add('puff', e.puff());
  add('cheezie', it.cheezie());
  add('choc', it.choc());
  add('cookie', it.cookie());
  add('soda', it.soda());
  add('keyRed', it.gumdrop('r', 'R'));
  add('keyBlue', it.gumdrop('b', 'B'));
  add('usb', it.usb());

  let seed = 10;
  for (const b of Object.keys(t.BIOMES) as t.Biome[]) {
    add(
      `${b}Top`,
      t.ground(b, () => 16, seed++),
      true,
    );
    add(`${b}Fill`, t.fillTile(b, seed++), true);
    add(
      `${b}R45`,
      t.ground(b, (x) => x, seed++),
      true,
    );
    add(
      `${b}L45`,
      t.ground(b, (x) => 16 - x, seed++),
      true,
    );
    add(
      `${b}R22A`,
      t.ground(b, (x) => x / 2, seed++),
      true,
    );
    add(
      `${b}R22B`,
      t.ground(b, (x) => 8 + x / 2, seed++),
      true,
    );
    add(
      `${b}L22A`,
      t.ground(b, (x) => 16 - x / 2, seed++),
      true,
    );
    add(
      `${b}L22B`,
      t.ground(b, (x) => 8 - x / 2, seed++),
      true,
    );
    add(`${b}Plat`, t.platTile(b));
    add(`${b}Block`, t.blockTile(b), true);
    add(`${b}Back`, t.backTile(b, seed++), true);
  }
  add('crysC', t.crystal('c', 'C'));
  add('crysM', t.crystal('m', 'M'));
  add('spike', t.spikeTile());
  add('chocTop0', t.chocTop(0), true);
  add('chocTop1', t.chocTop(1), true);
  add('chocDeep0', t.chocDeep(0), true);
  add('chocDeep1', t.chocDeep(1), true);
  add('doorRed', t.doorTile('r'));
  add('doorBlue', t.doorTile('b'));
  add('exitTop', t.exitTile(true));
  add('exitBot', t.exitTile(false));
  add('bridge', t.bridgeTile());
  add('hover0', t.hoverPlat(0));
  add('hover1', t.hoverPlat(1));
  add('switchOff', t.switchTile(false));
  add('switchOn', t.switchTile(true));
  add('terminal0', t.terminal(0));
  add('terminal1', t.terminal(1));

  add('owGrass', sc.owGrass(3), true);
  add('owPath', sc.owPath(4), true);
  add('owRiver0', sc.owRiver(0), true);
  add('owRiver1', sc.owRiver(1), true);
  add('owTree0', sc.owTree(0));
  add('owTree1', sc.owTree(1));
  add('owRock', sc.owRock());
  add('owCrater', sc.owCrater());
  add('owMesa', sc.owMesa());
  add('owTower', sc.owTower());
  add('owCave', sc.owCave());
  add('owCastle', sc.owCastle());
  add('owTele0', sc.owTele(0));
  add('owTele1', sc.owTele(1));
  add('owFlag', sc.owFlag());
  add('saucer', sc.saucer());
  add('planet', sc.planet());
  add('bigTree', sc.bigTree());
  add('house', sc.house());
  add('fence', sc.fence(), true);
  add('moon', sc.moon());
  add('labPanel', sc.labPanel(), true);
  add('console0', sc.labConsole(0));
  add('console1', sc.labConsole(1));
  add('blueprint', sc.blueprint());
  add('bench', sc.bench());
  add('pad', sc.launchPad());
  add('ladder', sc.ladder(), true);
  add('ladderTop', sc.ladderTop(), true);
  add('lift0', sc.liftTray(0));
  add('lift1', sc.liftTray(1));
  add('lamp', sc.lamp());
  add('hillTop', sc.hillTop());
  add('mtnTop', sc.mtnTop());
  add('fill', sc.fillSolid(), true);
  add('star', sc.star());
  add('cloud', sc.cloud());
  return d;
}
