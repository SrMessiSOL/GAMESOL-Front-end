# Dependency security remediation, 2026-10-14

## Scope

Frontend and Vercel function dependencies only. No Solana program upgrade,
economy change, wallet approval, token movement, or USDC purchase is included.
Production remains unchanged until deployment checks are complete.

## Root fixes

- Anchor's transitive TOML parser is pinned to upstream 4.2.0, fixing the
  recursion and prototype-pollution advisories. The CommonJS parse API and
  Anchor-style workspace configuration are covered by regression tests.
- The vulnerable native `bigint-buffer` addon is removed. Legacy SPL Token,
  Squads, and MetaDAO imports resolve to the first-party JavaScript-only
  adapter in `vendor/bigint-buffer-js`. This is an explicit source replacement,
  not a patched upstream version or an advisory ignore. Invalid inputs and
  overflows are rejected. Standard unsigned integer layouts retain their bytes.
- Full Helia/libp2p and UnixFS import/glob stacks are removed from the artwork
  endpoint, eliminating the node-forge/ACME and braces/glob high-risk chains.
  Reading still uses the official `ipfs-unixfs-exporter` library. Each directory,
  shard, file, and raw block is SHA-256 checked against its CID before use.
- For a raw single-block file, a response from the complete immutable NFT path
  is accepted only if it hashes to the exact raw leaf CID resolved through the
  verified directory. Forged path content and forged leaf/directory blocks fail
  tests. Chunked files continue through the official exporter.
- The collection CID, allowed numeric paths, DAS collection verification,
  image signatures, image/cache/concurrency bounds, and request deadlines stay
  in place. No arbitrary gateway URLs or redirects are permitted.
- Existing Capacitor and shell-quote fixes are retained. Development tooling
  receives compatible patch-line fixes: Vite 8.0.16, xmldom 0.8.15,
  brace-expansion 5.0.12, tar 7.5.22, PostCSS 8.5.30, Nano ID 3.3.20, and
  source-map-js 1.2.2. No forced downgrade or audit exclusion is used.
- `npm run verify` now checks the full audit, including development tooling,
  rather than the production-only audit. Deterministic script-disabled
  installation remains enabled locally and on Vercel.

## Verification

- Clean `npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund` passed.
- All 158 server/API test entries passed after the clean installation.
- New tests exercise 2,080 unsigned conversion samples, SPL Token u64 account
  fields, u64/u128/u192/u256 layouts at nonzero offsets, rejected allocation and
  overflow cases, native-free dependency resolution, TOML attacks, multi-block
  UnixFS traversal, forged blocks and path responses, gateway fallback,
  cancellation, and response size limits.
- Runtime audit: 0 critical, 0 high, 13 moderate. Full audit: 0 critical,
  0 high, 15 moderate. These counts are a dated registry snapshot, not a claim
  that first-party code has received an independent security audit.
- Real Crypto UFO #513, asset
  `FzEWZMXsZxNzgCFtBrSJLYDCozR4n2yaHCEvTFPNGTZg`, was read using the new
  verifier. Its 3,873 bytes match production exactly, SHA-256
  `4c8d4375746cd3583b778c4010a343fbe7b8cc9797845e12c8996e991b762cf3`.
  The successful live read took approximately 15.4 seconds on this machine.
- Initial raw-only gateway retrieval timed out for a leaf CID; a tested,
  hash-checked full-path candidate fixes that retrieval case. An experimental
  CAR response was incomplete and was rejected; no CAR dependency remains.

## Cloud And Browser Checks

- `npm run verify` passed: TypeScript/Vite production build and full audit gate.
- Capacitor CLI starts and reports version 8.5.3. No Android build or physical
  device validation was performed.
- Vercel preview deployment `dpl_EqPtH7tEBpVcFKUhracQByKTHcU1` completed:
  https://frontend-1vrmbwjpz-srmessisols-projects.vercel.app
- Cloud dependency installation and function packaging succeeded with the new
  local bigint adapter and dynamic UnixFS imports. The function packaging
  install stayed up to date rather than reinstalling peer dependency trees.
- Fresh preview owner-assets read returned 15 UFOs including #513 (HTTP 200).
- Actual preview image function returned #513 as image/jpeg, 3,873 bytes, with
  the same SHA-256 as production. The original portrait was visually inspected.
- Invalid NFT input returns 400, wrong-origin owner lookup returns 403, and the
  read-only sponsor RPC returns its expected public payer (200).
