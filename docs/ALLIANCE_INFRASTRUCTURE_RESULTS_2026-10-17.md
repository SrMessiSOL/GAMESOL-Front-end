# Finalized devnet infrastructure results

All four infrastructure buildings are level 1. All below receipts finalized
successfully on devnet; no mainnet action occurred.

## Research Grid level 1

Receipt `3WaqRPjtaQ897HP4R3FKwZt8YEcEg1JPquZkdK32xMCTB3r93uTtoekRZ11ypS2W7H5SFSsKaaz79FnxdMWykzjn`.
Treasury 13,000 M / 13,000 C / 8,000 D / 1,050 AM became
11,000 M / 8,000 C / 6,000 D / 975 AM. XP 4,311 -> 4,611 (+300).

## Defense Coordination level 1 and Research Grid effect

Receipt `3yJfNrZjB4KD6x8vQQzdKVvpNTTY2nRwqynTZ52e7c61frREd1AK6CMSff8boqQetyM7agHbyqgzHCAGRwSypJ3q`.
Treasury became 7,000 M / 4,000 C / 4,500 D / 915 AM.
XP 4,611 -> 4,899 (+288): 275 base plus floor(275 * 5%) = 13 bonus.
This is a real upgrade with the Research Grid bonus, not merely a unit test.

## Trade Network level 1 and Defense Coordination effect

Receipt `jF6JtEeTnq93FRwHnUfooVtkzSxcJiFa4XvosuRuAQpJskZpHUvhX67YL9YJT7tpxgGQuTTMkBLLkoeEo3ZhE8c`.
Treasury became **4,000 M / 1,000 C / 1,545 D / 815 AM**.
Charged 3,000 M / 3,000 C / 2,955 D / 100 AM.
The 3,000-D base price was reduced by 45 D, exactly the 1.5% Defense discount.
XP 4,899 -> 5,266 (+367): 350 base plus floor(350 * 5%) = 17 bonus.
This receipt's pre/post wallet token balances are identical; the AM charge is
against already-funded alliance treasury accounting, not a second wallet payment.

## Remaining Trade Network effect test

Trade Network's own 1% metal/crystal/AM discount is implemented in the backend
but has NOT yet been exercised in a later real upgrade in this run.
Research Grid level 2 would provide a controlled test:

| Resource | Base cost | Discounted cost | Current treasury | Shortfall |
| --- | ---: | ---: | ---: | ---: |
| Metal | 8,000 | 7,920 | 4,000 | 3,920 |
| Crystal | 20,000 | 19,800 | 1,000 | 18,800 |
| Deuterium | 8,000 | 7,880 | 1,545 | 6,335 |
| AM | 150 | 148.5 | 815 | 0 |

The deuterium price reflects Defense Coordination's 1.5% discount; the other
three prices reflect Trade Network's 1% discount. Expected XP is 630 using
the pre-upgrade level-1 Research Grid bonus. These values are expectations,
not a claim that the upgrade executed.

The user authorized devnet test funding. No additional purchases or upgrades
were submitted after the Trade Network receipt above. Browser automation failed
to restart during inspection (local kernel assets path unavailable), blocking
further actual-game funding and passkey prompts. Read-only RPC verification
remained available through explicit Windows PowerShell.
