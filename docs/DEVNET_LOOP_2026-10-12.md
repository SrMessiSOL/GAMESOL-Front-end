# Devnet Gameplay Acceptance

## Sign-In Recovery

The installed LazorKit wallet SDK is pinned to 2.1.0. Its popup-close monitor clears the popup reference without rejecting the pending connection; its connection timeout rejects after 60 seconds. GAMESOL now detects popup closure through the public popup accessor and emits the SDK error event, preserving its own connection cleanup. Blocked popup and timeout errors have actionable messages. No stored wallets, passkeys, credentials, program IDs or protocol versions were changed.

Five deterministic tests cover success, closed/removed popup, blocked popup and timeout. These tests validate recovery behavior, not a physical passkey ceremony. Existing key-format compatibility and account discovery remain unchanged.

## Actual Browser Evidence

- The embedded-browser connection returned the SDK's 60-second timeout rather than remaining permanently pending.
- Chrome restored an existing Lazor account and its Homeworld at 9:427:13.
- The selected real commander portrait, Crypto UFO #513, was restored.
- A scene-loading timeout appeared while rendering the restored system; Retry reloaded the account. Subsequent planet-navigation automation became unresponsive. This does not establish whether the cause is the game, rendering load or browser automation.
- No wallet was disconnected, no credentials were cleared and no signed game transaction was submitted.

Follow-up: Homeworld eventually rendered its command UI with Metal 121, Crystal 407, Deuterium 147 and the selected UFO portrait, while the transition error remained visible. The transition reducer now accepts the same scene's renderer readiness after a timeout, then reveals normally. It still ignores stale scene IDs and never reveals on a timer alone. A regression test covers this recovery. Actual signed orders remain untested.

Final release check: all 34 tests and the Vercel production build passed. Chrome restored the account after reloading the new release. Both the system and Homeworld ultimately revealed without a stuck error overlay. The live Crystal Mine command showed level 1 to 2, cost 72 metal / 36 crystal, requirements met and a free construction slot. Its screenshot was captured and the Chrome tab retained for the player to submit the first test order. No submission was made by the agent; fresh passkey sign-in and popup cancellation remain unit-tested rather than physically verified.

## Remaining Required Evidence

Quick Play follow-up: the player authorized the agent to start activation. The Lazor portal opened and returned; the account menu reported Quick Play ON and sponsored fees. Retrying Crystal Mine still failed locally with "Quick Play is off. Turn it on with your passkey first." No upgrade was applied. Code inspection found that an older background session refresh could overwrite a newly activated/revoked session after awaiting RPC. Refresh now checks the current stored snapshot before writing, re-reads a changed session with bounded retries, and rejects account changes. Three regression tests cover activation, revocation and account switching. Live retry after deployment remains required.

Player submitted the first Crystal Mine test order after handoff. The live operation dialog reported "Quick Play is no longer active for this device. Nothing was changed." Crystal Mine remained level 1. The loop therefore has no successful signed upgrade yet; the player must explicitly re-enable their gameplay session before retrying. Do not count the click as a confirmed transaction.

The full loop is NOT passed. Complete these stages in the player's normal Chrome session, recording devnet signatures and confirmed on-chain state changes:

1. Complete Lazor sign-in; cancel and retry once to verify recovery.
2. Open existing Homeworld and return to its system without a scene timeout.
3. Start one affordable mine upgrade; wait for readiness and finish it; verify the new level.
4. Start and finish one available research project; verify its level.
5. Build one affordable ship and finish production; verify inventory.
6. Launch a valid mission; resolve outbound and return stages; verify fleet/resources.
7. Refresh and reconnect; verify world state and selected UFO portrait persist.

Do not fund an account, enable a new spending session, use ANTIMATTER acceleration or execute purchases merely to shorten the test. Those actions need the player's explicit approval. Normal devnet gameplay also stops at any passkey or transaction approval requiring the player.
