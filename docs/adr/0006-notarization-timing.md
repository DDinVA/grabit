# ADR 0006 — Defer notarization until traction

- **Status:** proposed
- **Date proposed:** 2026-08-23
- **Date accepted:** —
- **Superseded by:** —
- **Tracking issue:** [DDinVA/grabit#7](https://github.com/DDinVA/grabit/issues/7)

## Context

Binaries downloaded via a browser and un-quarantined by macOS
Gatekeeper require notarization from Apple to run without a
"unidentified developer" warning. Notarization requires:

- A paid Apple Developer account (US$99/year).
- A Developer ID signing certificate.
- An automated submission step in CI, plus a stapling step.

Homebrew installs from source do not need notarization. Users who
`curl | tar` a release asset from a browser do — without it,
Gatekeeper's `com.apple.quarantine` xattr triggers the warning.

## Decision

grabit v2.0.0 ships unnotarized. The README documents the
`xattr -c grabit` workaround for direct-download users. Notarization
is revisited once install-count metrics justify the $99/year
subscription.

## Options considered

### Option A — Defer notarization (chosen)
- Ship unsigned/unnotarized binaries. Document the Gatekeeper
  workaround. Homebrew users see no difference.
- **Pro:** Zero cost. No Apple Developer account needed. Faster
  first release. Aligns with how many well-known Rust CLIs on macOS
  operate at the "small project" stage.
- **Con:** Direct-download users see a Gatekeeper warning until they
  run `xattr -c grabit`. Some fraction bounce.

### Option B — Notarize from v2.0.0
- Set up an Apple Developer account, signing certificate, and CI
  automation before v2.0.0.
- **Pro:** Cleanest UX for every install path. No workaround
  documentation.
- **Con:** $99/year recurring. Certificate management is a real
  operational surface. Setup delays v2.0.0.

### Option C — Ad-hoc signing only
- `codesign -s -` produces a locally-signed binary that Gatekeeper
  still rejects but that macOS can verify hasn't been tampered with.
- **Con:** Solves nothing user-visible. Not a middle ground.

## Rationale

- v2.0.0 is a fresh release from a repo with zero stars. The
  install-count threshold at which $99/year is obviously worth
  paying is not yet reached.
- The Gatekeeper workaround (one command, well-known) is not a
  reputation risk at this stage — many respected Rust CLIs shipped
  this way for years.
- Notarization is a mechanical, well-scoped later addition. Adding
  it in Phase 5 or 6 costs one PR and one CI change; adding it now
  costs a delay for something no user is asking for yet.

## Consequences

- **Positive:** No recurring cost. No cert management. No delay to
  v2.0.0.
- **Negative:** Direct-download install has a friction step. README
  must document it clearly.
- **Neutral:** Homebrew formula (recommended path per README) is
  unaffected.

## Validation

- README `Install` section includes the `xattr -c` workaround
  paragraph.
- Once install metrics exist (via brew analytics opt-in, or GitHub
  release download counts crossing an agreed threshold), reopen this
  ADR.

## Related

- [ADR 0005](0005-per-arch-binaries.md) — install path decisions.
- Future: a `notarize` workflow when this ADR is superseded.
