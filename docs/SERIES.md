# Series Plan: Lieutenant Fizz

Lieutenant Fizz is an episodic platformer series on the Liminal Retro Engine, a spiritual tie-in to Commander Keen. Episodes are released in arcs of three, each with an arc title and individual episode titles, like Keen's *Invasion of the Vorticons* trilogy.

Billy Blaze is the Keen of this world. Ben "Lieutenant Fizz" Blaze is the cousin who grew up idolising him, and the series follows Ben stepping out of Billy's shadow. Billy and Ben are best-friend cousins, and Billy has a story of his own that runs alongside Ben's.

Games are titled in the Keen style, "Lieutenant Fizz in *Arc Title*", with each episode carrying its own name, for example *Lieutenant Fizz — Episode 1: The Cocoa Caper*. The earlier long title, *The Melting Adventures of Ben "Lieutenant Fizz" Blaze*, is retired.

Working arc title: **Invasion of the Zargs** (Episodes 1–3). This is still a working title and is not locked.

## Cast
- **Ben "Lieutenant Fizz" Blaze, 10.** Protagonist. Neighbourhood tinkerer.
- **Billy Blaze, 14.** Ben's cousin and best friend, a hero with his own story.
- **Mildred McMire, 10.** Ben's rival. Not a pure villain: a lonely kid who wants a home.
- **Mortimer McMire.** Mildred's cousin and best friend. Appears at the end of Episode 3 (see below).

## Arc One: Invasion of the Zargs

### Episode 1: The Cocoa Caper
Ben follows Billy to Planet Zargoth, fights through the Crater Fields, Crystal Caves and Mildred's Citadel, beats the Cocoa Colossus and hacks the security terminal to free Billy. Full design in `GAME_DESIGN.md`; text in `STORY.md`.
- **Ending hook:** a message on the terminal gives Billy a lead he has to follow on his own mission. He leaves with Ben's blessing. Ben has won, been left behind, and has a clear next step.
- **Mildred:** her castle falls and she escapes, humiliated.

### Episode 2
Ben is on his own. The Zargs raid Earth's chocolate, and Ben tackles the raid solo, picking up new gear.
- **Mildred** is back with a bigger plan: drain Earth's cocoa and fill Zargoth's rivers for good.
- **Billy** appears only as a voice on the comms, working his own thread.

### Episode 3
Showdown with Mildred and the bigger force that was using her.
- **Mildred** is shown to be a lonely kid who wanted a home. She and Ben end up as uneasy allies against the real threat.
- **Billy's** storyline crosses with Ben's at the finale. The reunion is earned, with both having grown.
- **Final stinger (after the credits):** Mortimer McMire appears. Mildred's loyalty is pulled two ways: Mortimer was her best friend before Ben came along.

## Looking ahead: Episode 4
Mildred and Mortimer join forces against Billy and Ben, two cousin-pairs and four best-friend bonds put under strain. The arc title and details are for another day. Episode 3 only needs to plant the seed.

## Credits
Every episode ends with a credits sequence after the ending panels and before the score card, and it can be skipped.
- Credit the people involved in making the game, the Liminal HQ studio, the engine (Liminal Retro Engine) and the audio library (Undertone).
- Episode 3's credits are followed by the Mortimer stinger.
- Engine requirement: a skippable, text-driven scene using the existing cinematic panel system. To be specified in `ENGINE_SPEC.md` when built.

## Conventions
- Each episode is a complete story with its own ending. Cliffhangers are hooks, not unresolved plots.
- Episodes are independent apps under `episodes/episode-N/` and share only the engine.
