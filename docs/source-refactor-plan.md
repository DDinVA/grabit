# grabit — source refactor plan

**Status:** DRAFT — pending decision.
**Branch:** `source-refactor`.

## Why we are here

grabit is 1076 lines of Swift. Of those, roughly 150 lines are the
irreducible core: `CGImage` → Vision `VNRecognizeTextRequest` /
`VNDetectBarcodesRequest` → observations, plus `ScreenCaptureKit` region
selection and pasteboard write. The other ~900 lines are argument
parsing, help text, self-updater, Homebrew detection, error surfaces,
and — critically — the reflow algorithm added in v1.0.0.

Iteration on `--reflow markdown`, multi-column tuning, watch mode, TUI
output, streaming JSON, RTL support, and any future format work
currently requires an Xcode build against a Mac. Every iteration is
minutes. The reflow logic itself is plain string + geometry work that
does not need to live in Swift.

Choosing the replacement language on ergonomics alone would be
premature. This document is the honest comparison against distribution,
security posture, contributor draw, and the constraints grabit's users
already assume from a modern Mac CLI.

## Constraint that cannot move

**Apple Vision is Swift/Objective-C only.** No Rust binding, no Python
binding, no Go binding that is not a shell-out. `ScreenCaptureKit` and
`NSPasteboard` are the same story. Anything Vision-adjacent — including
the eventual `VNRecognizeTablesRequest` on macOS 15+ — will live on the
Swift/ObjC side forever.

That means: **there will always be a Swift binary in grabit's install
tree.** The only question is how much lives there.

## Architecture options

### A. Two-binary split (recommended for further analysis)

```
  ┌───────────────────────────┐   JSON via stdio   ┌────────────────────────┐
  │ grabit-vision  (Swift)    │◀──────────────────▶│ grabit  (X)            │
  │  ~150 lines, frozen       │                    │  reflow, format, CLI,  │
  │  capture + Vision + PB    │                    │  updater, everything   │
  │  no CLI, no updater       │                    │  future                │
  └───────────────────────────┘                    └────────────────────────┘
```

- `grabit-vision` reads a small JSON request on stdin (region rect,
  languages, symbologies) and writes a JSON response on stdout
  (observations with bounding boxes, confidence, payloads).
- `grabit` is the user-facing CLI in language X — parses arguments,
  invokes `grabit-vision`, applies reflow / formatting, writes to
  stdout + pasteboard.
- Brew formula installs both binaries. `grabit` shells out via
  `Process`/`std::process::Command`/`subprocess` depending on X.
- **Pro:** Swift surface frozen. All future work in X. Clean IPC contract.
- **Pro:** Test harness lives in X's ecosystem — property tests on
  reflow, snapshot tests on JSON fixtures, cheap CI.
- **Con:** Two artifacts to ship, sign, notarize, version.
- **Con:** Subprocess spawn latency (~5-20ms on macOS). Acceptable for a
  one-shot OCR tool.

### B. Embed Swift as FFI library in a non-Swift binary

- Build the Vision + capture code as a `.a` or `.dylib`, link into a
  Rust/Go binary via FFI.
- **Pro:** One binary. No IPC latency.
- **Con:** Swift ABI is not stable across compilers. C-shim required at
  the boundary. Cross-compilation matrix explodes. Notarization gets
  weird. Debug story is a nightmare.
- **Verdict:** Rejected. The ~10ms latency of option A is not worth the
  operational tax.

### C. Keep monolithic Swift

- Rejected per constraint. Reason we are here.

**Decision on architecture: Option A, two-binary split.**

## Language choice for the non-Vision half

The four candidates that pass a smell test for a macOS security-adjacent
CLI in 2026.

### Rust

| Dimension | Read |
|---|---|
| Distribution | Single binary. No runtime. Universal2 build via cargo-lipo or the `--target` matrix. Brew story: same as Swift binary. |
| Security posture | Memory safety on parsed JSON, byte payloads from barcodes, and future streaming inputs. `serde` is compile-checked. `clippy` catches real bugs. `cargo audit` for supply chain. Matches the tone of our SECURITY.md. |
| Ecosystem | `clap` (best-in-class CLI), `serde_json` (fastest, ergonomic), `indicatif` (progress), `crossterm` (TUI), `ratatui` (dashboards), `image` (fixture generation). Everything grabit needs is one line in `Cargo.toml`. |
| Contributor draw | High. Rust attracts contributors specifically for CLI/security-adjacent projects. Every serious modern Mac CLI (ripgrep, bat, fd, delta, zoxide, atuin, starship) is Rust. |
| Compile times | Fine for a small CLI. Under 30s clean, sub-second incremental. |
| Learning debt | Non-trivial if the code hits lifetimes / async. For grabit's shape, it hits neither. |
| Notarization | Same as any Mach-O binary. Solved. |
| Downside | Marginally more code than Python for pure string manipulation. Not enough to matter at grabit's size. |

