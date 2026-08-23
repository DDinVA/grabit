#!/usr/bin/env node
/**
 * grabit-sync :: provision-youtrack
 *
 * Configure the GRA project's custom-field bundles to match grabit's
 * label taxonomy. Idempotent — safe to re-run; every step checks state
 * before mutating.
 *
 * Required env:
 *   YOUTRACK_URL      e.g. https://netsecdev.youtrack.cloud
 *   YOUTRACK_TOKEN    permanent PAT (perm-*.*.*)
 *   YOUTRACK_PROJECT  short name, default "GRA"
 *
 * Reference: sync/docs/gra-project-state.md
 */

const YT_URL = process.env.YOUTRACK_URL;
const YT_TOKEN = process.env.YOUTRACK_TOKEN;
const YT_PROJECT = process.env.YOUTRACK_PROJECT ?? "GRA";

if (!YT_URL || !YT_TOKEN) {
  console.error("Missing YOUTRACK_URL or YOUTRACK_TOKEN.");
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Taxonomy — single source of truth mirroring .github/labels.md.
// Colors match GitHub's hex values so the two surfaces read identically.
// ---------------------------------------------------------------------------

const TYPE_VALUES = [
  { name: "type/feat",     color: { background: "#0969DA", foreground: "#FFFFFF" }, description: "New user-facing capability" },
  { name: "type/fix",      color: { background: "#D1242F", foreground: "#FFFFFF" }, description: "Bug fix" },
  { name: "type/docs",     color: { background: "#0A3069", foreground: "#FFFFFF" }, description: "Documentation only" },
  { name: "type/chore",    color: { background: "#6E7681", foreground: "#FFFFFF" }, description: "Maintenance, no user-visible change" },
  { name: "type/refactor", color: { background: "#6E7681", foreground: "#FFFFFF" }, description: "Code restructure, no behaviour change" },
  { name: "type/test",     color: { background: "#0969DA", foreground: "#FFFFFF" }, description: "Tests, fixtures, harness" },
];

const AREA_VALUES = [
  "area/reflow", "area/vision", "area/readme", "area/refactor-plan",
  "area/contributing", "area/security", "area/ci", "area/install",
  "area/rebrand", "area/governance", "area/build", "area/adr",
  "area/spec", "area/sync",
].map((name) => ({
  name,
  color: name === "area/security"
    ? { background: "#B62324", foreground: "#FFFFFF" }
    : name.match(/^area\/(reflow|vision)$/)
      ? { background: "#6E7681", foreground: "#FFFFFF" }
      : name.match(/^area\/(readme|refactor-plan|contributing|governance|adr|spec)$/)
        ? { background: "#8B949E", foreground: "#000000" }
        : { background: "#4C5563", foreground: "#FFFFFF" },
}));

const PRIORITY_VALUES = [
  { name: "priority/high",   color: { background: "#D1242F", foreground: "#FFFFFF" } },
  { name: "priority/medium", color: { background: "#FBCA04", foreground: "#000000" } },
  { name: "priority/low",    color: { background: "#8B949E", foreground: "#000000" } },
];

const STATUS_VALUES = [
  { name: "status/triage",       color: { background: "#FBCA04", foreground: "#000000" }, isResolved: false },
  { name: "status/needs-repro",  color: { background: "#FBCA04", foreground: "#000000" }, isResolved: false },
  { name: "status/needs-review", color: { background: "#0969DA", foreground: "#FFFFFF" }, isResolved: false },
  { name: "status/in-progress",  color: { background: "#0969DA", foreground: "#FFFFFF" }, isResolved: false },
  { name: "status/blocked",      color: { background: "#D1242F", foreground: "#FFFFFF" }, isResolved: false },
  { name: "resolved",            color: { background: "#1F883D", foreground: "#FFFFFF" }, isResolved: true  },
  { name: "wontfix",             color: { background: "#FFFFFF", foreground: "#000000" }, isResolved: true  },
];

// ---------------------------------------------------------------------------
// REST helpers
// ---------------------------------------------------------------------------

async function yt(method, path, body) {
  const res = await fetch(`${YT_URL}/api${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${YT_TOKEN}`,
      "Accept": "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`YT ${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

// ---------------------------------------------------------------------------
// Bundle helpers — bundles are org-scoped, so we name them "grabit ${field}"
// to keep them out of every other project's field editor.
// ---------------------------------------------------------------------------

async function ensureBundle(kind, bundleName, wantedValues) {
  // kind is "enum" or "state"
  const endpoint = `/admin/customFieldSettings/bundles/${kind}`;
  const existing = await yt("GET", `${endpoint}?fields=id,name,values(id,name)&$top=500`);
  let bundle = existing.find((b) => b.name === bundleName);

  if (!bundle) {
    console.log(`  creating ${kind} bundle "${bundleName}"`);
    bundle = await yt("POST", `${endpoint}?fields=id,name,values(id,name)`, {
      name: bundleName,
      values: [],
      $type: kind === "state" ? "StateBundle" : "EnumBundle",
    });
  } else {
    console.log(`  bundle "${bundleName}" exists (id=${bundle.id}, ${bundle.values?.length ?? 0} values)`);
  }

  // Add missing values
  const have = new Set((bundle.values ?? []).map((v) => v.name));
  const valueType = kind === "state" ? "StateBundleElement" : "EnumBundleElement";
  for (const v of wantedValues) {
    if (have.has(v.name)) continue;
    console.log(`    + ${v.name}`);
    const payload = {
      name: v.name,
      $type: valueType,
      ...(v.description ? { description: v.description } : {}),
      ...(v.color ? { color: { ...v.color, $type: "FieldStyle" } } : {}),
      ...(kind === "state" && "isResolved" in v ? { isResolved: v.isResolved } : {}),
    };
    await yt("POST", `${endpoint}/${bundle.id}/values?fields=id,name`, payload);
  }
  return bundle;
}

// ---------------------------------------------------------------------------
// Custom-field attachment
// ---------------------------------------------------------------------------

async function ensureProjectField(projectId, fieldName, fieldKind, multi, bundleId) {
  // fieldKind is one of "enum", "state"
  // fieldType id for issues: "enum[1]", "enum[*]", "state[1]"
  const fieldTypeId = fieldKind === "state" ? "state[1]" : (multi ? "enum[*]" : "enum[1]");

  // Existing project custom fields
  const proj = await yt("GET",
    `/admin/projects/${projectId}?fields=customFields(id,field(id,name,fieldType(id)))`);
  const existing = (proj.customFields ?? []).find((cf) => cf.field?.name === fieldName);

  if (existing) {
    // Detect type mismatch and repoint bundle
    console.log(`  field "${fieldName}" already attached to project (cf id=${existing.id})`);
    // Repoint at our bundle. Endpoint expects Project*Field type discriminator.
    const cfType = fieldKind === "state" ? "StateProjectCustomField"
      : (multi ? "MultiEnumProjectCustomField" : "SingleEnumProjectCustomField");
    await yt("POST", `/admin/projects/${projectId}/customFields/${existing.id}?fields=id,bundle(id)`, {
      $type: cfType,
      bundle: { id: bundleId, $type: fieldKind === "state" ? "StateBundle" : "EnumBundle" },
    });
    return existing.id;
  }

  // Field not attached — find or create the org-level custom-field definition
  const orgFields = await yt("GET",
    `/admin/customFieldSettings/customFields?fields=id,name,fieldType(id)&$top=500`);
  let orgField = orgFields.find((f) => f.name === fieldName && f.fieldType?.id === fieldTypeId);

  if (!orgField) {
    console.log(`  creating org-level field "${fieldName}" (${fieldTypeId})`);
    orgField = await yt("POST", `/admin/customFieldSettings/customFields?fields=id,name,fieldType(id)`, {
      name: fieldName,
      fieldType: { id: fieldTypeId },
    });
  }

  console.log(`  attaching "${fieldName}" to project`);
  const cfType = fieldKind === "state" ? "StateProjectCustomField"
    : (multi ? "MultiEnumProjectCustomField" : "SingleEnumProjectCustomField");
  const attached = await yt("POST", `/admin/projects/${projectId}/customFields?fields=id`, {
    $type: cfType,
    field: { id: orgField.id },
    bundle: { id: bundleId, $type: fieldKind === "state" ? "StateBundle" : "EnumBundle" },
    canBeEmpty: true,
  });
  return attached.id;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Provisioning ${YT_PROJECT} on ${YT_URL}`);

  const project = await yt("GET",
    `/admin/projects/${YT_PROJECT}?fields=id,shortName,name,customFields(id,field(name))`);
  console.log(`  project id=${project.id} name="${project.name}"`);

  console.log("\n[1/4] Type bundle");
  const typeBundle = await ensureBundle("enum", "grabit types", TYPE_VALUES);
  await ensureProjectField(project.id, "Type", "enum", false, typeBundle.id);

  console.log("\n[2/4] Priority bundle");
  const prioBundle = await ensureBundle("enum", "grabit priorities", PRIORITY_VALUES);
  await ensureProjectField(project.id, "Priority", "enum", false, prioBundle.id);

  console.log("\n[3/4] Status (Stage) bundle");
  const stageBundle = await ensureBundle("state", "grabit statuses", STATUS_VALUES);
  // YouTrack's default field is "Stage" not "Status" — repoint that.
  await ensureProjectField(project.id, "Stage", "state", false, stageBundle.id);

  console.log("\n[4/4] Area bundle (new field)");
  const areaBundle = await ensureBundle("enum", "grabit areas", AREA_VALUES);
  await ensureProjectField(project.id, "Area", "enum", true, areaBundle.id);

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
