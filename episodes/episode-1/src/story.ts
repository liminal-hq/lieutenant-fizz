// Episode 1 cinematic panels, boss dialogue and level text.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// Episode 1 text: eight opening cinematic panels (one per scene), the ending, dialogue and level
// blurbs. docs/STORY.md mirrors the cinematic text.

export interface Panel {
  place: string;
  text: string;
}

export const CINE: Panel[] = [
  {
    place: 'The backyard',
    text: "One night, Ben Blaze's cousin Billy didn't come home. Ben checked the treehouse where they always played. Billy wasn't there — but a hatch between the roots was hanging open, and warm light was spilling out.",
  },
  {
    place: 'Under the treehouse',
    text: "A ladder led down to a secret lab: blinking consoles, blueprints pinned to the walls, and a prototype spaghetti with meatballs flying saucer on a launch pad. On the workbench lay Billy's note — a map, with an X and a planet name beside it. “That must be where he's gone.”",
  },
  {
    place: 'Liftoff',
    text: 'Ben put on his bicycle helmet, climbed aboard and hit the big Engage button. A hatch in the lawn slid open, and the saucer rose past the treehouse into the night.',
  },
  {
    place: 'The stratosphere',
    text: "The G-force pressed Ben deep into the oversized, noodle-upholstered captain's chair as the saucer tore through the stratosphere. Marinara-scented exhaust plumed behind him, painting a crimson streak across the night sky. He gripped the steering yoke — which felt suspiciously like a giant, hardened breadstick — and steadied his breathing.",
  },
  {
    place: 'Past the Moon',
    text: "On the dashboard, pinned beneath a blinking, meatball-shaped radar dial, was Billy's note. Ben tapped the X on the crinkled parchment. The destination was boldly scribbled: Planet Zargoth, a remote outpost on the outer galactic rim — exactly the kind of dangerous, alien world Billy would wander off to.",
  },
  {
    place: 'Deep space',
    text: 'Ben engaged the autopilot and popped open the glovebox: a crinkled bag of Cheezies and a cold can of Canadian cream soda. The loud, satisfying crunch of the bright orange snacks echoed in the quiet cabin as the stars stretched into streaks of blinding white light outside the viewport.',
  },
  {
    place: 'Planet Zargoth',
    text: 'Hours later, the navigation console chimed a whimsical, retro 8-bit melody. Planet Zargoth loomed through the windshield, a swirling marble of neon green and deep purple clouds. Ben wiped his cheesy fingers on his jeans, grabbed the yoke, and manoeuvred the pasta-themed vessel down through the upper atmosphere.',
  },
  {
    place: 'The crystal forest',
    text: 'He touched down with a heavy, saucy thud in the centre of a glowing, crystalline forest. The ramp extended with a hiss of steam. Ben adjusted the chin strap of his bicycle helmet, tucked his trusty, modified pogo stick under one arm, and stepped out into the alien unknown, determined to track down his missing cousin.',
  },
];

/** Music track per cinematic panel. */
export const CINE_TRACK = ['yard', 'lab', 'launch', 'launch', 'cine', 'cine', 'cine', 'cine'];

export const END: Panel[] = [
  {
    place: 'The security terminal',
    text: "The gold USB drive slid into the security terminal with a satisfying click. Lines of green text raced up the screen. Mildred's security system blinked, sputtered, and gave up.",
  },
  {
    place: "Billy's cage",
    text: 'The cage door swung open. Billy stepped out, straightened his football helmet and grinned. “Took you long enough, Lieutenant Fizz.”',
  },
  {
    place: 'Somewhere above',
    text: "Somewhere above, a hatch slammed. Mildred McMire's voice echoed down the chocolate halls: “This isn't over, Ben Blaze! Mortimer and I have plenty more castles to build!”",
  },
  {
    place: 'Homeward',
    text: "The cousins raced back to the spaghetti with meatballs flying saucer, its hold stuffed with every cocoa bean the Zargs had taken. Earth's chocolate was safe — for now.",
  },
];

export type DialogueId = 'bossIntro' | 'bossDefeated';
export type Line = [speaker: string, text: string];

/** Indexed by the sim's DIALOGUE event argument (0 = intro, 1 = defeated). */
export const DIALOGUE: Record<DialogueId, Line[]> = {
  bossIntro: [
    [
      'Mildred McMire',
      "Ben Blaze? Mortimer said Billy's little cousin might show up. Cute helmet.",
    ],
    [
      'Mildred McMire',
      'Every cocoa bean on Earth is going into my castle — the biggest chocolate castle in the galaxy! Colossus, squash him!',
    ],
    ['Ben', 'Not before I get Billy back.'],
    [
      'Tip',
      "The Colossus's armour shrugs off fizz. Wait for its dome to pop open after a charge, then strike.",
    ],
  ],
  bossDefeated: [
    ['Mildred McMire', "My Colossus! Fine, keep your silly cousin. I've got a castle to finish!"],
    [
      'Ben',
      "It dropped something… a gold USB drive. There's a security terminal back by the entrance.",
    ],
  ],
};

