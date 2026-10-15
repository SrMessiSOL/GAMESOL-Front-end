# Persistent commander avatar integration

Status: real devnet avatar save and independent-origin restoration verified;
172 regression tests and the final cloud build passed. Publication is in progress.

## Behavior

- The active game binds its GameClient and commander to the NFT provider.
- On login, the provider reads the program-owned commander_identity PDA and
  fetches current collection ownership and real artwork. No wallet signature
  or gameplay transaction is requested just to restore the portrait.
- Browser selection storage is no longer read or written. The saved holding
  wallet adapter name is only a connection preference, not avatar identity.
- Save commander requests a distinct holding-wallet ownership message, obtains
  a short-lived commander-domain proof, submits the bounded session transaction,
  and reads back the independent on-chain nonce and selection before adoption.
- Removal requires the game commander, not NFT-holder authorization. The on-chain
  account remains allocated and its nonce advances, so old proofs stay invalid.
- Failed saves preserve the last confirmed selection. Submitted-but-unavailable
  status explicitly asks for refresh rather than automatically resubmitting.
- A disconnected holder can retain its saved portrait but cannot authorize NFT
  utility. A confirmed ownership change removes the ineligible portrait.
- Expedition proof domains, loadouts, loot and cooldowns stay independent.

## Verification

- Local production build passed; existing chunk-size warnings remain.
- 172 frontend/server tests passed with test concurrency 1.
- Added coverage: absent browser storage, clear/reselect, clear in another browser,
  failed saves, wrong cluster, wrong commander/program/account layout, wallet
  switch while signing, duplicate clicks, action-domain separation, canonical
  Quick Play classification, and real Lazor transaction packet size.
- Program-side Rust/SBF/validator evidence is recorded in the backend release
  checkout's COMMANDER-UPGRADE.md; this integration does not upgrade that program.

## Staging Gate

Final tested build: https://frontend-qibius5mw-srmessisols-projects.vercel.app
Deployment: dpl_9fkxsHA9ZErDrQ7nyLXBdHdMvTNa, verified READY with devnet
ownership verification enabled after the connection-recovery change.

Initial preview: https://frontend-gfodbppqx-srmessisols-projects.vercel.app/app

Verification-enabled preview:
https://frontend-q4os6qdz3-srmessisols-projects.vercel.app/app

After explicit user approval, the existing GAMESOL_UFO_ATTESTOR_KEY and
GAMESOL_NFT_LINK_SECRET were added as sensitive Preview-only settings. The local
attestor public key matched the enabled devnet configuration before configuration.
The rebuilt Preview reports enabled:true, network:devnet, storage:on-chain.
Production settings and deployment were not changed.
No secret values belong in this document or in frontend VITE variables.

Read-only Preview checks found 15 currently owned UFOs for BTwMe...1BaHG and the
real Crypto UFO #513 JPEG (3,873 bytes), SHA256:
4c8d4375746cd3583b778c4010a343fbe7b8cc9797845e12c8996e991b762cf3.

The initial preview signed in as the original G6tR...7s6r commander and did not
connect an NFT wallet or save an avatar. It subsequently restored #513 from
the new on-chain record. The verification-enabled Preview initially signed in as
NewAccount (Fv9x...Rvdd); it was signed out before any save or game transaction.
The user subsequently signed in with the original account and activated Quick Play.

## Real Save And Restore Evidence

- Commander identity PDA: J4hNcR3AkQSqDVffg9Z9DmRLQsHWzS4R4ZTE4RkgJNS2.
- Finalized transaction:
  5Qsm1h9BXzRzsWXnkxa4LRWYi7CJPDxTAfFV6b65Habm5K6yfgjzm7Vqm6D1f495YQvv3gtsGtbQpxgnCr9XMGPi.
- Owner program: J6rNikvM7XLs6REtbbhMhe8NVd6Nfqa1C7PDfgHSDFkq.
- Commander: G6tRKz9XQpL5eFPnV3aqz3nJXhy8DQkUAfaz7aL27s6r; nonce: 1.
- Holding wallet: BTwMeqRYsnME4jpLFWgCePmBQzPYpciCb19o4gw1BaHG.
- Asset: FzEWZMXsZxNzgCFtBrSJLYDCozR4n2yaHCEvTFPNGTZg (Crypto UFO #513).
- Transaction succeeded with zero pre/post token-balance entries. Account UI
  retained 11.5 test USDC. No USDC purchase, expedition or NFT transfer occurred.
- Existing UFO expedition loadout hash remained unchanged:
  a3cd7c3acd249398c9a520be2dc7ba7f62ce257c9395c0ba706dbdb0f575972f.
- Independent staging origin restored the portrait and Saved on-chain state
  without an NFT-wallet connection or avatar preference stored there. This was
  a separate storage origin in the same Chrome browser, not a physical second
  browser/device test.
- Desktop portrait loaded at its real 256px resolution. Mobile 390x844 had no
  horizontal overflow; modal scrolling reached Saved on-chain and Remove avatar.
- Screenshots are stored locally under .vercel/ui-check/commander-513-*.

## Connection Recovery

The initial Solflare connect promise stalled after user approval. Reloading the
same staging page preserved game sign-in and Quick Play; reconnecting then read
the correct holder's 15 UFOs without another game authorization. The connection
helper now accepts approved standard account events, cleans up listeners, and
releases the UI after a 60-second deadline. Late completions cannot revive a
timed-out request. Regression tests cover these cases before publication.
