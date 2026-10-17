# Silent utility verification for already-linked UFO wallets

The initial ownership-verified on-chain commander identity is the durable link.
An additional holder signature is not necessary to recheck that link's NFT.

New `ufo-linked-verify` route validates the exact CommanderIdentity PDA, owner,
discriminator, commander, holding wallet, asset, verifiedAt and identity nonce.
It reads current mainnet DAS ownership and issues an expedition-purpose token
bound to this commander, asset, wallet, identity nonce, site and expiry. It does
not create/change a wallet link or authorize avatar changes. The program still
requires the commander's game transaction authorization to execute utility.

Every attestation revalidates the saved identity nonce and current NFT ownership.
Clearing/replacing identity, NFT transfer/burn/collection mismatch, expired token,
wrong origin and wrong account owner/discriminator fail closed.

Frontend utility verification calls this route without a holding-wallet signer.
The expedition screen automatically checks saved ownership when needed; manual
retry is labeled Check ownership rather than Verify UFO utility. Initial avatar
link creation/change remains ownership-verified; no arbitrary public address can
silently create a link. No mainnet game, authority change or program upgrade.

This change is staged on Preview and not yet published to production. Browser
verification is in progress after runtime recovery. Default's identity is now
saved as nonce 3 with asset FzEWZMXsZxNzgCFtBrSJLYDCozR4n2yaHCEvTFPNGTZg and
holder BTwMeqRYsnME4jpLFWgCePmBQzPYpciCb19o4gw1BaHG, verifiedAt 1792218922.
The finalized record was read directly from the program-owned 120-byte account.

Browser recovery succeeded. Preview exposed a clock-skew defect: a service clock
slightly ahead of the browser made fresh owner reads immediately ineligible.
UI freshness now starts at response receipt using the browser clock. Server
proof expiry and on-chain authorization checks remain unchanged. A regression
test checks that the fresh response works and still expires after two minutes.

Live Preview checks: Default Quick Play stays ON after refresh, tab closure and
the user's full Chrome restart. After the initial save, #513 restores on refresh
and tab reopen. Mission Control automatically reports Utility verified without
a new holder message, wallet popup or gameplay transaction. Desktop and 390x844
mobile layouts were inspected. No USDC or ANTIMATTER was spent.

The visual pass found a cached-image race: the image is complete but its loading
overlay persists after the mount effect resets it. NftImage now reconciles the
DOM image's complete/naturalWidth values when initializing its loading state.
Three regression cases cover cached success, pending images and failed images.

Verification: all 230 frontend/server tests and final TypeScript/Vite build
passed. Final Preview frontend-re43p3rtw-srmessisols-projects.vercel.app passed
desktop and 390x844 mobile checks: actual #513 image is 256x256, complete, with
no loading overlay and title Crypto UFO #513 (no expired label). After sign-in
on that fresh origin, the avatar and Utility verified state restored without a
Solflare connection or signature. Mobile refresh repeated both successfully.
Screenshots: avatar-final-desktop.png and avatar-final-mobile.png.

Published code: 410417b on feat/crypto-ufos-wallet-link. Production deployment
frontend-l23wbfpy4-srmessisols-projects.vercel.app is Ready and the public alias
chained-universe.vercel.app points to it. Both return HTTP 200 and the matching
entry /assets/index-CNMXKYO2.js (HTTP 200). Live utility is enabled; the linked
verification endpoint authorized the canonical saved commander without a holder
signature. Real #513 artwork returns image/jpeg, 3873 bytes, HTTP 200. Production
Chrome restored #513 and Mission Control reached Utility verified silently. Its
256x256 image was complete with no loading overlay or expired title. No tokens
were spent or game expeditions launched during these checks.
