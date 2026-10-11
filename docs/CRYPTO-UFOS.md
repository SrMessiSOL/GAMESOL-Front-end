# Crypto UFOs wallet linking

The game account remains the LazorKit devnet vault. An independent mainnet
Wallet Standard account signs a domain-bound message identifying that vault.
The game passkey approves the same challenge. The server verifies Ed25519 and
WebAuthn P-256 signatures, including the registered devnet authority account.
Neither approval transfers assets or authorizes a game transaction.

## Configuration

Set `GAMESOL_MAINNET_DAS_RPC_URL` to a mainnet Helius DAS RPC URL in the Vercel
`frontend` project. This value is server-only; never use a `VITE_` prefix.
Set `GAMESOL_NFT_LINK_SECRET` to a random secret of at least 32 characters.
The existing `CRON_SECRET` is accepted as a fallback with a derived purpose key.
Local development can use an ignored `.env.nft.server.local` file.

The provider's mainnet genesis hash is verified before any NFT queries.
The collection address currently comes from the original Crypto UFOs game:
`53UVubjHQpC4RmUnDGU1PV3f2bYFk6GcWb3SgtYFMHTb`.
Mainnet DAS has confirmed this grouping with Crypto UFOs compressed assets,
names, traits and IPFS artwork metadata. The collection's image gateway can
return HTTP 403; unavailable artwork is shown honestly, with the actual original
image attempted after the provider CDN fails. No substitute art is used.

## First scope

`/founders` displays actual DAS collection metadata and artwork. Players can
link a holding wallet and select an owned cNFT as a cosmetic flagship identity.
The game account menu uses its actual artwork. No stats or rewards change.
Ownership is checked on assignment, refresh, focus and every visible minute.
Failures remove active holder identity. Link receipts expire after seven days.

Receipts are HMAC-signed and stored on this device, not in a central database.
Link again on another device. Unlink removes this device's receipt only; it is
not global revocation. This cosmetic implementation does not enforce a globally
unique NFT-to-commander binding and must not be used to award economic benefits.

## Validation

`npm run test:nfts` covers receipt tampering, expiry, domain/purpose separation,
both signature algorithms, current collection ownership and sold-NFT clearing.
A real external-wallet plus real LazorKit passkey rehearsal is still required.
Test Phantom, Solflare and Jupiter separately in their actual environments.
