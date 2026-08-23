# ADR 0005 — Per-arch binaries over universal2

- **Status:** proposed
- **Date proposed:** 2026-08-23
- **Date accepted:** —
- **Superseded by:** —
- **Tracking issue:** [DDinVA/grabit#6](https://github.com/DDinVA/grabit/issues/6)

## Context

macOS release artifacts can ship as either separate `arm64` and
`x86_64` Mach-O binaries or as a single universal2 binary combining
both slices with `lipo`. Homebrew and manual `curl | tar` installs
have different install ergonomics for each shape.

## Decision

grabit release tarballs are per-arch: `grabit-arm64.tar.gz` and
`grabit-x86_64.tar.gz`. Homebrew picks the correct one automatically.

## Options considered

### Option A — Per-arch tarballs (chosen)
- Two release assets, one per architecture.
- **Pro:** Smaller downloads (1-3 MB per arch instead of 2-6 MB
  universal2). Homebrew formula selects the right one via the standard
  `on_arm` / `on_intel` bottle mechanism. Matches how every major
  Rust CLI on macOS distributes.
- **Con:** Users who `curl | tar` from a browser have to pick the
  right one manually.

### Option B — Universal2 binary
- One tarball, one binary containing both slices.
- **Pro:** No wrong-arch install possible. Runs on Rosetta without
  extra work.
- **Con:** Doubles binary size on disk for every user. `curl | tar`
  UX is marginally better; brew UX is unchanged.

### Option C — Both
- Ship all three (arm64, x86_64, universal2).
- **Con:** Every release doubles in artifact count. Every install
  script that references "the tarball" becomes ambiguous.

## Rationale

- Homebrew is the recommended install path per the README. Brew's
  bottle selection makes per-arch invisible to the user.
- The direct-download install case is small (users who cannot or
  will not use Homebrew), and those users can read a two-line install
  section.
- Rust CLIs on macOS (ripgrep, bat, fd, zoxide) all ship per-arch and
  no one considers it an install problem.
- Universal2 is worth revisiting if grabit ships a `.pkg` installer
  (a much larger surface change) or a mixed-arch enterprise
  distribution channel.

## Consequences

- **Positive:** Smaller downloads. Simpler build matrix per arch. No
  `lipo` step to maintain.
- **Negative:** Direct-download users must match arch to their Mac.
  README `uname -m` snippet mitigates.
- **Neutral:** Release automation produces exactly two assets plus
  `SHA256SUMS`.

## Validation

- Both `arm64` and `x86_64` tarballs are attached to every tagged
  release by CI.
- `SHA256SUMS` contains both files.
- Homebrew formula (once shipped) selects the right one on both
  Apple Silicon and Intel test hardware.

## Related

- [ADR 0006](0006-notarization-timing.md) — related install-path
  concern.
- CI: `.github/workflows/build.yml` matrix `[x86_64, arm64]`.
