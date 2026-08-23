# grabit-sync

Bidirectional sync bridge between grabit's public GitHub Issues
([`DDinVA/grabit`](https://github.com/DDinVA/grabit)) and the private
governance tracker in YouTrack
([`GRA`](https://netsecdev.youtrack.cloud/projects/GRA)).

Documented decision: [ADR 0008](../docs/adr/0008-youtrack-for-durable-tracking.md).
Tracking issue: [DDinVA/grabit#9](https://github.com/DDinVA/grabit/issues/9).

## What it does

- **GitHub → YouTrack:** every issue create/edit/comment/close on the
  public repo mirrors into a matching YouTrack ticket. Labels map to
  YouTrack custom fields per the vocabulary in
  [`.github/labels.md`](../.github/labels.md).
- **YouTrack → GitHub:** state changes and comments made by
  maintainers in YouTrack post back onto the GitHub issue. Confidential
  security-advisory tickets stay YouTrack-only (never leak public).

## Architecture

```
┌──────────────────┐    webhook     ┌─────────────────────┐    REST     ┌──────────────────────┐
│  GitHub Issues   │ ───────────▶   │  grabit-sync        │ ──────────▶ │  YouTrack (GRA)      │
│  DDinVA/grabit   │                │  Node.js service    │             │  netsecdev.yt.cloud  │
│                  │  ◀───────────  │  systemd on VPS     │  ◀────────  │                      │
└──────────────────┘   REST         └─────────────────────┘   webhook   └──────────────────────┘
```

- Runs on the VPS as a `systemd --user` service alongside signal-cli-rest-api.
- Listens on `localhost:9987` (behind Caddy at `sync.silas-ai.io` for
  the GitHub webhook side; YouTrack webhooks post inbound over the
  same TLS-terminated endpoint).
- State (issue ID ↔ ticket ID mapping) in a small SQLite database at
  `~/.grabit-sync/state.db`.

## Credentials

Loaded from `/etc/grabit-sync/env` at service start:

- `GITHUB_TOKEN` — fine-grained PAT scoped to `DDinVA/grabit` with
  `Issues: read+write` and `Metadata: read`.
- `GITHUB_WEBHOOK_SECRET` — random 32-byte hex used to verify webhook
  signatures. Configured in both `.github/settings/webhook.yml` and
  the env file.
- `YOUTRACK_URL` — `https://netsecdev.youtrack.cloud`.
- `YOUTRACK_TOKEN` — permanent API token from
  https://netsecdev.youtrack.cloud/users/me?tab=account-security.
- `YOUTRACK_PROJECT` — `GRA` (grabit's project shortName).

**Nothing here goes in the repo.** The env file lives at
`/etc/grabit-sync/env` with `0600` perms owned by the `grabit-sync`
service user.

## Deployment

```bash
# One-time on the VPS:
sudo useradd -r -s /usr/sbin/nologin grabit-sync
sudo mkdir -p /etc/grabit-sync /var/lib/grabit-sync
sudo chown grabit-sync:grabit-sync /etc/grabit-sync /var/lib/grabit-sync
sudo chmod 0700 /etc/grabit-sync

# Populate /etc/grabit-sync/env with the six variables above.

# Install the service:
cd sync
npm ci --omit=dev
sudo cp systemd/grabit-sync.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now grabit-sync
sudo systemctl status grabit-sync
```

## Provisioning YouTrack

Before first run, the `GRA` project needs custom fields that mirror
grabit's label taxonomy. `scripts/provision-youtrack.mjs` does this
idempotently:

```bash
node scripts/provision-youtrack.mjs
```

It creates:

- Custom fields: `Type`, `Area`, `Priority`, `Status` (multi-select
  for `Area`, single-select for the others).
- Values inside each field matching the labels in
  [`.github/labels.md`](../.github/labels.md).
- Column colors matching the GitHub label colors (muted-fintech
  palette).

## Initial backfill

After provisioning, one-shot backfill of existing GitHub issues:

```bash
node scripts/backfill.mjs
```

This walks `DDinVA/grabit` issues #1..#N, creates a matching YouTrack
ticket for each, writes the mapping into
`/var/lib/grabit-sync/state.db`, and comments on the GitHub issue
with the YouTrack link.

## Security posture

- Webhook signatures verified against `GITHUB_WEBHOOK_SECRET` before
  any state changes. Unsigned requests are rejected with 401.
- YouTrack API token has project-scoped permissions on `GRA` only.
  Not an admin token.
- No pixels, screenshots, or user-content data ever transits this
  service. It handles issue titles, bodies, labels, comments — text
  that is already public on GitHub Issues.
- Confidential YouTrack tickets (marked with the built-in
  `Visibility: Restricted` field) never mirror out to GitHub. This
  is the pathway for security advisories under embargo — kept
  entirely inside YouTrack until the advisory ships publicly.

## Status

- **Design:** complete (this document + ADR 0008).
- **Code:** stub only. See `scripts/provision-youtrack.mjs` and
  `src/`.
- **Blocked on:** YouTrack API token handoff. See tracking issue
  [#9](https://github.com/DDinVA/grabit/issues/9).
