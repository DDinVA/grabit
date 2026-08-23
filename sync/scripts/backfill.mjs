// scripts/backfill.mjs
//
// Backfill every existing GitHub issue in DDinVA/grabit into YouTrack project GRA.
// Safe to re-run: existing mappings are skipped or patched if drifted.
//
// Usage:
//   YOUTRACK_URL=... YOUTRACK_TOKEN=... GITHUB_TOKEN=... node scripts/backfill.mjs
//
//   Idempotent — re-running updates drifted tickets in place.

import { GitHubClient } from '../src/github/client.mjs';
import { YouTrackClient } from '../src/youtrack/client.mjs';
import { MappingStore } from '../src/state/db.mjs';

const SLEEP_MS = 250;

const env = process.env;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function required(name) {
  const v = env[name];
  if (!v) {
    console.error(`[BACKFILL] ERROR: missing required env ${name}`);
    process.exit(1);
  }
  return v;
}

function first60(s) {
  if (!s) return '';
  return s.length <= 60 ? s : s.slice(0, 60);
}

// Extract type/* area/* priority/* status/* labels into structured values.
function extractLabels(labels) {
  const out = { types: [], areas: [], priorities: [], statuses: [] };
  if (!Array.isArray(labels)) return out;
  for (const l of labels) {
    const name = typeof l === 'string' ? l : l.name;
    if (!name) continue;
    if (name.startsWith('type/')) out.types.push(name.slice('type/'.length));
    else if (name.startsWith('area/')) out.areas.push(name.slice('area/'.length));
    else if (name.startsWith('priority/')) out.priorities.push(name.slice('priority/'.length));
    else if (name.startsWith('status/')) out.statuses.push(name.slice('status/'.length));
  }
  return out;
}

// Build YouTrack customFields map from a GitHub issue. Returns the CLIENT-LAYER
// shape ({ FieldName: value } — single strings or arrays), not the wire shape.
// The client's buildCustomFieldsWire() translates this to YouTrack's discriminated
// customFields array on the way out.
function buildCustomFields(issue) {
  const { types, areas, priorities, statuses } = extractLabels(issue.labels);
  const out = {};

  // Type (single) — keep the full "type/foo" name to match GRA bundle values.
  if (types.length === 1) out.Type = `type/${types[0]}`;

  // Area — GRA has Area as single-value enum (see sync/docs/gra-project-state.md).
  // If GH issue has multiple area/* labels, promote the first to the Area field.
  // Additional areas are handled downstream by the sync service via issue tags.
  if (areas.length >= 1) out.Area = `area/${areas[0]}`;

  // Priority (single)
  if (priorities.length === 1) out.Priority = `priority/${priorities[0]}`;

  // Stage (state, single): closed => "resolved" overrides any status/*
  if (issue.state === "closed") {
    out.Stage = "resolved";
  } else if (statuses.length === 1) {
    out.Stage = `status/${statuses[0]}`;
  }

  return out;
}

// Build the body (description) for a YouTrack ticket.
function buildDescription(issue) {
  const prefix = `> Mirrored from https://github.com/DDinVA/grabit/issues/${issue.number}`;
  const body = issue.body || '';
  return `${prefix}\n\n${body}`.trim();
}

// Compute the desired YouTrack field values for drift detection/patching.
function buildDesiredFields(issue) {
  return {
    summary: issue.title || '',
    description: buildDescription(issue),
    customFields: extractLabels(issue.labels),
    state: issue.state === 'closed' ? 'resolved' : null,
  };
}

// Normalize a stored customField list to { name: value } for comparison.
function normalizeStoredFields(customFields) {
  const norm = {};
  if (!Array.isArray(customFields)) return norm;
  for (const f of customFields) {
    const name = f.name || f.field?.name;
    let val = f.value;
    if (Array.isArray(val)) {
      val = val.map((v) => (typeof v === 'string' ? v : v.name)).sort();
    } else if (val && typeof val === 'object') {
      val = val.name;
    }
    if (name) norm[name] = val;
  }
  return norm;
}

