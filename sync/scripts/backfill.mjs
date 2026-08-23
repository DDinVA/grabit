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

// Build YouTrack customFields payload from a GitHub issue.
function buildCustomFields(issue, youtrackClient, project) {
  const { types, areas, priorities, statuses } = extractLabels(issue.labels);
  const fields = [];

  // Type (single)
  if (types.length === 1) {
    fields.push({ name: 'Type', $type: 'EnumIssueField', value: { name: types[0] } });
  }

  // Area (multi)
  if (areas.length > 0) {
    fields.push({
      name: 'Area',
      $type: 'MultiEnumIssueField',
      value: areas.map((a) => ({ name: a })),
    });
  }

  // Priority (single)
  if (priorities.length === 1) {
    fields.push({ name: 'Priority', $type: 'EnumIssueField', value: { name: priorities[0] } });
  }

  // Status: closed -> "resolved" overrides status/*
  if (issue.state === 'closed') {
    fields.push({ name: 'State', $type: 'StateIssueField', value: { name: 'Resolved' } });
  } else if (statuses.length === 1) {
    fields.push({ name: 'State', $type: 'StateIssueField', value: { name: statuses[0] } });
  }

  return fields;
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
function hasDrifted(issue, existingTicket) {
  if (issue.title !== existingTicket.summary) return true;

  const desiredDesc = buildDescription(issue);
  if (desiredDesc !== (existingTicket.description || '')) return true;

  const desired = extractLabels(issue.labels);
  const stored = normalizeStoredFields(existingTicket.customFields);

  // Type
  const desiredType = desired.types.length === 1 ? desired.types[0] : null;
  const storedType = stored['Type'] || null;
  if ((desiredType || null) !== (storedType || null)) return true;

  // Priority
  const desiredPri = desired.priorities.length === 1 ? desired.priorities[0] : null;
  const storedPri = stored['Priority'] || null;
  if ((desiredPri || null) !== (storedPri || null)) return true;

  // Area (multi)
  const desiredAreas = [...desired.areas].sort();
  const storedAreas = Array.isArray(stored['Area']) ? [...stored['Area']].sort() : [];
  if (JSON.stringify(desiredAreas) !== JSON.stringify(storedAreas)) return true;

  // State / Status
  const desiredState = issue.state === 'closed' ? 'Resolved' : desired.statuses.length === 1 ? desired.statuses[0] : null;
  const storedState = stored['State'] || stored['Status'] || null;
  if ((desiredState || null) !== (storedState || null)) return true;

  return false;
}

async function main() {
  const githubToken = required('GITHUB_TOKEN');
  const youtrackUrl = required('YOUTRACK_URL');
  const youtrackToken = required('YOUTRACK_TOKEN');
  const youtrackProject = env.YOUTRACK_PROJECT || 'GRA';
  const stateDb = env.STATE_DB || '/var/lib/grabit-sync/state.db';

  const gh = new GitHubClient({ token: githubToken, owner: 'DDinVA', repo: 'grabit' });
  const yt = new YouTrackClient({ url: youtrackUrl, token: youtrackToken, project: youtrackProject });
  const store = new MappingStore({ path: stateDb });
  await store.init();

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

    if (existing && existing.youtrack_id) {
      // Mapping exists — check drift, PATCH if needed
      let existingTicket;
      try {
        existingTicket = await yt.getIssue(existing.youtrack_id);
      } catch (err) {
        console.error(`[BACKFILL] GH#${n}: could not fetch YT ${existing.youtrack_id}: ${err.message}`);
        errors.push({ n, error: `fetch YT: ${err.message}` });
        continue;
      }

      if (hasDrifted(issue, existingTicket)) {
        try {
          const customFields = buildCustomFields(issue, yt, youtrackProject);
          await yt.updateIssue(existing.youtrack_id, {
            summary: issue.title || '',
            description: buildDescription(issue),
            customFields,
          });
          console.log(`[BACKFILL] GH#${n} -> ${existing.youtrack_id} (patched) (${summary60})`);
        } catch (err) {
          console.error(`[BACKFILL] GH#${n}: patch failed: ${err.message}`);
          errors.push({ n, error: `patch: ${err.message}` });
        }
      } else {
        console.log(`[BACKFILL] GH#${n} -> ${existing.youtrack_id} (skip) (${summary60})`);
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

      const ytId = created.id || created.number;
      await store.set({ github_number: n, youtrack_id: ytId });
      console.log(`[BACKFILL] GH#${n} -> ${ytId} (created) (${summary60})`);
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
