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

## Decision

grabit uses a JetBrains YouTrack Cloud free-tier instance under a
DDinVA-owned JetBrains account as the durable tracker. GitHub Issues
remains the public entry point; a bidirectional sync mirrors each
GitHub issue to a YouTrack ticket and back.

## Options considered

### Option A — YouTrack Cloud free-tier under DDinVA (chosen)
- Fresh JetBrains account owned by DDinVA. Free tier: 10 users,
  100 MB storage, unlimited projects, all core features.
- Bidirectional sync via the official YouTrack-GitHub integration
  (open source, self-hostable, well-documented).
- **Pro:** Zero cost. Zero IP entanglement with any employer.
  Board views, Gantt, workflow automation, CVE embargo columns.
  Contributor-visible governance without corporate infrastructure
  in the URL bar.
- **Con:** One more system to keep credentials for. Free tier caps
  bite if grabit grows past 10 human collaborators.

### Option B — Corporate YouTrack instance
- Use an existing corporate YouTrack.
- **Pro:** Zero setup.
- **Con:** IP contamination risk (corporate tracker as paper trail
  for personal-OSS work product). Corporate acceptable-use policies
  typically prohibit personal-project use. Contributor confidence
  drops — an Adobe-branded URL on a public OSS project raises
  legitimate questions about the project's independence. Rejected.

### Option C — Linear
- Personal Linear workspace.
- **Pro:** Cleaner UX than YouTrack. First-class GitHub sync.
- **Con:** Paid past 10 issues on the free tier. Weaker on
  CVE-embargo / security-advisory workflows than YouTrack. Less
  flexible custom-field system.

### Option D — GitHub Projects v2 only
- Stay entirely inside GitHub.
- **Pro:** No external tracker. Zero credential surface.
- **Con:** Weaker board views than a dedicated tracker. No native
  concept of a security-advisory workflow separate from public
  issues. No cross-project rollup if grabit gains sibling projects.

### Option E — Defer
- Governance stays on GitHub Issues alone for now.
- **Pro:** Least effort.
- **Con:** Board-level roadmap communication depends on manual
  README updates. Contributor-facing legitimacy signal is weaker.

## Rationale

- The IP concern with Option B is a real risk, not a theoretical
  one. Personal OSS tracked on corporate infrastructure has been
  the flashpoint in multiple recent employer-employee IP disputes.
- YouTrack free-tier under a personal JetBrains account has zero
  employer exposure and every feature grabit's governance needs.
- Bidirectional sync means GitHub stays the public entry point.
  Contributors do not need YouTrack access; maintainers use it for
  board views and workflow automation.
- Deferring (Option E) is defensible but the setup cost is small
  and the legitimacy signal is worth paying for now, before real
  contributors arrive.

## Consequences

- **Positive:** Board-level roadmap view. First-class security
  advisory workflow with embargo columns. Custom fields for ADR
  status tracking. Contributor-facing signal that grabit is
  actively managed.
- **Negative:** One more system to keep credentials for. Sync
  glue is another moving part.
- **Neutral:** GitHub Issues remains authoritative for the public.
  The sync makes YouTrack an implementation detail from a
  contributor's perspective.

## Validation

- YouTrack Cloud instance provisioned at `ddinva.youtrack.cloud`
  (or equivalent).
- Project `GRABIT` created with columns matching grabit's `status/*`
  labels.
- Bidirectional sync active — creating a GitHub issue creates a
  YouTrack ticket within 60 seconds and vice versa.
- Each existing ADR tracking issue (#2 through #8) has a matching
  YouTrack ticket.
- API token for sync stored in GitHub Actions secrets, not in the
  repo.

## Related

- All existing ADRs — each has a tracking issue that this ADR turns
  into a YouTrack-mirrored ticket.
- Security workflow: YouTrack embargo columns pair with the GitHub
  Security Advisory channel documented in [`SECURITY.md`](../../SECURITY.md).