export interface LevelInfo {
  name: string;
  blurb: string;
  /** Music track while playing it. */
  track: string;
  /** Shown on the level-cleared card. */
  cleared: string;
}

/** Indexed by level id, matching the `LEVELS` table in the Rust sim. */
export const LEVELS: LevelInfo[] = [
  {
    name: 'Crater Fields',
    blurb: 'Twinkling crystal craters and chocolate pools.',
    track: 'crater',
    cleared:
      'The path on to Meteor Mesa is open. Clear it and Zarg Lookout, and the first teleporter will hum.',
  },
  {
    name: 'Crystal Caves',
    blurb: 'Dark, glittering tunnels over chocolate rivers.',
    track: 'caves',
    cleared:
      'One of the two levels the Frosting Frontier teleporter wants is done. Mirror Shafts is the other.',
  },
  {
    name: "Mildred's Citadel",
    blurb: 'A castle of cake, cookie doors and frozen chocolate.',
    track: 'citadel',
    cleared: 'The Citadel is cleared.',
  },
  {
    name: 'Meteor Mesa',
    blurb: 'Biscuit-rock mesas in open sky, with cloud ledges between them.',
    track: 'sky',
    cleared: 'The sky is clear all the way to the horizon. Zarg Lookout is next along the path.',
  },
  {
    name: 'Zarg Lookout',
    blurb: 'A watchtower of ladders, stairs and one slow lift. The red key is on the roof.',
    track: 'tower',
    cleared: 'The first teleporter is humming now, and Marshmallow Meadows are waiting.',
  },
  {
    name: 'Marshmallow Meadows',
    blurb: 'Soft hills, fenced-in marshmallows to bounce off, and a blue key in the clouds.',
    track: 'sky',
    cleared: 'Marshmallow fluff clings to Ben’s boots. Somewhere ahead, the music of a playhouse.',
  },
  {
    name: 'Bonbon Playhouse',
    blurb: 'A candy theatre. The walls are only painted flats, so walk right in.',
    track: 'theatre',
    cleared:
      'The curtain falls on a very sticky stage. With Marshmallow Meadows, that powers the teleporter to Rock Candy Reach.',
  },
  {
    name: 'Fudge Bog',
    blurb: 'Wide pools of hot fudge, stepping stones and three very puffy spore pods.',
    track: 'crater',
    cleared: 'Ben wipes fudge off his boots. That was the hard way round, and he knows it.',
  },
  {
    name: 'Mirror Shafts',
    blurb:
      'A tall crystal shaft sealed by gates. Bounce fizz off the mirrors to reach the switches.',
    track: 'caves',
    cleared:
      'The last gate slides open and the shaft hums. With the Crystal Caves, that powers the teleporter to the Frosting Frontier.',
  },
  {
    name: 'Sugar Glass Gallery',
    blurb: 'A long gallery of hidden rooms. Not everything on these walls is decoration.',
    track: 'theatre',
    cleared: 'Ben leaves the gallery with a head full of paintings and pockets full of crumbs.',
  },
  {
    name: 'Frosting Flats',
    blurb: 'Long, open stretches of frosted rock, spike runs and hover platforms. Mind the drones.',
    track: 'sky',
    cleared: 'A long way across, and not a single frosting stain on Ben’s helmet. Almost.',
  },
  {
    name: 'Frosting Spire',
    blurb: 'The tallest Zarg tower: twelve floors, three lifts, and a key in every colour.',
    track: 'tower',
    cleared:
      'Twelve floors up and twelve floors down, and Ben’s knees have opinions about it. The Citadel opens once the Foundry is done too.',
  },
  {
    name: 'Cocoa Foundry',
    blurb: 'Belts, presses and pools of molten metal. Mind the timing, and mind the belts.',
    track: 'foundry',
    cleared:
      'The presses thump on without him. Ben dusts the soot off his helmet. The Citadel opens once the Spire is done too.',
  },
  {
    name: 'Gumdrop Isle',
    blurb: 'A secret island, covered in snacks. Nobody was supposed to find this place.',
    track: 'secret',
    cleared:
      'Ben leaves the island with a few more lives than he came with, and a very full pocket.',
  },
];
