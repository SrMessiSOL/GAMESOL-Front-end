# Crypto UFOs holding-wallet reader

The game account remains the LazorKit devnet vault. The NFT reader connects an
independent Wallet Standard wallet such as Solflare and reads its public mainnet
holdings. It does not call message signing, transaction signing or the LazorKit
portal. NFT browsing does not require a game account to be signed in.

## Configuration

Set `GAMESOL_MAINNET_DAS_RPC_URL` to a mainnet Helius DAS RPC URL in the Vercel
`frontend` project. This value is server-only; never use a `VITE_` prefix.
Read-only `owner-assets` and `collection` actions do not require a link secret.
Legacy signed-link API actions retain their original two-signature verification
and signing secret; the current frontend no longer calls those actions.
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
connect a holding wallet and select an owned cNFT as a cosmetic flagship identity.
The game account menu uses its actual artwork. No stats or rewards change.
Ownership is checked on assignment, refresh, focus and every visible minute.
Failures remove active holder identity. Wallet account changes and disconnects
clear the previous wallet's assets and selected identity.

The browser remembers only the wallet name and cosmetic selection. Returning
to the game uses Wallet Standard silent connect; the owner address comes from
the wallet, never from browser storage. Selection is checked against fresh DAS
holdings before it is restored. Disconnecting the NFT reader leaves LazorKit and
the wallet extension unchanged. This is not an authenticated permanent account
link. `identityVerified` is explicitly false; never award economic benefits from
this reader's response.

## Validation

`npm run test:nfts` checks the direct connection makes no signing calls, supports
silent reconnect, and reads holdings without a commander, passkey or secret.
It also retains legacy signature tests and ownership/collection checks.
A real Solflare-extension connection rehearsal is still required.
Test Phantom, Solflare and Jupiter separately in their actual environments.
