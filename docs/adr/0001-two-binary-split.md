# ADR 0001 — Two-binary architecture

- **Status:** proposed
- **Date proposed:** 2026-08-23
- **Date accepted:** —
- **Superseded by:** —
- **Tracking issue:** [DDinVA/grabit#2](https://github.com/DDinVA/grabit/issues/2)

## Context

grabit's Vision + `ScreenCaptureKit` + `NSPasteboard` calls can only be
made from Swift or Objective-C — there is no Rust, Go, or Python
binding for those APIs. That constrains the language of at least part
of grabit forever.

Iteration on the non-Vision half (argument parsing, reflow, format
work, updater, future watch mode, TUI) currently requires Xcode
against a Mac. That is a real velocity tax on work that has nothing
to do with Vision itself.

The reflow algorithm added in v1.0.0 is plain string + geometry work
that has no Apple-framework dependency. Every future format feature
will be the same shape.

## Decision

grabit will ship as two binaries: a small Swift shim
(`grabit-vision`) that owns the Apple-framework surface, and a
user-facing CLI (`grabit`) written in a different language that
invokes the shim over a JSON-on-stdio contract.

## Options considered

### Option A — Two-binary split (chosen)
- `grabit-vision` (Swift, ~150 lines): reads a JSON request on stdin
  (region rect, languages, symbologies), returns a JSON response on
  stdout (observations, records).
- `grabit` (language TBD, see ADR 0002): the user-facing CLI. Owns
  argument parsing, reflow, formatting, pasteboard write, updater.
- Both binaries ship in the same release.
- **Pro:** Swift surface frozen. All future work in the other language.
  Clean IPC contract. Test harness lives in the CLI language's
  ecosystem. Contributors can help without owning a Mac dev setup.
- **Con:** Two artifacts to ship, sign, version. Subprocess spawn
  latency ~5-20ms per invocation.

### Option B — Swift FFI library, linked into a non-Swift binary
- Vision + capture built as `.a` or `.dylib`, linked via C-ABI shim
  into a Rust/Go binary.
- **Pro:** One binary. No IPC latency.
- **Con:** Swift ABI is not stable across compilers. C shim required.
  Cross-compilation matrix explodes. Notarization gets weird. Debug
  story is painful.

### Option C — Monolithic Swift
- Keep everything in Swift.
- **Pro:** One binary, no IPC.
- **Con:** The constraint that drove this refactor is unresolved.

## Rationale

- The subprocess-spawn cost (~10ms) is invisible in a one-shot CLI
  that already waits on user region selection.
- The Swift-ABI-across-compilers problem in Option B is a genuine
  operational tax paid on every release forever.
- Option C fails the requirement.

## Consequences

- **Positive:** Non-Vision iteration happens without Xcode. Reflow
  logic gets a real test harness. Contributor pool widens beyond
  Swift developers.
- **Negative:** Release pipeline builds and signs two binaries. Users
  see two files in `/usr/local/bin/` (one they invoke, one they do
  not). Brew formula must install both.
- **Neutral:** JSON contract between the two binaries becomes a
  versioned spec — see [`docs/specs/vision-shim-protocol.md`](../specs/vision-shim-protocol.md).

## Validation

- `grabit --reflow paragraph -i fixture.png` produces byte-identical
  output before and after the split, on every fixture in
  `tests/fixtures/`.
- Startup latency measured against v1.0.0 shows the shim overhead is
  under 20ms.
- CI matrix builds both binaries on every push.

## Related

- [ADR 0002](0002-rust-for-non-vision-half.md) — language choice for the CLI half.
- [ADR 0004](0004-vision-shim-api-shape.md) — the JSON contract shape.
- Spec: `docs/specs/vision-shim-protocol.md` (to be written).
