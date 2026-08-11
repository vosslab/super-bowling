# Audio asset provenance

This directory contains compact browser-ready derivatives of individually verified
Creative Commons Zero (CC0) Freesound recordings. The author-provided original
downloads require a Freesound login, so each derivative starts from the official
high-quality preview URL exposed in that recording's official page HTML.

The local HTML snapshots and downloaded previews used for verification are
ignored implementation evidence in `_temp/20260811_audio_completion/cc0_assets/`.
They record the page title, author, preview URL, and CC0 statement as retrieved on
2026-08-11. CC0 permits copying, modification, distribution, and commercial use.
The provenance below is retained so future maintainers can re-audit the assets.

## Shipping derivatives

### bowling_impact_1.ogg

- Source page: [Bowling.wav](https://freesound.org/people/Rehanjo/sounds/593593/)
- Author: Rehanjo
- Official high-quality preview: `https://cdn.freesound.org/previews/593/593593_12589944-hq.mp3`
- Source title: Bowling.wav
- License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
- Downloaded preview SHA-256: `eb6e48cf5ecbeb7e495f79aa01411ea77f9c006883d6793be4733c84fa2f17a2`
- Derivative: trim 0.000-2.450 s; 250 ms end fade from 2.200 s; reduce level to
  89 percent; transcode to 48 kHz stereo Ogg Vorbis at quality 5.
- Shipping SHA-256: `3057d518fe0f2ae4d0415a8f78fce8ebd02bdd51e9c704da682e4ce6609403bd`

### bowling_pin_clatter_1.ogg

- Source page: [Bowling Pins FX.wav](https://freesound.org/people/Santi171/sounds/655944/)
- Author: Santi171
- Official high-quality preview: `https://cdn.freesound.org/previews/655/655944_13802401-hq.mp3`
- Source title: Bowling Pins FX.wav
- License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
- Downloaded preview SHA-256: `2f9793bcb5cd14346158626fa7d3e96f9fd5d3ab857efd3d6b33a767ccffbb9c`
- Derivative: trim 0.320-1.220 s; 15 ms start fade; 240 ms end fade from 0.660 s;
  reduce level to 89 percent; transcode to 48 kHz stereo Ogg Vorbis at quality 5.
- Shipping SHA-256: `56728e7bec19a9df201255c091176dda414c6545116a673aeb12ca35b3c88c76`

### bowling_roll_1.ogg

- Source page: [Bowlingball_Rolling.wav](https://freesound.org/people/drewsimko/sounds/682867/)
- Author: drewsimko
- Official high-quality preview: `https://cdn.freesound.org/previews/682/682867_14795335-hq.mp3`
- Source title: Bowlingball_Rolling.wav
- License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
- Downloaded preview SHA-256: `7ed6c62fa0b2a17a9df3657810b05fe0589746c35e2e165a7748f8d31402fb9a`
- Derivative: trim 0.140-0.640 s; 15 ms start fade; 200 ms end fade from 0.300 s;
  reduce level to 89 percent; transcode to 48 kHz stereo Ogg Vorbis at quality 5.
- Shipping SHA-256: `7697557cab77d80736c64263fb9f22e43d07d87d203631cca2c7ab9128ceb92c`

### pin_knock_1.ogg

- Source page: [Single bowling pin knock.mp3](https://freesound.org/people/Rvgerxini/sounds/499788/)
- Author: Rvgerxini
- Official high-quality preview: `https://cdn.freesound.org/previews/499/499788_9453283-hq.mp3`
- Source title: Single bowling pin knock.mp3
- License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
- Downloaded preview SHA-256: `25d2c43c3e8e5cb913b346b7435533df45ac321b5ed5db7e96112344f7d19b35`
- Derivative: trim 1.170-1.790 s; 10 ms start fade; 220 ms end fade from 0.400 s;
  reduce level to 89 percent; transcode to 48 kHz mono Ogg Vorbis at quality 5.
- Shipping SHA-256: `18eba621802721d364d3aadeed55c12330bb645d82d9bf464fab961f5783d90e`

### low_thump_1.ogg

- Source page: [Thump.wav](https://freesound.org/people/Harrisando/sounds/466351/)
- Author: Harrisando
- Official high-quality preview: `https://cdn.freesound.org/previews/466/466351_9855691-hq.mp3`
- Source title: Thump.wav
- License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
- Downloaded preview SHA-256: `54ef5fdc3d6df20e14e3f615441eccc6bc78d90ac9a9bd5ffa9a317b00a05497`
- Derivative: trim 0.360-0.820 s; 8 ms start fade; 120 ms end fade from 0.340 s;
  reduce level to 89 percent; transcode to 48 kHz stereo Ogg Vorbis at quality 5.
- Shipping SHA-256: `1a56edbc69b2cde5602ea76224c888936a7280b4e2433ff6edcdcf6785e1a819`

### ceramic_clack_1.ogg

- Source page: [Ceramic clack / glass hit](https://freesound.org/people/SamsterBirdies/sounds/745291/)
- Author: SamsterBirdies
- Official high-quality preview: `https://cdn.freesound.org/previews/745/745291_5487341-hq.mp3`
- Source title: Ceramic clack / glass hit
- License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
- Downloaded preview SHA-256: `326fb0f3b1cb9db48d3db9c6b6a0b5adbd93f6a0143c262b90f83f223b3a0b65`
- Derivative: trim 0.000-0.370 s; 120 ms end fade from 0.250 s; reduce level to
  89 percent; transcode to 48 kHz stereo Ogg Vorbis at quality 5.
- Shipping SHA-256: `f92cfeec2dcb90ba09d32230d483887a2e1888544ee7a2508cacc26d56034795`

## Technical inventory

All shipping files decode as Ogg Vorbis at 48 kHz. The library is 106,159 bytes
before Git storage overhead. The individual clips are deliberately short and
retain their recorded transient character for physics-timed layering in the game.
