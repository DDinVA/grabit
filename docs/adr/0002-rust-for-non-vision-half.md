# ADR 0002 — Rust for the non-Vision half

- **Status:** proposed
- **Date proposed:** 2026-08-23
- **Date accepted:** —
- **Superseded by:** —
- **Tracking issue:** [DDinVA/grabit#3](https://github.com/DDinVA/grabit/issues/3)

## Context

[ADR 0001](0001-two-binary-split.md) commits grabit to a two-binary
split. The Swift half is fixed by the constraint that Vision is
Apple-only. The CLI half is a free choice among languages that can
produce a single Mach-O binary and speak JSON over stdio.

## Decision

The `grabit` CLI will be written in Rust.

## Options considered

### Option A — Rust (chosen)
- Single-binary distribution, no runtime. `serde` gives compile-time
  JSON schema enforcement. `clap` is best-in-class for CLIs.
  `cargo audit` covers supply-chain hardening in step with grabit's
  security posture. Binary size 1-3 MB.
- **Pro:** Distribution matches user expectations for a modern Mac
  CLI. Memory safety and compile-time guarantees match
  [`SECURITY.md`](../../SECURITY.md). Contributor draw is strong for
  security-adjacent CLI projects (ripgrep, bat, fd, delta, zoxide,
  atuin, starship are all Rust). Compile times are sub-second
  incremental on a small project.
- **Con:** Learning surface is non-trivial for casual contributors.
  grabit's shape avoids lifetimes and async, so the surface stays
  bounded.

### Option B — Go
- Single-binary, ops-friendly, easy to onboard. `cobra` for CLI,
  stdlib JSON. Binary size 5-15 MB.
- **Pro:** Fastest compile times of the four candidates. Lower
  learning curve than Rust. Memory-safe and type-safe.
- **Con:** Community narrative for security-adjacent CLI tooling has
  shifted toward Rust. Larger binaries. Slightly weaker security
  guarantees (bigger runtime, more unsafe corners in stdlib).

### Option C — Python
- Best iteration speed. Every library imaginable.
- **Pro:** Fastest to prototype.
- **Con:** Distribution is ugly — either require system Python or
  ship a 30-80 MB PyInstaller/Nuitka bundle with notarization edge
  cases. `pip` is the largest supply-chain surface in the industry.
  No compile-time guarantees on the JSON contract. Contradicts the
  tone of grabit's SECURITY.md.

### Option D — Zig
- Single-binary, fast, cross-compile-friendly.
- **Con:** Memory-safe by convention, not compiler. Ecosystem is
  pre-1.0. Not enough polished libs for a security-adjacent CLI in
  2026.

## Rationale

Ordered by weight:

1. **Distribution.** `brew install DDinVA/grabit/grabit` puts a 1-3 MB
   binary in `/usr/local/bin/grabit`. Python cannot get there without
   a bundle. Rust and Go both can; Rust ships smaller binaries.
2. **SECURITY.md alignment.** grabit's published security posture
   claims memory safety, compile-time guarantees, and hardened supply
   chain. Rust delivers exactly that. Python actively undermines it.
   Go is in the middle.
3. **Compile-time JSON contract.** The seam between `grabit-vision`
   and `grabit` is a structured JSON schema. `serde` turns that
   schema into compiler-enforced structs. Python and (to a lesser
   extent) Go keep it as runtime error surfaces.
4. **Contributor draw.** Tools grabit competes with for mindshare are
   drifting toward Rust for exactly these reasons.

Runner-up **Go**, if the Phase 2 spike surfaces concrete Rust
friction that costs more than the security narrative is worth.

## Consequences

- **Positive:** grabit ships as a small compiled binary with no
  runtime. Test harness (`cargo test` + `proptest`) is cheap and CI
  fast. Supply-chain surface is small and well-tooled (`cargo audit`,
  Dependabot support).
- **Negative:** Casual contributors with no Rust background face a
  learning curve. First-issue labels and small-scope tickets need
  extra care.
- **Neutral:** Cargo workspace layout lives under `rust/` in the
  repo. Rust-specific CI (`rust.yml`) joins the existing Swift build.

## Validation

- `cargo build --release` completes in under 30 seconds on the
  reference CI runner.
- `cargo audit` passes with zero unpatched advisories on every push.
- `grabit` binary is under 5 MB stripped, arm64 or x86_64.
- Reflow output is byte-identical to the Swift implementation on
  every fixture during the parity phase.

## Related

- [ADR 0001](0001-two-binary-split.md) — architecture.
- [ADR 0003](0003-pasteboard-access-strategy.md) — how Rust talks to
  `NSPasteboard`.
