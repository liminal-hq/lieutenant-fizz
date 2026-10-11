# Audio: the Enhanced sound field and what is parked

**Status: in progress.** This is the plan for Enhanced audio and the sound design built on it. The audio engine spec is in [ENGINE_SPEC.md](ENGINE_SPEC.md) (section 6), and the phone-side slices are in [MOBILE_PLAN.md](MOBILE_PLAN.md). Classic, the sound the game has always had, stays exactly as it is, and Enhanced builds on the same patterns and voices without replacing them.

## Principles
- **Classic is untouched.** Every Enhanced feature runs only in Enhanced, and each change keeps a test that Classic builds no extra audio nodes (the Classic oracle snapshot, `ctx.extras()` empty).
- **Enhanced builds on the patterns.** The same Undertone voices play through a routed context, so the sound keeps its character. Panning, a mix stage, a master chain and per-level rooms are our own Web Audio nodes around it; Undertone itself needs no change.
- **Audio is presentation.** The sim stays deterministic. Positions come from the existing caption events, rooms from the level id, and audio randomness uses its own generator.
- **Tuned by ear.** Automated tests prove graph structure, maths and that Classic is clean; they cannot prove how it sounds. Every stage has live tuning through `__lf.debugAudioTune`, and the sound lab (below) puts it on a screen.
- **Phones.** Phone speakers are often mono in landscape, so the stereo field mostly shows on headphones. Reverb sends and impulse lengths shrink on a coarse pointer, and nothing here may cost battery in Classic.

## Built or in review
| Slice | What | State |
|---|---|---|
| 8b.0 | The Classic oracle: a snapshot of every effect and track, and graph checks | in review (stack) |
| 8b.1 | Positional sound effects (pan and falloff from the screen position), Enhanced as the default, `?audio=classic` to force Classic | in review |
| 8b.2 | The music stereo field: a role on every part, a pan per role, a music bus | in review |
| 8b.3 | The master chain (EQ, compressor, limiter, trim, a small room reverb) and `__lf.debugAudioTune` | in review |
| 8c.2 | The mix stage: muffled music on pause, ducking under dialogue and cinematics, music volume on a bus gain | in review |
| 8c.3 | A reverb room per level, crossfaded between levels | in review |
| 8c.1 | Options > Sound: Style (Classic or Enhanced), Music and Effects, Reset | in progress, merges after slice 6 (it uses the nested sub-screen stack) |
| 8c.8 | The sound lab under `?debug` | in progress |

