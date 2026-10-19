# Store and quest edge cases - October 19, 2026

## Outcome

29 unsigned devnet rehearsals passed at slot 512874831: eight allowed and
21 rejected. All referenced account data, owners and lamports stayed unchanged.
One earned monthly reward was subsequently claimed live and verified finalized.
No USDC or ANTIMATTER spending, purchase, acceleration, program/authority change
or mainnet write occurred. The live claim fee was sponsored. No release needed:
this pass changes only local test scripts, reports and the readiness checklist.

## Deployed Store Checks

- Eligible daily and weekly packs succeed in simulation, including virtual SPL
  payment and resource credit. This is NOT new signed purchase/settlement proof.
- Same pack twice rejects StorePackAlreadyPurchased for daily and weekly periods.
- Daily and weekly copies of the same pack ID can coexist: independent periods.
- A small pack fits the same commander's colony, but purchasing it again there
  in the same bundle rejects: the limit follows the commander, not the planet.
- Monthly metal, crystal and deuterium deliveries reject ResourceCapExceeded.
- Invalid raw period/ID and shield packs in all three periods reject.
- Other-commanders' delivery destinations reject Unauthorized.
- Redirected treasury rejects InvalidUsdcAccount; substituted AM mint rejects
  InvalidUsdcMint; treasury-as-buyer-source rejects ConstraintTokenOwner.
- Starting weekly purchase mask was 31 in old epoch 2963. A weekly pack 0
  simulation succeeds in the new epoch, verifying catch-up synchronization.
  This was NOT an observed live Monday/midnight transition or monthly reset.

## Deployed Quest Checks

- An eligible unclaimed tutorial can succeed; duplicate claims in one bundle
  reject QuestAlreadyClaimed, including a switch to another owned planet.
- Monthly quest 1 rejects WrongQuestRewardPlanet on Default's colony, but was
  allowed on its bound Homeworld before the live claim below.
- A nine-pack virtual fill is valid on its own. Appending a monthly reward
  rejects ResourceCapExceeded specifically at ClaimQuestVault, not at a pack.
- One tutorial reward still fits after that virtual fill; a second distinct
  tutorial reward overflows and rejects at ClaimQuestVault.
- These are unsigned atomic-bundle simulations. No claims, virtual payments,
  rents or resource credits from these rehearsals were submitted or persisted.
  This does not close signed rollback, wallet-authentication or live race gates.

## Signed Monthly Claim

Already-completed monthly quest 1, "Spend 5000 ANTIMATTER," was claimed once
on Default Homeworld 9:427:13. No new AM spend was needed for its completion.

- Reward: 45,000 metal, 35,000 crystal, 10,000 deuterium.
- Signature: `d7atYUrpPsCW7ANqPNj4ecTc3dh5GfTnNCZwQuyx5DnkMUmrdgzZ3pBxvwzAoKBySjSHKXAmDxfwH1cqA5hdVrX`.
- Finalized transaction slot 512875199; account checkpoint 512875361.
- Monthly claim mask 260 -> 262 (bit 1 set).
- Homeworld after: 79,170 metal / 73,362 crystal / 26,091 deuterium; includes
  normal accrued production settled with the reward.
- Colony stayed 75 / 43 / 27. Colony Ship remains 1; no active missions.
- Receipt contains ClaimQuestVault. Fee 10,000 lamports paid by existing sponsor.
- UI shows CLAIMED; the next 16,000-deuterium reward became storage-blocked
  immediately after delivery. No invalid follow-up signature was requested.
- Eight subsequent unsigned quest guards passed at slot 512875515, including
  replay of this finalized claim -> QuestAlreadyClaimed.

## Browser Checks

Actual store blocks all three overflowing monthly reserve buttons and unsupported
shields. Eligible small daily packs remain reviewable. Desktop 1280x900 and
mobile 390x844 checked; mobile document width stayed 390 with no horizontal
overflow. No buy/confirm action was taken. Evidence: store-edges-desktop and
store-edges-mobile screenshots, plus monthly-quest-target-claimed screenshot.

## Reproduction And Limits

Script: server/check-store-quest-edges-devnet.cjs; generated evidence:
store-quest-edges-devnet-2026-10-19.json. These fixtures used live balances and an
unclaimed monthly quest BEFORE the signed claim above. Further progression
changes eligibility/capacity; refresh fixture assumptions before rerunning.
The retained report is evidence at its recorded slot, not a current-state pass.

Still open: fitting monthly pack duplicate test, signed boundary interruptions,
actual UTC day/week/month transitions, consecutive-day and capped-streak live
behavior, and the broader release gates in MAINNET_READINESS_2026-10-19.md.
