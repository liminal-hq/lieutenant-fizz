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
2. **Overworld:** a top-down map (north is up) cut into four regions by chocolate rivers, each with its own ground, trees and levels. In Crater Fields the three levels open in order, tutorial first. Teleporter pairs link the regions and power up once the levels in front of them are cleared; the Citadel stays locked until the two Frosting Frontier levels before it are done. Autosaves on every visit. A lake at the centre holds an island that cannot be walked to (see **The secret**).
3. **Areas and levels** (15 levels; the `Type` says how a level plays, not where it is):

| Area | Level | Type | Notes |
|---|---|---|---|
| **Crater Fields** (south-west, start) | Crater Fields | crater | Tutorial: slopes, pogo, fizz, chocolate pools, red gumdrop door |
| | Meteor Mesa | open sky | Daylight biscuit-rock mesas with drifting clouds, gaps bridged by cloud ledges and a hover platform, no ceiling |
| | Zarg Lookout | building | A nine-floor watchtower in cutaway: ladders, two flights of stairs and a slow lift link floors that alternate between full-width halls and small landings. The red key is on the roof and its cookie door guards the exit at the bottom, so Ben climbs up and comes back down |
| **Marshmallow Meadows** (north-west) | Marshmallow Meadows | open sky | Soft hills, marshmallows bouncing in fenced corrals to pogo off, the blue key at the top of a stack of cloud ledges |
| | Bonbon Playhouse | theatre | A candy theatre whose backstage rooms are hidden behind painted flats; the red and blue keys are each in a hidden room |
| | Fudge Bog (optional) | crater | A harder crater: wide fudge pools on stepping stones, spike runs, three spore pods |
| **Rock Candy Reach** (north-east) | Crystal Caves | cave | Darker tunnels lit by crystals and Ben's lantern; hover platforms, a bridge switch, bats, blue gumdrop door |
| | Mirror Shafts | vertical cave | A tall crystal shaft sealed by three gates; fizz bounces off mirrors to reach crystal switches that sit in rock, open only to the mirror's bubble |
| | Whisper Hollow (optional) | cave | A cave for climbers: a vine rope over a fudge pool, a three-tile chimney climbed by kicking between its walls (and a vine to finish on), hanging vines across a chasm, tall shelves to pull up onto, and a cracked-wall closet of cookies in the chimney |
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
- **Hidden rooms and shortcuts:** three levels hide something for climbers, each hinted at by a wall painting near its foot. Crystal Caves has a ceiling room (vine up to a shelf, shoot the cracked wall) holding cookies, fudge and soda. Fudge Bog has the same inside a rock outcrop over its first dry land. Mirror Shafts has a deliberate shortcut: from the ledge under gate two, a cracked wall in the right-hand rock opens onto a vine that climbs inside the wall and comes out on top of the gate, skipping puzzle two and paying two cookies. A shortcut always costs a discovery and pays a reward; none skips a level's exit.
- **Pogo caches:** a small ledge about seven tiles above the ground holds a cookie and two cheezies in Crater Fields, Fudge Bog and Crystal Caves. A pogo bounce with Jump held reaches it; an ordinary jump (about three and a half tiles) cannot.
- **Jokes:** a few rare actions earn a one-off toast per level visit: thirty pogo bounces in a row, eight stomps on marshmallows, twelve wall-kicks, and twenty seconds of standing still. None changes the game.
- **Cameos:** a chalk drawing of Billy hides in the Crystal Caves room and one of Mortimer McMire (with a moustache added) in the Fudge Bog room. Touching a drawing shows its line; they are drawings, so they do not contradict Billy's capture.
- **Cracked walls:** a cracked rock tile is solid until a fizz shot from Ben hits it; it and every cracked tile touching it then crumble away. Enemy bubbles do nothing to it. Cracks hide short ways through to secret rooms, so a cracked wall is always a promise, never a trap.
- **Lanterns:** a hanging candy lantern is shootable scenery. A fizz bubble pops it into a few cheezies (the spawn's `dir` is the count, three by default).
- **Wall paintings:** a painted panel shows one line of lore the first time Ben touches it. The paintings hint at the world's history: the crystal growers, the round ship, fizz on a dry crack, and the long stair down.
- **Vines:** vine tiles are not solid. Up grabs one anywhere along its length, Up and Down move at 3.5 tiles/s, and Left and Right shuffle sideways at 3 tiles/s from vine to vine. Jump lets go with a hop, exactly as on a ladder. Vines suit cave walls, where a ladder would look out of place.
- **Mantle:** when Ben jumps and just misses a ledge (the top edge is within about one tile of his feet and there is headroom), he hauls himself up onto it automatically ("heave"). Level design can therefore count on a one-tile overshoot.
- **Wall-kick:** pressing Jump while touching a solid wall in mid-air kicks off it (up 19 tiles/s, away 6 tiles/s). Each side allows one kick until Ben lands, climbs, or kicks off the opposite wall, so a single wall cannot be scaled but two facing walls (a shaft at least three tiles wide) can. A kick is always full height.
- **Enemies and lifts:** enemies pass through lift trays as if they were not there, so a lift never carries one off. A ground enemy that ends up more than four tiles from its home floor for three seconds fades back to where it started.
- **Ladders:** Up grabs a ladder, Up and Down move along it at 4.5 tiles/s, Jump lets go with a hop (Ben cannot grab the same ladder again until Up and Down are released or he leaves it), and Ben can fire while climbing: Fire alone shoots sideways, Up with Fire shoots up and Down with Fire shoots down. The top rung is a ledge: Ben stands on it and presses Down to climb back onto the ladder. Pogo is off while climbing.
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
- **Music:** 16 looping tracks: title, map, boss, ending, four for the opening cinematic (`yard`, `lab`, `launch`, `cine`), and one per level type: `crater`, `caves`, `citadel`, `sky` (open sky), `tower` (buildings), `theatre` (a waltz), `foundry` and `secret` (Gumdrop Isle). Mirror Shafts reuses `caves` and Fudge Bog reuses `crater`.
- **Sound effects:** about 30, tied to the in-world sound captions.
- **Implementation:** written for Undertone; see `ENGINE_SPEC.md` §6.

## Open questions
- Difficulty tuning and secret areas for each level.
- Whether death should keep collected snacks.
- Mortimer's role in Episode 2.