### Go

| Dimension | Read |
|---|---|
| Distribution | Single binary. No runtime. Universal2 via `GOARCH=arm64,amd64` + `lipo`. |
| Security posture | Memory-safe. Type-safe. Much better than Python, but weaker guarantees than Rust — Go's runtime is bigger and its unsafe corners are more numerous. |
| Ecosystem | `cobra` for CLI, `encoding/json` in stdlib. Fewer polished CLI libs than Rust. TUI options are OK (`bubbletea`, `tview`). |
| Contributor draw | Solid. Ops-friendly, easy to onboard. Weaker for CLIs than Rust in 2026 — Go has drifted toward servers/infra. |
| Compile times | Fastest of the four. Sub-second even from clean. |
| Learning debt | Minimal. |
| Notarization | Same as any Mach-O binary. Solved. |
| Downside | Binaries larger than Rust (~5-15 MB vs ~1-3 MB). Community narrative for security tooling has shifted toward Rust. |

### Python

| Dimension | Read |
|---|---|
| Distribution | Ugly for a Mac CLI. Options: (a) require Python 3.11+ system-side and `pip install`; (b) PyInstaller / Nuitka / pyapp bundle (30-80 MB, notarization edge cases). Neither matches the "one binary in `/usr/local/bin`" UX users expect from `brew install`. |
| Security posture | Interpreter is a supply-chain surface. `pip` is the largest attack surface in the industry. No compile-time guarantees on JSON schema. Contradicts the tone of our SECURITY.md. |
| Ecosystem | Everything exists. Text handling is trivial. Best-in-class for rapid iteration. |
| Contributor draw | Weak for a security-adjacent Mac CLI. Python CLIs are treated as scripts, not products. |
| Compile times | None. |
| Learning debt | Lowest of the four. |
| Notarization | Painful for PyInstaller bundles. Not impossible. |
| Downside | The distribution story alone kills it. `brew install DDinVA/grabit/grabit` running through pip is not a serious 2026 UX. |

### Zig

| Dimension | Read |
|---|---|
| Distribution | Single binary. No runtime. Cross-compilation is Zig's headline feature. |
| Security posture | Memory-safe by convention, not by compiler. Weaker than Rust. |
| Contributor draw | Low. Community is small and language is pre-1.0 as of 2026. |
| **Verdict** | Not for grabit. Watch for the next thing. |

## Decision matrix

| | Rust | Go | Python | Zig |
|---|---|---|---|---|
| Distribution UX | A | A | D | A |
| Security narrative | A | B | C | B |
| Iteration speed | B+ | A | A | C |
| Contributor draw | A | B | C | D |
| Type safety on JSON contract | A | B+ | D | B |
| Fits our SECURITY.md tone | A | B | D | B |
| **Total signal** | **A** | **B+** | **C** | **C** |

## Recommendation

**Rust.**

Reasons ordered by weight:

1. **Distribution.** `brew install DDinVA/grabit/grabit` puts a single
   compiled binary in `/usr/local/bin/grabit` with zero runtime
   dependencies. That is the UX users assume from a Mac CLI in 2026.
   Python cannot get there without a 30+ MB bundle that breaks
   notarization edge cases.
2. **SECURITY.md alignment.** The published security posture claims
   memory safety, compile-time guarantees, and hardened supply chain.
   Rust delivers exactly that. Python actively undermines it.
3. **Compile-time JSON contract.** The seam between `grabit-vision` and
   `grabit` is a structured JSON schema. `serde` in Rust turns that
   schema into compiler-enforced structs. In Python it stays a
   dictionary with `.get(...)` calls and runtime KeyErrors.
4. **Contributor draw.** The tools grabit competes with for mindshare
   (Snipping-tool-alikes, `textinator`, `screencapture` extensions) are
   drifting toward Rust for exactly the reasons above. Being on the
   right side of that trend costs nothing and pulls contributors who
   choose projects by language.
5. **Code volume is small.** ~500-800 lines total across CLI + reflow.
   Learning surface for reviewers and casual contributors is bounded.

Runner-up: **Go**, if the Phase 2 spike discovers concrete friction with
Rust. It gives up some security narrative and some contributor draw
but keeps the single-binary distribution and lower learning curve.

Rejected: **Python** on distribution grounds; **Zig** on maturity.

## Proposed migration plan

Each phase is sized to be independently mergeable to `main`.

### Phase 0 — decision (this document)
- Plan reviewed and approved (or revised).
- Nothing else changes.
- **Deliverable:** signed-off plan.

