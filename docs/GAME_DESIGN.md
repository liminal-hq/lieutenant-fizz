# Lieutenant Fizz — Episode 1: The Cocoa Caper
The first episode of *Lieutenant Fizz* (arc one, working title *Invasion of the Zargs*). A Keen-style platformer and the first full test title for the engine (`ENGINE_SPEC.md`).

## Pitch
Billy, 14, has vanished. His cousin Ben, 10, finds a secret lab under their treehouse, a prototype spaghetti with meatballs flying saucer, and Billy's map with an X marked *Planet Zargoth*. He straps on his bicycle helmet and follows him.

## Story
- **Hero:** Ben "Lieutenant Fizz" Blaze, 10, neighbourhood tinkerer. Bicycle helmet, modified pogo stick, Fizz Blaster.
- **Ride:** the spaghetti with meatballs flying saucer: noodle-upholstered seat, breadstick yoke, meatball thrusters, marinara exhaust.
- **Mission:** the Zargs are stealing Earth's cocoa beans to refill Zargoth's drying chocolate rivers. Billy went after them and was captured.
- **Planet Zargoth:** shining, twinkling crystals, chocolate rivers, mechanical hover platforms, frozen chocolate spikes, cake buildings with cookie doors.
- **Nemesis:** Mildred McMire, 10, Mortimer's cousin and best friend, building the galaxy's largest chocolate castle to live in.
- **Ending:** beat Mildred's Cocoa Colossus, take the gold USB drive, hack the citadel security terminal, free Billy.

See `STORY.md` for the full opening cinematic and ending text.

## Structure
1. Title screen, then the opening cinematic (8 panels, skippable).
2. **Overworld:** a top-down map (north is up) cut into four regions by chocolate rivers, each with its own ground, trees and levels. Teleporter pairs link the regions and power up once the levels in front of them are cleared; the Citadel stays locked until the two Frosting Frontier levels before it are done. Autosaves on every visit. A lake at the centre holds an island that cannot be walked to (see **The secret**).
3. **Areas and levels** (14 levels; the `Type` says how a level plays, not where it is):

| Area | Level | Type | Notes |
|---|---|---|---|
| **Crater Fields** (south-west, start) | Crater Fields | crater | Tutorial: slopes, pogo, fizz, chocolate pools, red gumdrop door |
| | Meteor Mesa | open sky | Daylight biscuit-rock mesas with drifting clouds, gaps bridged by cloud ledges and a hover platform, no ceiling |
| | Zarg Lookout | building | A nine-floor watchtower in cutaway: ladders, two flights of stairs and a slow lift link floors that alternate between full-width halls and small landings. The red key is on the roof and its cookie door guards the exit at the bottom, so Ben climbs up and comes back down |
| **Marshmallow Meadows** (north-west) | Marshmallow Meadows | open sky | Soft hills, marshmallows bouncing in fenced corrals to pogo off, the blue key at the top of a stack of cloud ledges |
| | Bonbon Playhouse | theatre | A candy theatre whose backstage rooms are hidden behind painted flats; the red and blue keys are each in a hidden room |
| | Fudge Bog (optional) | crater | A harder crater: wide fudge pools on stepping stones, spike runs, three spore pods |
| **Rock Candy Reach** (north-east) | Crystal Caves | cave | Darker tunnels lit by crystals and Ben's lantern; hover platforms, a bridge switch, bats, blue gumdrop door |
| | Mirror Shafts | vertical cave | A tall crystal shaft sealed by three gates; fizz bounces off mirrors to reach the crystal switches |
| | Sugar Glass Gallery (optional) | theatre | A long theatre of stacked hidden rooms; one of them is the secret |
| **Frosting Frontier** (south-east) | Frosting Flats (optional) | open sky | The hardest open-sky level: spike runs, hover chains over long gaps, drones overhead |
| | Frosting Spire | building | Twelve floors, ladders alternating sides, three lifts and a key in every colour; the green key is on the roof and its door guards the exit at the bottom |
| | Cocoa Foundry | foundry | Conveyor belts, crushing presses and molten metal |
| | Mildred's Citadel | citadel | Boulder ramp, sentries, phantoms, then the boss arena, the terminal and Billy's cage |
| **Gumdrop Isle** (central island, secret) | Gumdrop Isle | open sky | A short, snack-dense bonus course with two caches of cookies that each earn an extra life |

4. **The secret.** The island in the lake, its teleporter pad and its level are visible from the start but cannot be walked to. One hidden room in the Sugar Glass Gallery holds a mural of the crystal forest with a ring of trees glowing in the far north-east. Stepping into it sets the secret-found flag, which makes a hidden teleporter pad appear inside a ring of trees in that corner of the map (the ring has one gap). It pairs with the island pad.
5. Ending (4 panels), then the credits (skippable), then a score card. Episode 1 has no post-credits stinger; it belongs to Episode 3.

