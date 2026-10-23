# Combat Chronicle — v0.2.8 Development Build

**Foundry VTT 13.351 • Pathfinder 1e system 11.11**

An installable PF1e-specific combat analytics module with an MMO-inspired live meter, automatic combat history, mixed HP/Vigor/Wounds/Soak recording, GM event corrections, player-safe aggregate projections, reports, and a real-world combat calendar.

> **Development release.** This package is installable and includes working module code and passing automated tests, but it has **not** been executed inside a live Foundry v13.351 + PF1e 11.11 + Nevela + Armor Soak world. Do **not** use it as the sole record of your campaign until you complete the test-world checklist. The full uploaded specification is included as `SPECIFICATION.md` in the source ZIP, and substantial advanced features remain incomplete.

## Install from GitHub Releases

Use this Foundry VTT Manifest URL after the release workflow succeeds:

https://github.com/Antpoizen/PF1E-Combat-Chronicle/releases/latest/download/module.json

Pushing source to the main branch automatically builds and publishes a versioned release with `module.json` and `combat-chronicle.zip`.

## Manual local installation

1. Download `Combat-Chronicle-v0.2.8.zip` and extract its single `combat-chronicle` directory.
2. Place that directory into your Foundry `Data/modules/` directory.
3. Restart Foundry and open a **backup/test world** using PF1e 11.11.
4. Enable **Combat Chronicle** in Manage Modules. Enable Armor Soak Pool 1.1.1 and Nevela's Automation Suite in your test world.
5. Start a test combat. The floating meter should appear, and combat tracker should provide **Meter** and **Chronicle** reopen buttons.

## Live meter readability (v0.2.8)

- Character portraits are now 40 × 40 pixels instead of 20 × 20.
- Character names wrap naturally next to their icons and can also be read by hovering the name.
- The Effective/Pressure columns retain dedicated space, while the segmented damage bar renders in its own row below all name and number text.
- The default meter width increases slightly; previously saved window positions and sizes remain user-controlled.

## New in v0.2.8

- Red outlines around every unresolved attribution event in Corrections.
- Ranking dropdowns for kills, critical attack rolls, healing and largest single hit; kills and crit rolls selectable in meter.
- Green healing bar beneath the blue/gray effective damage and pressure bar.
- Natural-20 attack rolls tracked without requiring a critical confirmation.
- Largest player hit computed by action and target; player-specific largest hits in expanded combatant rows.
- Failed saving throws tracked when an explicit PF1e save DC and roll result are present. Control +1 goes to the source when reliably attributed or manually corrected.
- PC Wounds/Vigor downed at 0 or less Vigor and negative Wounds; dead at negative Wounds equal to Constitution.

## Key behavior

- Effective Damage is Vigor/Wound/HP damage **actually lost**; Total Pressure is Effective Damage plus Armor Soak consumed.
- The meter defaults to sorting by Pressure; switch between Encounter, Current Round, and DPR. Click a combatant for resource and item breakouts.
- Combat Chronicle listens for Foundry actor and combat events. Recorded events survive a browser refresh because the active GM stores them in **GM-only JournalEntry documents** named `Chronicle | ...`, inside `Combat Chronicle — GM Private`.
- Events are stored in bounded chunks of 75 per Journal page, rather than indefinitely growing one setting/flag. Each world keeps its own separate archive.
- Wounds, Vigor, HP, temp resources, and Soak are tracked separately from actor value changes. You can override the default actor paths in the module's **Health Paths** JSON setting if needed after inspecting PF1e data.
- **Automatic Soak damage tracking:** Armor Soak Pool's `armorSoakPool.damageApplied` hook supplies the actual `absorbed` damage. Combat Chronicle records that as **Soak Dealt**, increases Total Pressure, and records **Soak Received** for the target. Its `overflow` is never counted as health damage unless an HP/Vigor/Wounds decrease is independently observed.
- When Armor Soak Pool's custom hook fires only on another client, the GM observes the actual Soak flag change as a fallback. Fallback reductions are flagged as **ambiguous for GM review** because the flag alone cannot prove damage versus a manual adjustment. Refills and capacity adjustments are not counted as damage when their dedicated hooks are visible.
- Soak damage is automatically attributed if a verified PF1e action/message or explicit automation context establishes the attacker. **Armor Soak Pool's native hook does not contain an attacker ID.** Otherwise the exact absorbed amount remains recorded in **Corrections** until the GM assigns its source; it is not guessed from turn order.
- Soak events use unique action keys so two identical hits separated by a refill are not accidentally merged.
- Nevela compatibility is **observational**: Combat Chronicle records downstream actor changes and does not install another damage wrapper.
- Damage is credited to a source only with explicit provenance (such as compatible actor update options or PF1e `pf1ApplyDamage` message metadata). Unknown sources are retained and can be attributed in the **Corrections** tab. This avoids falsely crediting the active turn combatant.
- GM may attribute, void, adjust damage events, assign companion controllers, approve awards, and build sanitized player reports.
- Award cards explain their criteria and show the candidate's actual result. Approval is limited to player-owned PF1e character actors, never enemy/allied NPCs or summons.
- Enemy HP crossing from above 0 to 0 or below is recorded as a **kill/0-HP takedown**. A verified attacker receives credit; unattributed events wait for GM source correction. Assigned summons can contribute kills to their controlling PC.
- Kills appear in the meter breakdown, combatant table, overview, daily archive and CSV, plus the Executioner award.
- Reports can be posted in chat or created as player-readable Journal Entries after GM preview.
- Calendar indexes combats by real-world start date in a configurable IANA timezone (`America/Denver` by default).
- GM can export JSON, CSV statistics, CSV event details, and Markdown summaries.

