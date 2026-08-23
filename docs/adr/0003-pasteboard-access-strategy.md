# ADR 0003 — Pasteboard access strategy

- **Status:** proposed
- **Date proposed:** 2026-08-23
- **Date accepted:** —
- **Superseded by:** —
- **Tracking issue:** [DDinVA/grabit#4](https://github.com/DDinVA/grabit/issues/4)

## Context

grabit's core promise is that recognised text lands on the macOS
pasteboard automatically. The Rust CLI ([ADR 0002](0002-rust-for-non-vision-half.md))
needs a way to write to `NSPasteboard`.

## Decision

Phase 2 uses a `pbcopy` shell-out for pasteboard writes. Phase 4
migrates to the `objc2-app-kit` crate once the CLI is stable.

## Options considered

### Option A — `pbcopy` shell-out (chosen for Phase 2)
- Rust spawns `/usr/bin/pbcopy` and writes the text to its stdin.
- **Pro:** Zero FFI. Zero unsafe. Zero extra crates. `pbcopy` has
  shipped with macOS since 10.2 (2002) and its interface is stable.
- **Con:** Extra process spawn (~5ms). Handles UTF-8 fine; anything
  weirder needs explicit encoding.

### Option B — `objc2-app-kit` FFI (chosen for Phase 4)
- Rust calls `NSPasteboard.general` directly via the `objc2` crate
  family.
- **Pro:** No process spawn. Direct access to typed pasteboard
  contents (RTF, PNG, custom types) if grabit needs them later.
- **Con:** More Rust unsafe surface. `objc2` is well-maintained but
  adds a dependency subtree. Any breakage lands in grabit's own
  error paths, not `pbcopy`'s.

### Option C — Hand-rolled Objective-C runtime calls
- Rejected. `objc2` exists for this reason.

## Rationale

- Phase 2 is a walking skeleton. The point is to prove the
  architecture works end-to-end. Adding an FFI layer at the same time
  compounds risk.
- `pbcopy` has been the correct answer for shell scripts on macOS for
  22 years. It is not going anywhere.
- Once the CLI is stable and shipping in Phase 3, the FFI migration
  is a mechanical swap behind the same trait — a good sanity check
  that the internal boundary is drawn correctly.

## Consequences

- **Positive:** Phase 2 ships without any Rust unsafe blocks. Debug
  story is straightforward — if pasteboard breaks, `pbcopy < file`
  reproduces it in one command.
- **Negative:** Extra ~5ms per invocation. Extra process in the
  process table (short-lived).
- **Neutral:** `PasteboardWriter` trait in the Rust code hides the
  implementation behind a stable interface, so Phase 4 swap is
  bounded.

## Validation

- `grabit -i fixture.png` results in the recognised text on the
  pasteboard, verified by a follow-up `pbpaste` in a smoke test.
- End-to-end runtime (capture → OCR → pasteboard) stays under 500ms
  on the reference hardware.

## Related

- [ADR 0002](0002-rust-for-non-vision-half.md) — the language choice
  that makes this question arise.
