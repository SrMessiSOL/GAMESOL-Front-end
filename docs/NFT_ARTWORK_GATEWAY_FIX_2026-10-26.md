# Commander Artwork Gateway Recovery

## Confirmed Cause

The saved commander was Crypto UFO #4672. Production ownership metadata returned
the correct collection image resource, but the image endpoint returned HTTP 503
after 29,442 ms. The prior IPFS reader could not retrieve a required directory
block: Pinata timed out and trustless-gateway returned HTTP 526. No TLS validation
was bypassed. This was artwork delivery, not a missing on-chain selection.

## Scoped Fix

Prefer the working Filebase public gateway for raw blocks and directory-path
candidates. Preserve Pinata and trustless-gateway fallback routes. All directory
and file blocks still require CID SHA-256 verification. Full-path candidate bytes
are accepted only when they match the raw leaf reached through the verified DAG.
Resource allowlists, HTTPS, redirect rejection, byte/read/deadline limits and
image magic-byte checks remain unchanged. No frontend, ownership, signing,
selection, provider credential or authority changes.

## Local Evidence

- Focused ownership, image-state and content-verification tests: 26 passed.
- Complete isolated frontend/server suite: 427 passed, zero failed/skipped;
  50,495.4199 ms.
- Real original artwork reconstructed through the repaired verified reader:

| NFT | JPEG bytes | SHA-256 |
| --- | ---: | --- |
| #4018 | 3298 | 0c78a0bd8fd6af29ddd9146eeaa8b3a10f88243c97ad918470757d1c23998d6d |
| #4016 | 3575 | dda74219ffcdbaf8d65be68469201995588e11eb61b8ced9143af8f0fe260ce7 |
| #513 | 3873 | 4c8d4375746cd3583b778c4010a343fbe7b8cc9797845e12c8996e991b762cf3 |
| #4672 | 3511 | 003f6f2d793eddd96ebeb33f5e92dcaa40938a110251e1d0d805bf047268be03 |

## Publication Gate

Preview build passed at https://gamesol-devnet-qa.vercel.app.
Authenticated refresh checks passed at 1440x900 and 390x844: saved #4672
restored with decoded 256x256 artwork, no unavailable message or horizontal
overflow. All 15 original images decoded in the desktop and mobile picker.
Screenshots are in docs/test-runs/nft-artwork-2026-10-26.
The Preview endpoint returned all four originals with matching hashes;
see docs/test-runs/nft-artwork-gateway-preview-2026-10-26.json.
No transactions, new wallet approvals, program deployments or
scheduled-automation changes.

## Production Result

Published fix commit: 41c3f4a on feat/crypto-ufos-wallet-link.
Production: https://frontend-rfyi61f89-srmessisols-projects.vercel.app.
Main alias: https://chained-universe.vercel.app.
Production build passed. Main-alias endpoint checks returned HTTP 200 and
matching original JPEG hashes for all four checked NFTs, in 252-957 ms.
Receipt: docs/test-runs/nft-artwork-gateway-production-2026-10-26.json.
Authenticated main-site refresh checks restored #4672 with decoded 256x256
artwork at actual DOM viewports 1440x900 and 390x845, no unavailable message
or horizontal overflow. Mobile height differs by one pixel from Preview due
to existing browser zoom; recorded dimensions are actual DOM measurements.
Production screenshots are in the same artwork evidence directory.
Scheduled automation remains paused and unchanged; no funds were spent.
