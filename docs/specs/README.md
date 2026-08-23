# Specifications

Specs are the "what" that ADRs' "why" implies. ADRs decide direction;
specs pin down the exact shape.

Everything in this directory is a stable contract — either between
grabit's own components or between grabit and its users. Breaking a
spec is a versioned event.

## Contents

| Spec | Covers |
|---|---|
| [`vision-shim-protocol.md`](vision-shim-protocol.md) | JSON contract between the Rust CLI and the Swift `grabit-vision` shim. Implied by [ADR 0001](../adr/0001-two-binary-split.md) and [ADR 0004](../adr/0004-vision-shim-api-shape.md). To be written in Phase 1. |
| [`cli-stability.md`](cli-stability.md) | User-facing CLI stability contract — which flags and outputs are guaranteed, deprecation policy. To be written in Phase 3. |
| [`reflow-algorithm.md`](reflow-algorithm.md) | Invariants of the paragraph-reflow algorithm — same-row test, column-defence threshold, paragraph-break threshold. To be written in Phase 4 alongside the property tests. |

## Versioning

- Specs are versioned in their frontmatter.
- Minor version bumps for additions that keep old consumers working.
- Major version bumps for breaking changes, coordinated with the
  matching grabit release.
- Every version change ships with an ADR that supersedes or extends
  the prior decision.

## Relationship to ADRs

- **ADR** = "we chose Rust for reason X" — a decision.
- **Spec** = "the JSON request has fields Y and Z with these types" —
  a contract.
- An ADR without a downstream spec is fine (the decision affects
  process, not surface).
- A spec must trace back to at least one ADR that justifies its shape.
