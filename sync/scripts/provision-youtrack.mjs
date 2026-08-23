#!/usr/bin/env node
/**
 * grabit-sync :: provision-youtrack
 *
 * Idempotently configure the GRA project's custom fields and values to
 * mirror grabit's GitHub label taxonomy (see .github/labels.md).
 *
 * Requires env: YOUTRACK_URL, YOUTRACK_TOKEN, YOUTRACK_PROJECT (default "GRA").
 *
 * Safe to re-run. Reads the current state of each field and only creates
 * what does not exist.
 */

const YT_URL = process.env.YOUTRACK_URL;
const YT_TOKEN = process.env.YOUTRACK_TOKEN;
const YT_PROJECT = process.env.YOUTRACK_PROJECT ?? "GRA";

if (!YT_URL || !YT_TOKEN) {
  console.error("Missing YOUTRACK_URL or YOUTRACK_TOKEN in env.");
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Field taxonomy — mirrors .github/labels.md exactly.
// Colors are the GitHub label hex values so the two views look identical.
// ---------------------------------------------------------------------------

const FIELDS = [
  {
    name: "Type",
    type: "enum[1]", // single-value enum
    values: [
      { name: "type/feat",     color: { background: "#0969DA", foreground: "#FFFFFF" }, description: "New user-facing capability" },
      { name: "type/fix",      color: { background: "#D1242F", foreground: "#FFFFFF" }, description: "Bug fix" },
      { name: "type/docs",     color: { background: "#0A3069", foreground: "#FFFFFF" }, description: "Documentation only" },
      { name: "type/chore",    color: { background: "#6E7681", foreground: "#FFFFFF" }, description: "Maintenance, no user-visible change" },
      { name: "type/refactor", color: { background: "#6E7681", foreground: "#FFFFFF" }, description: "Code restructure, no behaviour change" },
      { name: "type/test",     color: { background: "#0969DA", foreground: "#FFFFFF" }, description: "Tests, fixtures, harness" },
    ],
  },
  {
    name: "Area",
    type: "enum[*]", // multi-value enum
    values: [
      { name: "area/reflow",         color: { background: "#6E7681", foreground: "#FFFFFF" } },
      { name: "area/vision",         color: { background: "#6E7681", foreground: "#FFFFFF" } },
      { name: "area/readme",         color: { background: "#8B949E", foreground: "#000000" } },
      { name: "area/refactor-plan",  color: { background: "#8B949E", foreground: "#000000" } },
      { name: "area/contributing",   color: { background: "#8B949E", foreground: "#000000" } },
      { name: "area/security",       color: { background: "#B62324", foreground: "#FFFFFF" } },
      { name: "area/ci",             color: { background: "#4C5563", foreground: "#FFFFFF" } },
      { name: "area/install",        color: { background: "#4C5563", foreground: "#FFFFFF" } },
      { name: "area/rebrand",        color: { background: "#4C5563", foreground: "#FFFFFF" } },
      { name: "area/governance",     color: { background: "#8B949E", foreground: "#000000" } },
      { name: "area/build",          color: { background: "#4C5563", foreground: "#FFFFFF" } },
      { name: "area/adr",            color: { background: "#8B949E", foreground: "#000000" } },
      { name: "area/spec",           color: { background: "#8B949E", foreground: "#000000" } },
      { name: "area/sync",           color: { background: "#4C5563", foreground: "#FFFFFF" } },
    ],
  },
  {
    name: "Priority",
    type: "enum[1]",
    values: [
      { name: "priority/high",   color: { background: "#D1242F", foreground: "#FFFFFF" } },
      { name: "priority/medium", color: { background: "#FBCA04", foreground: "#000000" } },
      { name: "priority/low",    color: { background: "#8B949E", foreground: "#000000" } },
    ],
  },
  {
    name: "Status",
    type: "state[1]", // YouTrack's native state field type
    values: [
      { name: "status/triage",       color: { background: "#FBCA04", foreground: "#000000" }, isResolved: false },
      { name: "status/needs-repro",  color: { background: "#FBCA04", foreground: "#000000" }, isResolved: false },
      { name: "status/needs-review", color: { background: "#0969DA", foreground: "#FFFFFF" }, isResolved: false },
      { name: "status/in-progress",  color: { background: "#0969DA", foreground: "#FFFFFF" }, isResolved: false },
      { name: "status/blocked",      color: { background: "#D1242F", foreground: "#FFFFFF" }, isResolved: false },
      { name: "resolved",            color: { background: "#1F883D", foreground: "#FFFFFF" }, isResolved: true  },
      { name: "wontfix",             color: { background: "#FFFFFF", foreground: "#000000" }, isResolved: true  },
    ],
  },
];

// ---------------------------------------------------------------------------
// YouTrack REST helpers
// ---------------------------------------------------------------------------

async function yt(method, path, body) {
  const res = await fetch(`${YT_URL}/api${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${YT_TOKEN}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YouTrack ${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  return ct.includes("json") ? res.json() : res.text();
}

async function getProject(shortName) {
  const projects = await yt("GET",
    `/admin/projects?fields=id,shortName,name,customFields(id,field(name),bundle(id))&$top=200`);
  const p = projects.find((p) => p.shortName === shortName);
  if (!p) throw new Error(`Project ${shortName} not found on ${YT_URL}`);
  return p;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Provisioning ${YT_PROJECT} on ${YT_URL}`);
  const project = await getProject(YT_PROJECT);
  console.log(`  project id: ${project.id}`);
  console.log(`  existing custom fields: ${project.customFields.map((f) => f.field.name).join(", ") || "(none)"}`);

  // Field/value creation is intentionally left as TODO here. The final
  // implementation needs the YouTrack API token to introspect the actual
  // enum-bundle shape, which varies by YouTrack instance configuration.
  //
  // Sketch of the loop once credentials land:
  //
  //   for (const spec of FIELDS) {
  //     const field = project.customFields.find((f) => f.field.name === spec.name)
  //                ?? await createCustomField(project, spec);
  //     for (const value of spec.values) {
  //       if (!bundleHasValue(field, value.name)) {
  //         await createBundleValue(field, value);
  //       }
  //     }
  //   }
  //
  // Reference: https://www.jetbrains.com/help/youtrack/devportal/api-usecase-bundle.html
  console.log("  (field/value creation deferred until API token is available; see FIELDS constant for target state)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
