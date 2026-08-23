# grabit governance

grabit runs on three interlocking documents:

1. **[ADRs](adr/README.md)** — versioned architectural decisions. The "why".
2. **[Specs](specs/README.md)** — stable contracts between grabit and its users, or between grabit's own components. The "what".
3. **[CONTRIBUTING.md](../CONTRIBUTING.md) + [SECURITY.md](../SECURITY.md) + [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md)** — the process rules. The "how".

Together they define grabit as a spec-driven project — decisions are
made in the open, specs pin the surface, and process rules keep the
whole thing honest.

## Vocabulary

grabit uses one vocabulary across branches, commits, labels, ADRs, and
specs:

```
branch:  feat/reflow-markdown-mode
commit:  feat(reflow): markdown mode
labels:  type/feat  area/reflow
ADR:     0008-reflow-markdown-mode.md (when there's a decision to record)
spec:    docs/specs/reflow-algorithm.md (when there's a contract to freeze)
```

Type comes from `feat | fix | docs | chore | refactor | test`. Area
comes from `.github/labels.md`. Adding a new area means updating that
document first — everywhere else follows.

## Where things live

| Question | Look here |
|---|---|
| Why does grabit do X the way it does? | `docs/adr/` |
| What is the exact shape of Y? | `docs/specs/` |
| How do I contribute a change? | `CONTRIBUTING.md` |
| How do I report a security issue? | `SECURITY.md` |
| How do we talk to each other? | `CODE_OF_CONDUCT.md` |
| What does label X mean? | `.github/labels.md` |
| What is the roadmap? | Tracking issues linked from each ADR, plus [`docs/source-refactor-plan.md`](source-refactor-plan.md) for the current large piece of work. |

## External tracker

grabit's day-to-day tracking (open questions, spec work, security
review) is being migrated to a YouTrack project. Until that migration
lands:

- **GitHub Issues** is the source of truth for open work.
- Each ADR's tracking issue is the canonical link between the decision
  document and the work that validates it.
- The YouTrack migration itself will be an ADR when the destination
  instance is confirmed.
