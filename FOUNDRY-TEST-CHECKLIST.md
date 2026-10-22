# Live Foundry Test Checklist — Combat Chronicle v0.2.0

**Use a cloned/backup PF1e v11.11 world on Foundry v13.351.**

## Install and UI
- [ ] Module enables without console errors.
- [ ] Start combat with a player and monster; auto-open the meter for both GM and player clients.
- [ ] Close, reopen from combat tracker; drag and resize; position persists after close/reopen.
- [ ] Verify dark styling, clear effective and pressure values, drilldowns, and round/DPR selectors.

## Mixed health (highest priority)
- [ ] PC takes 12 Vigor and 3 Wound damage; verify 15 effective.
- [ ] Monster takes 22 HP damage; verify 22 effective.
- [ ] Heal only Vigor, only Wounds, and only HP; verify resources and healing statistics.
- [ ] Verify temporary resource and nonlethal behavior.

## Soak + Nevela (highest priority)
- [ ] Test a strike that loses 10 Soak and 20 Vigor: pressure 30; effective 20.
- [ ] Test Soak-only 25 damage: pressure 25, effective 0.
- [ ] Test Soak refill: does not change prior damage or count as healing.
- [ ] Test a soak hit applied by a player client while GM watches; ensure GM sees the flag delta fallback and no duplicate event.
- [ ] Test DR, energy resistance, immunity and vulnerability via Nevela; only final resource losses count.
- [ ] Test damage applied through PF1e chat cards versus Nevela automated paths; inspect Corrections for unknown sources.
- [ ] Test linked and unlinked tokens separately.

## Persistence, permissions, and historical archive
- [ ] Complete 2 encounters on the same real date; both appear on that calendar day.
- [ ] Refresh GM and player sessions mid-combat; confirm prior events and no duplicate encounter.
- [ ] Restart Foundry; verify active encounter recovers.
- [ ] Delete the Combat document; verify archive data survives.
- [ ] Log in as an ordinary player; verify GM Private Journal is inaccessible and hidden enemy name/portrait/status is not visible in meter or report.
- [ ] Publish a previewed report to chat and a Journal Entry.
- [ ] Correct an unattributed event, adjust amount, void an event, and confirm totals recompute.
- [ ] Export valid JSON and CSV files.

## Results
Please capture browser-console errors, exact observed/expected resource values, screenshots of the meter, and Nevela/Armor Soak settings. Those will help resolve any remaining integration incompatibilities.