// Determine whether the existing YT ticket has drifted from desired GitHub state.
// After the client-layer refactor, YT's flattened customFields carry the FULL
// bundle name (e.g. "type/feat", "area/reflow"), not the bare suffix. So we
// compare against buildCustomFields() output directly instead of re-deriving.
function hasDrifted(issue, existingTicket) {
  if (issue.title !== existingTicket.summary) return true;

  const desiredDesc = buildDescription(issue);
  if (desiredDesc !== (existingTicket.description || "")) return true;

  const desired = buildCustomFields(issue);
  const stored = existingTicket.customFields || {};

  for (const key of ["Type", "Area", "Priority", "Stage"]) {
    const d = desired[key] ?? null;
    // storedValue can be string (single) or array (multi) or null
    const s = stored[key] ?? null;
    const storedNorm = Array.isArray(s) ? (s[0] ?? null) : s;
    if (d !== storedNorm) return true;
  }
  return false;
}

async function main() {
  const githubToken = required('GITHUB_TOKEN');
  const youtrackUrl = required('YOUTRACK_URL');
  const youtrackToken = required('YOUTRACK_TOKEN');
  const youtrackProject = env.YOUTRACK_PROJECT || 'GRA';
  const stateDb = env.STATE_DB || '/var/lib/grabit-sync/state.db';

  const gh = new GitHubClient({ token: githubToken, owner: "DDinVA", repo: "grabit" });
  const yt = new YouTrackClient({ baseUrl: youtrackUrl, token: youtrackToken, project: youtrackProject });
  const store = new MappingStore(stateDb);

  let issues = [];
  try {
    issues = await gh.listIssues({ state: 'all' });
  } catch (err) {
    console.error(`[BACKFILL] FATAL: could not list GitHub issues: ${err.message}`);
    process.exit(1);
  }

  const errors = [];

  for (const issue of issues) {
    if (!issue || typeof issue.number !== 'number') continue;
    const n = issue.number;
    const summary60 = first60(issue.title || '');

    // Check existing mapping
    let existing;
    try {
      existing = store.getByGithub(n);
    } catch (err) {
      console.error(`[BACKFILL] GH#${n}: mapping store error: ${err.message}`);
      errors.push({ n, error: `mapping store error: ${err.message}` });
      continue;
    }

    if (existing && existing.youtrack_readable_id) {
      // Mapping exists — check drift, PATCH if needed. YT's getIssue expects
      // the readable id ("GRA-5"), which we stored alongside the internal id.
      const ytReadable = existing.youtrack_readable_id;
      let existingTicket;
      try {
        existingTicket = await yt.getIssue(ytReadable);
      } catch (err) {
        console.error(`[BACKFILL] GH#${n}: could not fetch YT ${ytReadable}: ${err.message}`);
        errors.push({ n, error: `fetch YT: ${err.message}` });
        continue;
      }

      if (hasDrifted(issue, existingTicket)) {
        try {
          const customFields = buildCustomFields(issue);
          await yt.updateIssue(ytReadable, {
            summary: issue.title || "",
            description: buildDescription(issue),
            customFields,
          });
          console.log(`[BACKFILL] GH#${n} -> ${ytReadable} (patched) (${summary60})`);
        } catch (err) {
          console.error(`[BACKFILL] GH#${n}: patch failed: ${err.message}`);
          errors.push({ n, error: `patch: ${err.message}` });
        }
      } else {
        console.log(`[BACKFILL] GH#${n} -> ${ytReadable} (skip) (${summary60})`);
      }
      await sleep(SLEEP_MS);
      continue;
    }

    // No mapping — create new YouTrack ticket
    try {
      const customFields = buildCustomFields(issue, yt, youtrackProject);
      const created = await yt.createIssue({
        project: { id: youtrackProject },
        summary: issue.title || '',
        description: buildDescription(issue),
        customFields,
      });

      const ytId = created.id;
      const ytReadable = created.idReadable;
      store.put({
        githubIssueNumber: n,
        youtrackId: ytId,
        youtrackReadableId: ytReadable,
      });
      console.log(`[BACKFILL] GH#${n} -> ${ytReadable} (created) (${summary60})`);
    } catch (err) {
      console.error(`[BACKFILL] GH#${n}: create failed: ${err.message}`);
      errors.push({ n, error: `create: ${err.message}` });
    }
    await sleep(SLEEP_MS);
  }

  if (errors.length > 0) {
    console.error(`\n[BACKFILL] Completed with ${errors.length} error(s):`);
    for (const e of errors) {
      console.error(`[BACKFILL]   GH#${e.n}: ${e.error}`);
    }
    process.exit(1);
  }

  console.log(`[BACKFILL] Done. Processed ${issues.length} issue(s).`);
}

main().catch((err) => {
  console.error(`[BACKFILL] FATAL: ${err.stack || err.message || err}`);
  process.exit(1);
});