## Mechanics
- **Run & jump:** variable-height jump (release early to cut it short), 7 tiles/s top speed, momentum on the ground and in the air.
- **Pogo:** toggled on and off. Bounces automatically; hold jump for a high bounce (~6.6 tiles, adjustable via the pogoHeight setting). Stomping enemies while pogoing bounces higher.
- **Fizz Blaster:** cream soda bubbles. Stuns enemies for 6 s, never kills. Aim up with ↑, or down with ↓ while in the air. Uses ammo; cream soda cans give +5.
- **Stomp:** landing on most enemies stuns them for 3 s.
- **Lives:** start with 3, extra life every 100 snack points. Death returns Ben to the map; game over offers your last save.
- **Ladders:** Up grabs a ladder, Up and Down move along it at 4.5 tiles/s, Jump lets go with a hop, and Ben can fire sideways while climbing. The top rung is a ledge: Ben stands on it and presses Down to climb back onto the ladder. Pogo is off while climbing.
- **Hidden rooms:** in theatre levels, painted flats cover some rooms completely. They fade to about a fifth opaque while Ben is inside and fade back when he leaves; everything inside, from snacks to ambushers, is hidden until then.
- **Mirrors and crystal switches:** a fizz bubble bounces off a 45-degree mirror (`/` sends an upward bubble right, `\` sends it left). A swivel mirror swings to the other angle after every bounce. A crystal switch opens its own gate when a bubble hits it; each gate has its own switch.
- **The secret:** one hidden room in the Sugar Glass Gallery counts as the secret. The first time Ben steps inside, the game records it (bit 15 of the saved progress) and toasts a clue pointing at the far north-east of the map.
- **Conveyor belts** carry Ben (and enemies) at 3 tiles/s in the direction of their chevrons, on top of his own running. **Presses** rise and fall over a floor on a fixed beat; one that is raised is harmless, one that is down crushes. **Molten metal** is lethal like fudge.
- **Keys:** red, blue and green gumdrops open matching cookie doors.

## Collectibles
| Item | Effect |
|---|---|
| Cheezies | 1 point |
| Choc bar | 2 points |
| Fudge cookie | 5 points |
| Cream soda | +5 fizz |
| Gumdrop (red/blue/green) | Opens matching door |
| Gold USB drive | Dropped by the boss; hacks the terminal |

## Enemies
| Template role | Look | Behaviour | Counter |
|---|---|---|---|
| Patroller | Gloop slug | Paces, turns at walls, ledges and hazards | Fizz, stomp, hop over |
| Chaser | Crater hopper | Hops after Ben only when his back is turned | Face it, or stun it |
| Bouncer | Marshmallow blob | Invincible; shoves Ben aside, no damage | Pogo onto it for a springboard |
| Charger | Cocoa beetle | Rams when Ben crosses its row; dazed by walls | Bait it into a wall |
| Ambusher | Crystal bat | Drops from the ceiling when Ben passes under | Fizz upward first |
| Hazard-maker | Spore pod | Puffs every 3 s, making the ground either side deadly | Time it, or stun it |
| Teleporter | Zarg phantom | Vanishes from incoming shots, reappears, fires a 3-way spread | Shoot during its cooldown |
| Bulldozer | Rock roller | Fizz-proof boulder; speeds up downhill | Pogo over it |
| Heavy gunner | Zargoth sentry | Tracks Ben's height; 3-shot burst within 9 tiles | Approach outside its height range |
| Aerial patroller | Gravity drone | Invincible figure-eight path | Jump timing |
| Crusher | Foundry press | Rises and falls on a fixed beat over a floor | Walk under it while it is raised |
| Boss | Cocoa Colossus | Hover → drop globs → slam → charge → overheats with dome open | 3 hits while the dome is open |

## Controls
| Action | Keen-style | Modern | Gamepad |
|---|---|---|---|
| Move | ← → | ← → / A D | D-pad / stick |
| Jump | Ctrl | Z | A |
| Pogo | Alt | X | B / Y |
| Fizz | Space | C | X / RT |
| Menu | Esc | Esc / P | Start |
| Save / Load | F5 / F9 | F5 / F9 | Pause menu |

## Art direction
- 16-colour EGA palette; bright and fun, in the style of *Goodbye, Galaxy!* and *Aliens Ate My Babysitter*.
- Daylight by default, with Last Light's lighting effects layered on top. A night variant is supported (§5.1 of the engine spec).
- UI uses the Liminal HQ design system in the DOM overlay; the world stays strictly pixel art.

## Audio
- **Music:** 8 looping tracks (title, intro, map, crater, caves, citadel, boss, ending).
- **Sound effects:** about 30, tied to the in-world sound captions.
- **Implementation:** written for Undertone; see `ENGINE_SPEC.md` §6.

## Open questions
- Difficulty tuning and secret areas for each level.
- Whether death should keep collected snacks.
- Mortimer's role in Episode 2.