## Enhanced sound effects
Style (above) chooses how sound is placed and mastered. A separate row, Effects version, chooses which voices an effect plays: Classic is the game's own, Enhanced is the same effects reshaped the way an AdLib sound chip shaped its effects (see `episodes/episode-1/src/audio/enhanced-sfx.ts`). The two are independent, so Enhanced effects can play on the Classic route and the reverse.
- **Pitch curves:** a chain of very short notes, one every 25 ms, each at the next pitch on a curve, for `jump`, `boing`, `sproing`, `vworp`, `zap`, `zzzap`, `hurt`, `stinger` and `stun`. Undertone's `slide` only falls, from an octave above the note; the chip moved its pitch every 1/140 s, so a sweep could rise, fall, bounce or wobble. `stinger` gains a slow falling alarm under the low sting.
- **Shaping:** every pitched voice of 100 Hz or more gets a filter that opens at the attack and closes as the note settles (the audible effect of a decaying modulator), and the longer voices a soft sine partner on the same note 2 ms late.
- **Bell partials:** `win`, `life`, `usb` and `key` get a quiet sine at an inharmonic multiple of a top note (2.76, which the chip's modulator ratio of 67 to 176 gives). It strikes with the note and dies before it, so nothing rings past the end of the effect, and it is turned down by the ear's sensitivity around 3 to 4 kHz. A note whose own harmonics sit within a critical band of the partial (a triangle's third harmonic is the usual one) gets another ratio, so the two do not beat.
- **Data, not code:** `SfxVoice` gains `hz` (an exact pitch) and the filter envelope fields `lpenv`, `lpa`, `lpd`, `lps` and `lpr`, and `AudioPatterns.sfxEnhanced` holds the second set. An effect without an Enhanced version plays as Classic. The built-in synth fallback plays the voices without the filter envelope. The Classic oracle is unchanged.
- **Auto is Classic.** The stored choice is Auto, Classic or Enhanced; `SFX_VERSION_DEFAULT` in `options.ts` is what Auto shows, so the default can change without pinning anyone.

## Enhanced music
A Music version row (Classic or Enhanced) chooses which arrangement of the music plays, independently of Style. Classic is the game's own loops. Enhanced plays the level, overworld and boss cues (`crater`, `caves`, `sky`, `tower`, `theatre`, `foundry`, `secret`, `citadel`, `map`, `boss`) as songs of about a minute, written from the cue's own notes with ordinary song-writing devices, and leaves the title, the cinematics and the ending as they are. See `episodes/episode-1/src/audio/songs.ts`.
- **Sections:** an intro that brings the band in, the tune, a contrast section in a related key (a fifth or fourth up, or a tone for the tower), a breakdown and a snare-roll build, the tune again doubled an octave up (a key higher for the crater, sky, tower and citadel), and a one-bar fill that turns the end back into the start so the loop has no seam. The form whose length lands nearest a minute is chosen for each cue. The overworld starts straight on the tune (A B A′) and the boss keeps its tempo; neither has an intro or a fill.
- **Depth:** every melodic part opens a filter at each attack and closes it as the note settles (the audible effect of a decaying modulator), and gets a sine partner on the same note 2 ms late, panned to the other side of its role. Drums and noise are untouched. Pads open slowly. Each song has a level trim, since Undertone has no limiter.
- **Data, not code:** `AudioPatterns.songs` holds, per cue, the length of each section in cycles and one stream per voice (the part it plays in each section, or a rest). `MusicPart` gains the filter envelope fields, `nudge` and `mirror` (the partner's pan opposite its role in Enhanced, or the given side for a centred role). `GameAudio.setMusicStyle` restarts the running track on the other arrangement; a cue with no song plays as Classic, and if Undertone has no `arrange` the track plays as Classic.
- **Auto is Classic**, as for the effects (`MUSIC_VERSION_DEFAULT`).
- **Not included:** five original songs written in the lab (a funk, a groove and three on the ideas of Keen cues) have no cue to replace, so they are not in the game yet.

## Parked
These are designed but not started. Starting values are first guesses to tune by ear.

### 8c.4 Ducks under big effects
- The music dips under large effects so they read clearly: `thoom`, `zzzap` and `krunch` (depth 0.55, hold 0.15 s, release 0.5 s), `stinger` (0.5, 1.0 s, 0.8 s), `win` and `life` (0.65, 0.4 s, 0.6 s), `hurt` (0.6, 0.3 s, 0.6 s), each with a 0.02 s attack.
- A new duck starts from where the running one is and never goes shallower than one already in progress; under dialogue the gains multiply (0.7 × 0.55 = 0.385).
- Risk: pumping, which only listening can judge. A duck table in the episode's audio patterns (`duck`) keeps the data out of the engine.

### 8c.5 Night mode and Mono
- **Night mode:** a heavier master chain for quiet rooms: compressor −28 dB, knee 8, ratio 4, attack 4 ms, release 250 ms; limiter −4 dB; low shelf −1 dB; trim cancelled for the compressor's own make-up gain, then +2 dB.
- **Mono:** a fold-down to one channel for single-sided hearing or a single speaker. A centred sound keeps its level; a sound panned to 0.6 drops to about 0.89.
- Both are rows on the Sound screen, disabled in Classic (Classic is already effectively centred).

### 8c.6 Variation
- Small random pitch and level changes so repeated sounds do not repeat exactly: ±25 cents and ±1 dB by default, more for `crunch` and `plink` (±60 cents, ±2 dB), less for `jump` (±15 cents). Menu sounds and music never vary.
- Undertone 0.2 has no random or detune controls, so the episode builds four versions of each effect with offsets from a seeded generator (the same on every device), and each play draws from a shuffle bag that never repeats a version back to back. Pitched voices scale the note frequency; noise voices scale their low-pass. The built-in fallback synth takes a ratio too.
- The audio generator is separate from the sim, so determinism is untouched.

### 8c.7 Voice cap and priorities
- At most 10 sounds at once on a coarse pointer and 20 elsewhere. Each sound's length is estimated from its envelopes; the same effect within 35 ms merges into one.
- Priority 3, never dropped: `menu`, `click`, `hurt`, `life`, `key`, `usb`, `win`, `thoom`, `zzzap`, `stinger`. Most others are priority 2, and `crunch` and `plink` are priority 1. Over the cap, a new sound is dropped if its priority is no higher than the lowest one playing (Undertone gives no handle to stop a voice early).

### 8c.9 Music crossfades
- Smooth transitions between the title, levels and the boss: the old track fades out over 0.8 s while the new one fades in over 0.3 s (0.4 s into the boss). Two loops are alive at once, so this costs CPU.

### 8c.10 Ambient beds
- A quiet loop per room (wind, drips, machinery hum) into the effects bus, with occasional drips and sparks at random pans from the audio generator. Some could be positional emitters, such as lava or a generator, if the sim exports `ambient_points(level)` as a pure read. Risks: battery, and mud on phone speakers.

### 8c.11 Adaptive music and stingers
- Music layers that fade in with intensity: enemies near, low health or a boss phase. Needs new music written (`MusicPart.layer`), a second loop in Enhanced (Classic filters the layered parts out, which the oracle proves), and one new read-only sim value, `State.THREAT`, the number of awake hostile entities within 10 tiles of Ben, smoothed in TypeScript (attack 0.5 s, release 3 s, and a boss forces full intensity). Reading it must leave the world snapshot and tick unchanged. Short stingers on pickups and level clears would join it.

## Deferred or dropped
- **Directional sound captions:** the game already has onomatopoeia captions; a direction cue joins the accessibility pass (slice 9). It is visual, so it also applies in Classic.
- **Binaural headphone mode:** a head-related panner per voice costs too much on phones, so it would be a desktop opt-in later. True 5.1 or 7.1 surround is out: browsers rarely output more than two channels.
- **Bluetooth latency calibration:** dropped. The game cannot delay its pictures, so the debug panel would only report the audio output latency.

## Decisions made
- Enhanced is the default; `?audio=classic` forces Classic until the Options row lands.
- The audio settings live on their own Options > Sound screen, with Music and Effects moved into it, and the stored choice is Auto, Classic or Enhanced, so the default can change later without pinning anyone.
- Muffle, ducks and rooms are Enhanced only. Rooms are always on in Enhanced, with no separate row.
- Menu sounds never vary; game effects vary by about ±25 cents.
