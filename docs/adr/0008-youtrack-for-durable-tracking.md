# ADR 0008 — YouTrack for durable governance tracking

- **Status:** proposed
- **Date proposed:** 2026-08-23
- **Date accepted:** —
- **Superseded by:** —
- **Tracking issue:** [DDinVA/grabit#9](https://github.com/DDinVA/grabit/issues/9)

## Context

grabit's governance layer (ADRs, specs, security advisories,
contribution triage) needs a durable tracker that outlives individual
GitHub issue threads and provides board-level views for roadmap
communication.

GitHub Issues is the source of truth for open work today. Every ADR
has a matching GitHub tracking issue, and the auto-labeler keeps
issues in sync with commit/PR vocabulary. This works for
issue-by-issue triage but does not give board views (Kanban, Gantt,
burndown) or CVE-style embargo workflows for security advisories.

A Dynecon-owned YouTrack Cloud instance already exists at
`netsecdev.youtrack.cloud`, hosting other DDinVA / Dynecon projects.
Adding grabit's `GRA` project there costs nothing incremental and
keeps grabit inside DDinVA's existing operational surface rather
than adding another vendor account.

## Decision

grabit uses the Dynecon-owned YouTrack Cloud instance at
`netsecdev.youtrack.cloud`, project `GRA`
([project URL](https://netsecdev.youtrack.cloud/projects/GRA)), as the
durable tracker. GitHub Issues remains the public entry point; a
bidirectional sync mirrors each GitHub issue to a YouTrack ticket and
back.

## Options considered

### Option A — Dynecon YouTrack, `GRA` project (chosen)
- Existing DDinVA-controlled instance at `netsecdev.youtrack.cloud`.
- Bidirectional sync via the official YouTrack-GitHub integration
  (Helpdesk / GitHub app, or a custom webhook if the app's
  granularity is insufficient).
- **Pro:** Zero incremental cost. Zero credential surface expansion
  beyond what DDinVA already manages. Inherits any custom fields,
  workflows, or reporting already set up for sibling projects.
  Board views, Gantt, workflow automation, CVE embargo columns —
  all available.
- **Con:** grabit is coupled to one Dynecon-owned system for its
  durable tracking. Mitigated by (a) GitHub Issues remaining the
  public source of truth and (b) YouTrack's own export tooling if
  the coupling ever needs unwinding.

### Option B — Fresh YouTrack Cloud free-tier under a personal account
- Provision a new JetBrains account and instance for grabit alone.
- **Pro:** Maximum isolation.
- **Con:** Extra credential surface for zero real gain when a
  DDinVA-owned instance already exists.

### Option C — Linear
- Personal Linear workspace.
- **Pro:** Cleaner UX than YouTrack.
- **Con:** Weaker on CVE-embargo / security-advisory workflows.
  Paid past 10 issues on the free tier. Duplicates a capability
  DDinVA already has.

### Option D — GitHub Projects v2 only
- Stay entirely inside GitHub.
- **Pro:** No external tracker.
- **Con:** Weaker board views. No native security-advisory workflow.
  No cross-project rollup if grabit gains sibling projects under
  DDinVA / Dynecon.

### Option E — Defer
- Governance stays on GitHub Issues alone for now.
- **Pro:** Least effort.
- **Con:** Board-level roadmap communication depends on manual
  README updates. Contributor-facing legitimacy signal is weaker.

## Rationale

- The Dynecon instance already exists, already has DDinVA custody,
  and the `GRA` project is already provisioned. There is no
  operational overhead to adopt it.
- YouTrack's advisory / embargo workflow is a real capability
  advantage over Option D, and grabit's `SECURITY.md` promises a
  serious disclosure process. YouTrack helps deliver it.
- GitHub Issues staying as the public source of truth via
  bidirectional sync means contributors never need YouTrack access.
  YouTrack is a maintainer productivity layer, not a contributor
  hurdle.

## Consequences

- **Positive:** Board-level roadmap view. First-class security
  advisory workflow with embargo columns. Custom fields for ADR
  status tracking. Sibling-project reporting alongside other
  DDinVA / Dynecon work.
- **Negative:** One more system to keep in sync. Sync glue is
  another moving part.
- **Neutral:** GitHub Issues remains authoritative for the public.
  The sync makes YouTrack an implementation detail from a
  contributor's perspective.

## Validation

- Project `GRA` exists at
  [`netsecdev.youtrack.cloud/projects/GRA`](https://netsecdev.youtrack.cloud/projects/GRA)
  with columns matching grabit's `status/*` labels.
- Bidirectional sync active — creating a GitHub issue creates a
  YouTrack ticket within 60 seconds and vice versa.
- Each existing ADR tracking issue (#2 through #9) has a matching
  YouTrack ticket.
- Sync API token stored in GitHub Actions secrets, not in the repo.
- Security-advisory workflow (embargo → coordinated-disclosure →
  public) documented in `SECURITY.md` addendum and wired to
  YouTrack columns.

## Related

- All existing ADRs — each has a tracking issue that this ADR turns
  into a YouTrack-mirrored ticket.
- Security workflow: YouTrack embargo columns pair with the GitHub
  Security Advisory channel documented in [`SECURITY.md`](../../SECURITY.md).
