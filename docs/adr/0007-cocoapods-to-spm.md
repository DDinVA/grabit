# ADR 0007 — Migrate CocoaPods to Swift Package Manager

- **Status:** proposed
- **Date proposed:** 2026-08-23
- **Date accepted:** —
- **Superseded by:** —
- **Tracking issue:** [DDinVA/grabit#8](https://github.com/DDinVA/grabit/issues/8)

## Context

grabit inherits its dependency management from macOCR, which uses
CocoaPods. The `Pods/` directory ships vendored copies of
ArgumentParserKit (Apple, Apache 2.0) and ScreenCapture (Jack P., MIT).

CocoaPods has been in maintenance mode since Apple released Swift
Package Manager. New Swift projects default to SPM. SPM has native
Dependabot support; CocoaPods does not — grabit's
[`.github/dependabot.yml`](../../.github/dependabot.yml) has a comment
acknowledging this gap.

Phase 1 of the refactor plan
([`docs/source-refactor-plan.md`](../source-refactor-plan.md))
extracts the Swift half into a `grabit-vision` shim. That is the
right moment to also drop CocoaPods.

## Decision

Phase 1 of the source refactor replaces CocoaPods with Swift Package
Manager. The `Pods/` directory and `Podfile*` files are removed.
Dependencies (ArgumentParserKit, ScreenCapture) become SPM package
dependencies of the new `grabit-vision` target.

## Options considered

### Option A — Migrate to SPM in Phase 1 (chosen)
- Convert `.xcworkspace` + `Pods/` layout to an SPM package.
- **Pro:** Native Dependabot support. Cleaner tree (no vendored
  `Pods/` directory). Aligns with Apple's current recommendation.
  Faster CI (no `pod install` step). Retires a comment-flagged gap
  in the dependabot config.
- **Con:** ArgumentParserKit's SPM support needs verifying — it may
  not publish an SPM manifest, in which case we consume it as a
  git-URL dependency or vendor a minimal replacement.

### Option B — Keep CocoaPods through v2.0.0
- Ship the refactor without changing dependency management.
- **Pro:** Smaller Phase 1 diff.
- **Con:** Perpetuates a dead ecosystem. Leaves the Dependabot gap
  open. Future contributors have to learn CocoaPods to build.

### Option C — Drop both dependencies entirely
- Rewrite argument parsing in-house (the shim will be much smaller
  than the current CLI, so `ArgumentParserKit` may be overkill).
  Absorb ScreenCapture's ~200 lines into the shim.
- **Pro:** Zero third-party Swift deps. Smallest possible attack
  surface.
- **Con:** Argument parsing is a solved problem; reinventing it is a
  distraction. ScreenCapture's absorption is defensible but adds
  Phase 1 scope.

## Rationale

- SPM is the correct current tool for Swift dependency management.
  There is no strategic reason to keep CocoaPods.
- Phase 1 already touches the Swift target structure. Adding the SPM
  migration to the same phase is cheaper than doing it as a separate
  cleanup later.
- Option C (drop deps entirely) is worth revisiting in a future ADR
  once the shim's actual dependency footprint is known post-Phase 1.

## Consequences

- **Positive:** Native Dependabot coverage for Swift dependencies.
  `Pods/` directory retired. CI drops the `pod install` step.
  Contributors do not need Ruby / CocoaPods installed to build.
- **Negative:** Small Phase 1 scope expansion. Existing CocoaPods
  users forking pre-migration branches see divergence.
- **Neutral:** Package.swift replaces Podfile as the manifest of
  record.

## Validation

- `swift build` succeeds against `grabit-vision` target with no
  reference to CocoaPods.
- Dependabot opens PRs for outdated SPM dependencies within one
  weekly cycle after Phase 1 lands.
- The `.github/dependabot.yml` comment about CocoaPods is removed
  in the same PR that lands the migration.

## Related

- [ADR 0001](0001-two-binary-split.md) — architecture.
- Dependabot config: [`.github/dependabot.yml`](../../.github/dependabot.yml).