## Known limitations / not yet production-verified

- **Chat-card attribution is incomplete.** PF1e's `pf1ApplyDamage` hook can expose `options.message`, and the recorder uses this evidence when available, but the installed Nevela automation/Soak interception pathway and player-initiated cross-client actions must be verified in Foundry. Unattributed damage needs GM correction. Spell/item-name breakouts require explicit provenance and will often be empty.
- **Advanced combat mechanics are incomplete:** automatic confirmation of critical hits, detailed fumbles, true confirmed deaths (0-HP kill tracking follows this campaign's requested threshold), full control-effect durations, downed states, class-specific healing, tactical weighting, several awards, and advanced narrative report sections.
- **Historical import, per-date event splitting across midnight, multi-date filtering, advanced chart interactions, journal public-history access, and exhaustive source reconciliation** are not complete.
- **Mixed Wounds/Vigor and HP fields have not been tested in a live PF1e actor**. The defaults are `system.attributes.{hp,vigor,wounds}.value`; verify your character and NPC sheets produce matching deltas, especially with temporary resources.
- **Two-GM failover and 50+ combatant performance** require real-world testing. The recorder selects the first active GM lexicographically and uses idempotent event keys when possible.
- **Players cannot browse the GM-only historical calendar**; they can see player-safe live meter data and reports deliberately published by the GM.
- **Automatic per-event detection can miss updates** if clients are disconnected, if an operation doesn't update the watched resources, or if a synthetic actor uses an unsupported pathway.
- Player permission restrictions and the Journal model are designed defensively; verify with a separate player account in your test world.

## Programmatic attribution

If you author compatible PF1e macros, pass explicit source context when updating a target Actor document (only if your workflow supports passing actor-update options):

```js
const options = game.combatChronicle.attributionOptions(sourceCombatant.id, 'Longsword', chatMessage.id);
await targetActor.update({ 'system.attributes.hp.value': newHP }, options);
```

This is an **example of an opted-in macro integration**, not an instruction to bypass PF1e/Nevela's damage resolution. Prefer the normal PF1e damage workflow and pass metadata through its supported options where possible.

### Developer API

```js
game.combatChronicle.openMeter();
game.combatChronicle.openDashboard();
game.combatChronicle.status();
```

## Source-level tests

Node 22+:

```bash
node --test tests/*.test.mjs
find scripts -name '*.mjs' -exec node --check '{}' \;
```

These verify calculations, correction semantics, privacy projection, UI HTML generation, calendar date handling, and storage chunk replay. They do **not** simulate the complete Foundry runtime.

## Repository release workflow

`.github/workflows/release.yml` runs on `v*` tags. It checks syntax, runs tests, packages the install ZIP, and publishes **both** the ZIP and `module.json` using `gh release create` with `contents: write`. Push this source folder to the root of your chosen GitHub repository before creating a version tag; no repository URL is invented in the local manifest.

## License

MIT. No third-party code or artwork is bundled from Foundry, Pathfinder 1e, Armor Soak Pool, or Nevela's Automation Suite.
