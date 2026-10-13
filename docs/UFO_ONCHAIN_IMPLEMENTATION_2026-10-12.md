# UFO utility implementation and release boundary

This implementation uses on-chain accounts for progress, cooldowns, booster consumption, loot, and equipment. No Redis/database or browser-stored reward inventory is used.

- Missions are in the actual planet Missions panel. Silver, Blue, Red, Green, Gold and Pink Body traits select equal-budget doctrines and one hazard-recovery booster per mission. Eyes select the route; Body, actual Accessory and Hair yield unique cosmetics. Rarity gives no power.
- One explicit holding-wallet signature authorizes short-lived ownership attestations for one commander and asset. There is no extra Lazor signature in the gallery, avatar selection or this utility verification. Game instructions still require the commander; active Quick Play can authorize them.
- The issuer rechecks exact mainnet collection ownership, compressed/unburned state and actual metadata before signing each privileged action. The game checks a configured Ed25519 signer, full domain-bound bytes, expiry and on-chain nonce. This is a trusted cross-network attestation, not trustless mainnet proof verification on devnet.
- The program enforces rolling 24-hour commander, holder and asset caps. A claim closes the completed mission atomically. Equipped cosmetics come from the earned on-chain inventory, not proposed trait items.
- Production issuer key configured as Sensitive after user approval. Public key: `9XEL6rVQ2GK85ic1j2Nf6kykybsAtsP8nYzNnNCMun4a`. Local key backup is ignored by Git and Vercel; no deployer key is uploaded.
- The frontend has 56 passing focused tests and a successful Vercel preview build. Preview: https://frontend-lkvtbbin4-srmessisols-projects.vercel.app . The public game alias is unchanged.

## Recovered Authority and Devnet Activation

Live devnet game ID: `FJGxh6SKgNoTVzHj98oBsC2oaEy8ovadVJf8rDUNaEHb`.
Game admin and upgrade authority: `5Gq1tU4eCbuWyR7TEknwdKsbTxk3H8W4SfkT8Nsbuzs`.
This is the authority-index-1 vault of Squads v3 multisig `D6UaXodCsKHt9QGwSpJAWrYUGnkPESM6semtumbi2WMH`. Its derivation and account ownership were verified. It is a 1-of-1 multisig with member `5LdLeYrc5zMsPV2sn7amFQwDbYSmvakxZPDmm5YZmPvR`, located in the user's Solflare wallet.

The authority transfer transaction `4SstmmUeYcQMwT4MTdvAuHeUP46iKqLxXPQxbF3BzkNSpBXJto211J1KrnUokQwAnNGyFEJEMRMrhRQPJawwTEdR` changed the authority from WSL wallet `EhT4UUmsHyd41bZSGzj1W72yu2EptHk8sEvnK7aaNuBu`. That keypair still exists at `/home/srmessi/.config/solana/id.json`, but cannot directly sign for the new authority. The existing known Squads multisig `HZiFUDSVcXVJGw8vvHkw9xwLBkTJubZf3HEL1wCxP5EM` does not derive this address at any supported vault index. The current game governance config PDA is absent.

The user signed the upgrade and activation proposals through the local Squads v3 approval helper. The deployed payload exactly matches backend commit `85c2440`'s tested CI artifact. The enabled UFO configuration holds the approved issuer public key. The game ID and upgrade authority remain unchanged. See `UFO_DEVNET_ACTIVATION_PROOF.md` for transaction evidence.

Host tests, SBF validation and isolated-validator execution are distinct from a devnet rehearsal with real NFT ownership and Lazor CPI. Program upgrade and issuer activation are now verified on devnet. The updated frontend/server rollout, real holding-wallet utility signature and player reward loop remain pending. Mainnet stays disabled.
