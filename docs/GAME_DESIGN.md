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
2. **Overworld:** a top-down crystal forest split by chocolate rivers. Teleporter pairs power up as levels are cleared. Autosaves on every visit.
3. **Crater Fields:** tutorial biome with slopes, pogo, fizz, chocolate pools, red gumdrop door.
4. **Crystal Caves:** darker tunnels lit by crystals and Ben's lantern. Hover platforms, a bridge switch, bats, blue gumdrop door.
5. **Mildred's Citadel:** boulder ramp, sentries, phantoms, then the boss arena, the terminal and Billy's cage.
6. Ending (4 panels), then the credits (skippable), then a score card. Episode 1 has no post-credits stinger; it belongs to Episode 3.

## Mechanics
- **Run & jump:** variable-height jump (release early to cut it short), 7 tiles/s top speed, momentum on the ground and in the air.
- **Pogo:** toggled on and off. Bounces automatically; hold jump for a high bounce (~6.6 tiles, adjustable via the pogoHeight setting). Stomping enemies while pogoing bounces higher.
- **Fizz Blaster:** cream soda bubbles. Stuns enemies for 6 s, never kills. Aim up with ↑, or down with ↓ while in the air. Uses ammo; cream soda cans give +5.
- **Stomp:** landing on most enemies stuns them for 3 s.
- **Lives:** start with 3, extra life every 100 snack points. Death returns Ben to the map; game over offers your last save.
- **Keys:** red and blue gumdrops open matching cookie doors.

## Collectibles
| Item | Effect |
|---|---|
| Cheezies | 1 point |
| Choc bar | 2 points |
| Fudge cookie | 5 points |
| Cream soda | +5 fizz |
| Gumdrop (red/blue) | Opens matching door |
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
