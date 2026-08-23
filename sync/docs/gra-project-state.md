# YouTrack `GRA` project — current state

Snapshot captured 2026-08-23 via authenticated introspection.
Used by `scripts/provision-youtrack.mjs` and the sync service to know
which fields to create, repurpose, or leave alone.

**Do not commit tokens.** All API calls in this doc were run against
`https://netsecdev.youtrack.cloud/api/*` with a Bearer token owned by
`gray_beard` (netsec_admin, `doug.downer@dynecon.com`).

## Project metadata

| Field | Value |
|---|---|
| shortName | `GRA` |
| id | `0-12` |
| name | `grabit` |
| archived | false |
| leader | `gray_beard` |
| description | (empty) |
| issues (existing) | 0 |

## Existing custom fields (default YouTrack scheme)

| # | Name | Type | Multi | Values | Notes |
|---|---|---|---|---|---|
| 0 | Priority | `enum[1]` | no | 11 (Show-stopper, Critical, Major, Normal, Minor, …) | **Repurpose:** replace values with `priority/high|medium|low`. |
| 1 | Type | `enum[1]` | no | 8 (Bug, Cosmetics, Exception, Feature, Task, …) | **Repurpose:** replace with `type/feat|fix|docs|chore|refactor|test`. |
| 2 | Stage | `state[1]` | no | 12 (Submitted, Open, In Progress, …) | **Repurpose as Status:** replace with `status/triage|needs-repro|needs-review|in-progress|blocked|resolved|wontfix`. |
| 3 | Subsystem | `ownedField[1]` | no | 0 | **Leave** — unused, harmless. |
| 4 | Fix versions | `version[*]` | yes | 0 | **Leave** — useful when grabit ships versioned milestones. |
| 5 | Affected versions | `version[*]` | yes | 0 | **Leave.** |
| 6 | Fixed in build | `build[1]` | no | 0 | **Leave.** |
| 7 | Assignee | `user[1]` | no | 1 (grabit Team) | **Leave** — mapped from GitHub assignee on sync. |

## What's missing

- **Area** field — not present. Must be created as `enum[*]` (multi-value) to
  hold `area/reflow`, `area/vision`, `area/readme`, `area/refactor-plan`,
  `area/contributing`, `area/security`, `area/ci`, `area/install`,
  `area/rebrand`, `area/governance`, `area/build`, `area/adr`,
  `area/spec`, `area/sync`.
- Values inside the repurposed Type / Priority / Stage bundles.

## API contract (as observed)

- Auth: `Authorization: Bearer perm-<base64>.<base64>.<base64>` on every request.
- Base: `https://netsecdev.youtrack.cloud/api/`
- Fields param uses YouTrack's nested-`fields` DSL:
  `?fields=id,name,customFields(id,field(name),bundle(id,values(name,color(background,foreground))))`
- Bundles are org-scoped, not project-scoped: creating a new value for
  `Priority` here would affect every YouTrack project that uses the
  same bundle. **We must create GRA-scoped bundles** rather than mutating
  the default ones. `POST /admin/customFieldSettings/bundles/enum` with
  `{name: "grabit priorities", values: [...]}`, then attach via
  `POST /admin/projects/0-12/customFields`.

## Provisioning plan (idempotent)

Execute in `scripts/provision-youtrack.mjs`:

1. For each of `{Type, Priority, Status(=Stage), Area}`:
   a. Check if a GRA-owned bundle by name `grabit ${name}` exists.
   b. If not, create it with the values from `.github/labels.md`.
   c. Attach it to the GRA custom field, replacing the default bundle.
2. For `Area` specifically, create a new `enum[*]` custom field on GRA
   pointing at the new bundle.
3. Detach or hide unused default fields (`Subsystem`) via
   `PATCH /admin/projects/0-12/customFields/{id}` with `canBeEmpty=true`
   and `isPublic=false`.

The provision script is safe to re-run: every step checks state before
mutating.
