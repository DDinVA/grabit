# Architecture Decision Records

grabit uses ADRs to make its design decisions durable, reviewable, and
challengeable by future contributors.

An ADR is a short document that captures **one** decision, the
alternatives considered, the reasoning, and the consequences. ADRs are
numbered, immutable once accepted, and superseded (never edited or
deleted) when a decision changes.

This document explains the ADR process. The template lives at
[`0000-template.md`](0000-template.md).

## Why we use ADRs

- **Contributors and users need to know why grabit looks the way it
  does.** ADRs answer "why is the Vision half in Swift and everything
  else in a different language?" without anyone having to reconstruct
  the reasoning from commit history.
- **Decisions become challengeable.** Anyone can open an ADR that
  supersedes an existing one, with the reasoning laid out the same
  way. This is how the project changes direction without losing
  memory.
- **Reviews are structured.** A change that violates an accepted ADR
  should either update or supersede that ADR in the same PR, or
  explain why the ADR still holds.
- **Spec-driven work needs a decision layer.** ADRs are the "why";
  [`docs/specs/`](../specs/) is the "what" (protocol schemas, CLI
  stability contracts, algorithm invariants).

## Lifecycle

Every ADR starts in `proposed` state. It moves through the following
statuses:

| Status | Meaning |
|---|---|
| `proposed` | Draft. Open for review. May be revised. |
| `accepted` | Approved by maintainers. Frozen as-is. |
| `rejected` | Decision was not adopted. Frozen with the reasoning intact. |
| `superseded` | Replaced by a later ADR. Frozen. Links forward to the superseder. |
| `deprecated` | No longer applies (feature removed, project pivoted). Frozen. |

**Once an ADR is `accepted`, its text is immutable.** Changes are
made by writing a new ADR that supersedes it. This is deliberate — the
value of the ADR trail is that it preserves the reasoning at the time
of the decision.

## How to write one

1. Copy [`0000-template.md`](0000-template.md) to
   `NNNN-short-slug.md` where `NNNN` is the next unused four-digit
   number.
2. Fill in every section. Keep it under two pages. If it needs more,
   split into multiple ADRs.
3. Open a PR titled `docs(adr): NNNN <short-slug>`. Auto-labeler
   applies `type/docs` and `area/adr`.
4. The PR body should state the ADR's summary and link to any tracked
   issue.
5. Reviewers challenge on substance, not style. If accepted, merge
   with the ADR status changed from `proposed` to `accepted`.

## Rule: ADRs are enforced by review

If a PR changes behaviour that contradicts an accepted ADR, one of two
things must happen in the same PR:

- The ADR is superseded by a new ADR that documents the new decision, or
- The PR explains in its body why the existing ADR still holds and the
  change is compatible with it.

A PR that quietly violates an ADR should be blocked on review.

## Index

Current ADRs — see individual files for full text.

| ID | Title | Status |
|---|---|---|
| [0001](0001-two-binary-split.md) | Two-binary architecture (Vision shim + user CLI) | proposed |
| [0002](0002-rust-for-non-vision-half.md) | Rust for the non-Vision half | proposed |
| [0003](0003-pasteboard-access-strategy.md) | Pasteboard access strategy | proposed |
| [0004](0004-vision-shim-api-shape.md) | Vision shim API shape (request-response vs streaming) | proposed |
| [0005](0005-per-arch-binaries.md) | Per-arch binaries over universal2 | proposed |
| [0006](0006-notarization-timing.md) | Defer notarization until traction | proposed |
| [0007](0007-cocoapods-to-spm.md) | Migrate CocoaPods to Swift Package Manager | proposed |

All seven above are the open questions from
[`docs/source-refactor-plan.md`](../source-refactor-plan.md),
lifted into their own reviewable, trackable, supersedable records.