### Phase 1 — extract `grabit-vision` Swift shim
- New Xcode target `grabit-vision` inside the same workspace.
- ~150 lines, no CLI, reads one JSON request on stdin, writes one JSON
  response on stdout.
- Existing `grabit` Swift binary keeps working; the shim builds
  alongside it. No user-visible change.
- **CI:** build.yml matrix grows to `{arch: [x86_64, arm64], target: [grabit, grabit-vision]}`.
- **Deliverable:** two Swift binaries in the release tarball, both work.

### Phase 2 — Rust `grabit` CLI, feature-flagged
- New `rust/` directory in the repo. `cargo` project.
- `grabit-next` binary (temporary name during migration).
- Implements: argument parsing (`clap`), `grabit-vision` subprocess
  invocation, reflow algorithm (port from Swift), pasteboard write via
  `pbcopy` shell-out (avoids `AppKit` FFI for the first pass), JSON
  passthrough.
- Both `grabit` (old Swift) and `grabit-next` (new Rust) ship in the
  same release so users can compare.
- **CI:** add `rust.yml` workflow — cargo build, cargo test, cargo
  clippy, cargo audit, SHA-pinned actions, harden-runner, provenance
  attestation.
- **Deliverable:** parity between `grabit` and `grabit-next` on every
  fixture in `tests/fixtures/`.

### Phase 3 — swap `grabit-next` → `grabit`
- Rename Rust binary to `grabit`, retire the Swift `grabit`.
- The Swift target is now only `grabit-vision`.
- Brew formula updated to install `grabit` (Rust) + `grabit-vision`
  (Swift).
- Release notes call out the change and the improved security posture.
- **Deliverable:** grabit 2.0.0.

### Phase 4 — reflow tests + property tests
- Port the reflow-testing fixtures into Rust `#[test]` functions. Add
  property tests via `proptest` for row-grouping invariants
  (associativity, ordering stability, no-orphan lines).
- **Deliverable:** first grabit release with a real test harness.

### Phase 5+ — features
- `--reflow markdown` (monospace detection → code fences).
- Watch mode (`grabit --watch` for streaming re-capture).
- TUI progress on `--reflow markdown`.
- RTL support in reflow.
- Multi-column ML heuristic for real academic PDFs.

## Open questions to resolve before Phase 1

1. **Pasteboard access from Rust.** Simplest path: shell out to `pbcopy`.
   Correct path: `objc2-app-kit` crate calling `NSPasteboard.general`.
   Which one first?
   - **Proposed default:** `pbcopy` shell-out for Phase 2; migrate to
     `objc2` in Phase 4 once the CLI is stable. `pbcopy` has been
     stable since Mac OS X 10.2 (2002) and is unlikely to change.

2. **`grabit-vision` API shape.** Two options:
   - **Request-response over stdio** (simple, one-shot): `stdin: {rect,
     lang, symbologies}`, `stdout: {observations, records}`.
   - **Line-delimited streaming** (future watch mode): daemon-style,
     one request per line, one response per line, indefinite lifetime.
   - **Proposed default:** start with request-response. Streaming is a
     Phase 5 concern.

3. **Universal2 or per-arch binaries?**
   - Rust supports universal2 via `lipo` in a post-build step. Doubles
     binary size.
   - Current release ships per-arch tarballs (already have `arm64` +
     coming `x86_64`).
   - **Proposed default:** keep per-arch. Users installing via brew get
     the right one automatically. Universal2 only helps people
     distributing via `curl | tar`.

4. **Do we notarize?**
   - Requires an Apple Developer account ($99/year) + signing identity.
   - `brew install` from source does not need notarization.
   - Binary tarballs from Releases downloaded via browser DO get
     Gatekeeper warnings without notarization.
   - **Proposed default:** not for v2.0.0. Revisit once traction
     justifies the $99. Document the `xattr -c grabit` workaround in
     README until then.

5. **Swift Package Manager migration for the Vision shim?**
   - CocoaPods is dying. SPM is the modern Swift package manager.
   - The shim will be small enough to go SPM-native and drop CocoaPods
     entirely.
   - **Proposed default:** yes. Do it in Phase 1 as part of the shim
     extraction. Retire the `Pods/` directory. Cleaner tree, native
     Dependabot coverage for the Swift deps, no `pod install` in CI.

## What this document is NOT

- A code change. Nothing has been written.
- An irrevocable commitment. If Phase 2 discovers the Rust story is
  worse than expected, cutting over to Go costs one phase.
- A performance argument. grabit is not performance-bound. This plan is
  about ergonomics, security posture, and distribution UX.

## Ask

Sign off on the plan and Phase 1 (Swift shim extraction) starts on this
branch. Concrete pushback on any specific piece is welcome and expected
— the shape below is a starting point, not a final answer.
