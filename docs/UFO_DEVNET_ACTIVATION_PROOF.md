# UFO devnet activation proof

User-controlled Solflare signing completed for the recovered Squads v3 multisig.
All six transactions were simulated before wallet approval. No member key was
exported or held by the local helper. No mainnet program changes were made.
All six recorded signatures were independently verified finalized with no
transaction errors. The local approval helper was stopped after completion.

## Transactions

- Upgrade proposal creation: `3A7KmSPyA9i3wZSFdFe1iCUaThAAeyRK7RTZ33HNq4FNC5HNoQAdfq4Vtb2yJN13v54aM54jnrjCsomXr5cF7jkp`.
- Upgrade approval: `pcc3C4AiQRn1Ns4BYwck1BHqPcbJQee3KP6UzA3nRcRGPWWVJj4UQptQbLWsRtbgxBX8ZvtXc64JoNTsu2M2Ssp`.
- Upgrade execution: `MPnRs6Nxe9iT42x2rmyA141oCAdBp12aGKvvvcrzGVyRqooiP6aAJAA2fHzQBXwPpBXZ9dc5k1q2kuAZbg9ZT17`.
- Activation proposal creation: `2V5D7RWC4mFS8jan2UF2HFvqsGefZLhRM4GcM3mcDMYBP2DYMa1wuCfTCua1tmjjYp2Mzbb5WtvgBePnWLAdMPHF`.
- Activation approval: `32gzZwJZEbGJJUmdHpjsAVb96ZePJ6JzGXdrvg8tzxd4ppbjuRwpG6ccHb8DXLCSuGYVBEPouhEnMiFShbNWfyNE`.
- Activation execution: `3u2fWbXCaVZYmZgiGheTjVEM6btgKfn2nsriMDZfAfJV37j4M9Pz1r7z3HJ9og5SR5gwVk9tVHJq3faF99ZVrU4c`.

## Verified on-chain

- Game program: `FJGxh6SKgNoTVzHj98oBsC2oaEy8ovadVJf8rDUNaEHb`.
- ProgramData payload exactly matches the CI binary from backend commit `85c2440`.
- Binary SHA-256: `73e565f2b42f3f78fbb2699e1597d7dabac864f38d7ec6f93a65a000b84747b7`.
- Upgrade authority remains `5Gq1tU4eCbuWyR7TEknwdKsbTxk3H8W4SfkT8Nsbuzs`.
- UFO config: `4tnGR9Y1jqypfpAnurixgDktRhxq9DHPUHrav2soHhjs`.
- Config owner and discriminator match the game; exact account size is 41 bytes.
- Enabled: `true`.
- Issuer: `9XEL6rVQ2GK85ic1j2Nf6kykybsAtsP8nYzNnNCMun4a`.
- The staging buffer is closed after upgrade execution.

This proves deployment and configuration, not a complete real-player reward
loop. The updated frontend/server rollout, real holder eligibility signature,
Lazor CPI rehearsal, expedition, claim, and earned cosmetic equipment remain
separate verification steps. The public frontend alias was not changed here.
