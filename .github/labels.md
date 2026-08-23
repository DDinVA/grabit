# Labels

grabit's labels mirror the commit-message vocabulary from
[CONTRIBUTING.md](../CONTRIBUTING.md#labels). A PR titled
`feat(reflow): markdown mode` should carry `type/feat` and
`area/reflow`. A PR titled `chore(ci): pin action versions` should
carry `type/chore` and `area/ci`.

Labels are additive — a PR that touches reflow logic and updates the
README and CI can carry `type/feat`, `area/reflow`, `area/readme`, and
`area/ci` at the same time.

## Type

Same vocabulary as the Conventional Commit type.

| Label | When to use |
|---|---|
| `type/feat` | New user-facing capability |
| `type/fix` | Bug fix |
| `type/docs` | Documentation only |
| `type/chore` | Maintenance, no user-visible change |
| `type/refactor` | Code restructure, no behaviour change |
| `type/test` | Tests, fixtures, harness |

## Area

Same vocabulary as the Conventional Commit area (the parenthesised
scope).

| Label | Scope |
|---|---|
| `area/reflow` | Text reflow algorithm and geometry |
| `area/vision` | Vision framework / capture / pasteboard (Swift core) |
| `area/readme` | README and user-facing docs |
| `area/refactor-plan` | Source refactor design and planning |
| `area/contributing` | CONTRIBUTING and governance docs |
| `area/security` | Security posture, threat model, SECURITY.md |
| `area/ci` | Workflows, actions, release automation |
| `area/install` | Install path, brew, tarballs, notarization |
| `area/rebrand` | Package identity, license attribution |
| `area/governance` | Community files: CoC, templates, support |
| `area/build` | Xcode / Swift Package Manager build tree |

New areas are added as the codebase grows. Add them here first, then
use them in commits.

## Status

Lifecycle state. Optional but useful for triage.

| Label | Meaning |
|---|---|
| `status/triage` | Awaiting maintainer triage. Applied automatically by issue templates. |
| `status/needs-repro` | Reporter has not provided enough to reproduce. |
| `status/blocked` | Blocked on an external factor (Apple bug, upstream dep, etc.). |
| `status/in-progress` | Someone is actively working on it. |
| `status/needs-review` | PR is ready for maintainer review. |

## Priority

Kept intentionally small.

| Label | Meaning |
|---|---|
| `priority/high` | Ship in current or next release |
| `priority/medium` | Ship within a couple of releases |
| `priority/low` | Nice to have, no deadline |

## Meta

These come from GitHub's default set and stay because they carry
semantic value:

- `duplicate` — this issue or PR already exists
- `invalid` — this does not appear to be a real issue
- `wontfix` — out of scope for grabit
- `question` — request for information rather than a change
- `good first issue` — small, well-scoped, contributor-friendly
- `help wanted` — extra attention is needed

## Rules

1. **Every issue and PR gets exactly one `type/*` label.** If the
   change spans multiple types, split the PR.
2. **Every issue and PR gets at least one `area/*` label.** Additive is
   fine.
3. **Status and priority are optional but encouraged.** Triage adds
   them; the reporter should not.
4. **If a commit type or area does not have a matching label, add the
   label first.** Do not merge a PR whose title references a label
   that does not exist.