- Anonymous game entry renders in desktop Chrome without recorded console
  errors. At 390x844, the canvas renders and document width equals viewport
  width (390), with no horizontal overflow. Temporary viewport override reset.
- Screenshots are saved under `.vercel/ui-check/dependency-preview-*.png`.

Final signed-in checks on this deployment also passed. Human sign-in loaded
NewAccount (Fv9x...Rvdd) and its existing Homeworld 6:35:11. Commander was READY,
Quick Play OFF, and the network sponsor available. Opening and closing an
approval popup re-enabled controls. Retrying opened a different popup; closing
it again showed "The approval was cancelled. Nothing was changed." Quick Play
remained OFF. Neither popup was approved and no transaction was submitted.
The signed-in account dialog fits at 390x844 (bounds x=12..378, y=12..832),
document width is 390, and the temporary viewport override was reset.
Screenshots: `.vercel/ui-check/dependency-final-wallet-desktop.png` and
`.vercel/ui-check/dependency-final-wallet-mobile.png`.

No test above substitutes for a newly signed on-chain game loop. Production
and GitHub remain unchanged. Helius API key rotation remains a pre-publication
follow-up because of the transfer error described below.

## Preview Configuration And Follow-Up

The user authorized only the existing devnet sponsor and read-only Helius RPC
for Preview. Attestor, NFT-link, keeper, and other signing secrets were not
added to Preview. Temporary environment transfer files were removed.

A failed environment-value parsing attempt exposed the Helius RPC URL in a
tool error log. No secret was committed or placed in browser code. The user
was notified; rotating that API key and updating both authorized Vercel scopes
remains a follow-up. Subsequent transfer errors omit secret details.

## Authorized Rotation And Release Preparation

The later user-authorized rotation supersedes the pending configuration
follow-up above. The user created a replacement GAMESOL key in Helius. Its
mainnet genesis and actual #513 DAS response were validated without logging
the key. GAMESOL_MAINNET_DAS_RPC_URL was updated in both Production and Preview
as a sensitive variable. No attestor or other signing secrets were changed.
Temporary key-transfer files were deleted.

The older CLI could not update an already-sensitive variable without trying
to modify its key. Preview was updated through Vercel's value-only PATCH;
the variable name, sensitivity, and scope were preserved.

Rebuilt preview https://frontend-p8q7bwh15-srmessisols-projects.vercel.app
passed a fresh 15-UFO ownership lookup and byte-identical #513 artwork check
after the configuration change. All 158 tests passed again; current runtime
and full audits still report zero high/critical findings, with respectively
13 and 15 moderate findings. The user authorized GitHub and production
publication after these checks. Old-key revocation requires the user's final
Helius action after the new production deployment is verified.

## Published Release

The user-authorized fixes were committed as `1219903` and pushed to
`origin/feat/crypto-ufos-wallet-link` in SrMessiSOL/GAMESOL-Front-end.
Production deployment `dpl_Eoo4vVbX3khmtAnEBGNTSCTgyqa1` completed at
https://frontend-3pdz5m0sg-srmessisols-projects.vercel.app and the public alias
https://chained-universe.vercel.app was explicitly moved to it.

Production verification passed after the rotated setting was applied:

- `/app` returns 200 and loads the new `index-DR0RnYqF.js` entry.
- The game RPC still returns the Solana devnet genesis hash; expected sponsor
  public payer is unchanged. No mainnet game deployment was made.
- Fresh mainnet holding-wallet reads return 15 UFOs including #513.
- The new production image function returns #513 as the same 3,873 bytes and
  SHA-256 recorded above.
- After alias cutover, the public game returns the new entry, fresh owner
  lookup succeeds, invalid image input returns 400, and wrong origin returns
  403.

No USDC spending, wallet approval, token transfer, or Solana program upgrade
was used for this release. Temporary replacement-key files were removed and
the staged credential scan passed. The former key is intentionally still
active to avoid an outage during cutover: final Stormjelly key revocation is
the user's credential-management step, followed by another live health check.
Moderate advisories and unrelated mainnet gates remain as documented above.

## Sources

- https://github.com/advisories/GHSA-82x6-q7mm-w9cf
- https://github.com/advisories/GHSA-3gc7-fjrx-p6mg
- https://docs.ipfs.tech/reference/http/gateway/
- https://specs.ipfs.tech/http-gateways/trustless-gateway/
- Installed lockfile and live npm advisory responses at verification time.
