# Audio Credits

Wilderfolk uses royalty-free music and sound effects from [OpenGameArt.org](https://opengameart.org). Files live under `public/audio/`. Track paths are defined in `src/audio/tracks.ts`.

*Last verified: July 2026 · Early Alpha **v0.4.2 shipped** · see [README.md](README.md) and [../TECHNICAL.md](../TECHNICAL.md) for build/audio bootstrap notes.*

If a sample fails to load, the game falls back to procedural Web Audio tones (`src/audio/introMusic.ts`, `src/audio/backgroundMusic.ts`).

## Music

| In-game file | Original title | Author | License | Source |
|---|---|---|---|---|
| `music/intro-frontier.mp3` | Settlement of the Frontier (Full) | [TAD](https://opengameart.org/users/tad) (Tad Miller) | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) | https://opengameart.org/content/settlement-of-the-frontier-full |
| `music/day-village-loop.mp3` | Abeth (*Peaceful village loop*) | [elerya](https://opengameart.org/users/elerya) (Audibert jd · *Eleryan Tales volume 1*) | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | https://opengameart.org/content/peaceful-village-loop |
| `music/night-calm.ogg` | Slow Stride Loop | [isaiah658](https://opengameart.org/users/isaiah658) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | https://opengameart.org/content/slow-stride |

## Ambient & sound effects

| In-game file | Original title | Author | License | Source |
|---|---|---|---|---|
| `ambient/birds-loop.ogg` | Ambient Bird Sounds | [isaiah658](https://opengameart.org/users/isaiah658) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | https://opengameart.org/content/ambient-bird-sounds |
| `ambient/bird-chirp.mp3` | Bird chirping sounds | [syncopika](https://opengameart.org/users/syncopika) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | https://opengameart.org/content/bird-chirping-sounds |
| `ambient/cricket-frog-night.mp3` | Ambient Bird, Cricket and Frog (`ambprev.mp3`, from *Yo Frankie!*) | [Blender Foundation](http://apricot.blender.org) (submitted by [Lamoot](https://opengameart.org/users/lamoot)) | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) | https://opengameart.org/content/ambient-bird-cricket-and-frog |
| `ambient/wolf-howl.mp3` | Wolf Monster Sound | [CaveboyTup](https://opengameart.org/users/caveboytup) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | https://opengameart.org/content/wolf-monster-sound |
| `ambient/animals/*.wav` | Animal or beast sounds pack | [pauliuw](https://opengameart.org/users/pauliuw) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | https://opengameart.org/content/animal-or-beast-sounds |

The archive `ambient/beast_or_animal.7z` is the upstream pack; in-game clips are taken from the extracted `Growl` and `Voice` WAV files.

## Attribution (CC-BY tracks)

When distributing or publishing Wilderfolk, include credit for CC-BY assets. Suggested wording:

> **Music:** "Settlement of the Frontier (Full)" by Tad Miller (CC-BY 4.0); "Abeth" by Audibert jd / Eleryan Tales (CC-BY 3.0).  
> **Sound:** Ambient bird/cricket/frog audio from the Blender Foundation / *Yo Frankie!* project (CC-BY 3.0).

CC0 assets do not require attribution, though the authors above appreciate credit when you can give it.

## License summary

| License | Tracks |
|---|---|
| CC-BY 4.0 | Intro music |
| CC-BY 3.0 | Day village loop, night cricket/frog ambient |
| CC0 | Night music, birds, wolf howl, beast growls/voices |