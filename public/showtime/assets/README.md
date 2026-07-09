# Showtime animation assets

These are the **curated professional Lottie animations** the Showtime stage plays.
They are real motion-designer assets, not code-generated — that is where the quality
comes from. The runtime player is [`components/showtime/AssetLayer.tsx`](../../../components/showtime/AssetLayer.tsx)
and the tier → show mapping is [`lib/showtime/assets.ts`](../../../lib/showtime/assets.ts).

Each gift tier plays a "show" (one or more assets, choreographed with delays). Bigger
gifts layer more of them into one moment — the legendary show stacks all four.

| file             | used by             | what it is                    | source (LottieFiles free) |
|------------------|---------------------|-------------------------------|---------------------------|
| `hearts.json`    | tier 1, and t4 stack | floating pink hearts          | assets-v2.lottiefiles.com/a/0de50f84-1173-11ee-… |
| `confetti.json`  | tier 2, and t4 stack | colourful confetti fall       | assets-v2.lottiefiles.com/a/43a77aa6-1166-11ee-… |
| `popper.json`    | tier 3, and t4 stack | party popper burst            | assets-v2.lottiefiles.com/a/3f0bb824-117d-11ee-… |
| `streamers.json` | t4 stack             | streamers + confetti          | assets-v2.lottiefiles.com/a/0650dfca-1185-11ee-… |

## How these were chosen
- Downloaded as `.lottie` (dotLottie), unzipped, and the raw animation JSON extracted
  so the runtime stays pure-JS (`lottie-web`, canvas renderer) with no WASM — reliable
  inside OBS. A candidate pool of ~50 was rendered and evaluated **visually** before
  picking (file size / layer count proved to be useless quality proxies).
- Any full-frame opaque background solid layer is stripped so animations composite
  transparently over the stage / greenscreen.

## Licensing
These are LottieFiles *free* animations, used here for a proof-of-concept. Before broad
production use, verify each asset's license on LottieFiles (most are the Lottie Simple
License — free incl. commercial), or replace with commissioned, on-brand assets for the
signature gifts (Lion, Universe) — that commission is the path to a true cinematic tier.
