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
// YouTrack colors are chosen from the fixed palette of FieldStyle IDs
// (see sync/docs/gra-project-state.md). We map to the closest hue rather
// than the exact GitHub hex, because YouTrack does not accept arbitrary
// colors on bundle values.
//
// Palette (id → bg / fg):
//    0 white/gray         10 green            12 magenta         13 orange
//   16 near-white         17 mint             18 amber           19 pink
//   20 red                21 sky              22 blush           27 slate
//   30 gray               34 brown
// ---------------------------------------------------------------------------

const STYLE = {
  RED:      20,  // errors, critical, blocked
  ORANGE:   13,  // triage / warning
  AMBER:    18,  // needs-attention
  GREEN:    10,  // resolved / positive
  MINT:     17,  // in-progress-adjacent
  SKY:      21,  // information / in-progress
  MAGENTA:  12,  // features
  PINK:     19,  // secondary
  SLATE:    27,  // area / neutral
  GRAY:     30,  // chore / low-priority
  BROWN:    34,  // build
  BLUSH:    22,  // docs
  NEUTRAL:   0,  // default
  NEAR:     16,  // minor
};

const TYPE_VALUES = [
  { name: "type/feat",     styleId: STYLE.SKY,     description: "New user-facing capability" },
  { name: "type/fix",      styleId: STYLE.RED,     description: "Bug fix" },
  { name: "type/docs",     styleId: STYLE.BLUSH,   description: "Documentation only" },
  { name: "type/chore",    styleId: STYLE.GRAY,    description: "Maintenance, no user-visible change" },
  { name: "type/refactor", styleId: STYLE.SLATE,   description: "Code restructure, no behaviour change" },
  { name: "type/test",     styleId: STYLE.MINT,    description: "Tests, fixtures, harness" },
];

const AREA_VALUES = [
  { name: "area/reflow",         styleId: STYLE.SLATE },
  { name: "area/vision",         styleId: STYLE.SLATE },
  { name: "area/readme",         styleId: STYLE.GRAY  },
  { name: "area/refactor-plan",  styleId: STYLE.GRAY  },
  { name: "area/contributing",   styleId: STYLE.GRAY  },
  { name: "area/security",       styleId: STYLE.RED   },
  { name: "area/ci",             styleId: STYLE.SLATE },
  { name: "area/install",        styleId: STYLE.SLATE },
  { name: "area/rebrand",        styleId: STYLE.SLATE },
  { name: "area/governance",     styleId: STYLE.GRAY  },
  { name: "area/build",          styleId: STYLE.BROWN },
  { name: "area/adr",            styleId: STYLE.GRAY  },
  { name: "area/spec",           styleId: STYLE.GRAY  },
  { name: "area/sync",           styleId: STYLE.SLATE },
];

const PRIORITY_VALUES = [
  { name: "priority/high",   styleId: STYLE.RED    },
  { name: "priority/medium", styleId: STYLE.AMBER  },
  { name: "priority/low",    styleId: STYLE.GRAY   },
];

const STATUS_VALUES = [
  { name: "status/triage",       styleId: STYLE.ORANGE, isResolved: false },
  { name: "status/needs-repro",  styleId: STYLE.AMBER,  isResolved: false },
  { name: "status/needs-review", styleId: STYLE.SKY,    isResolved: false },
  { name: "status/in-progress",  styleId: STYLE.SKY,    isResolved: false },
  { name: "status/blocked",      styleId: STYLE.RED,    isResolved: false },
  { name: "resolved",            styleId: STYLE.GREEN,  isResolved: true  },
  { name: "wontfix",             styleId: STYLE.NEUTRAL,isResolved: true  },
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
      ...(v.styleId !== undefined ? { color: { id: String(v.styleId), $type: "FieldStyle" } } : {}),
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
    // Repoint at our bundle. YT's Project*Field discriminators are:
    //   EnumProjectCustomField        (single-value enum)
    //   MultiEnumProjectCustomField   (multi-value enum)
    //   StateProjectCustomField       (single-value state)
    console.log(`  field "${fieldName}" already attached to project (cf id=${existing.id})`);
    const cfType = fieldKind === "state" ? "StateProjectCustomField"
      : (multi ? "MultiEnumProjectCustomField" : "EnumProjectCustomField");
    // canBeEmpty:true so backfill of GitHub issues that lack priority/type/status
    // labels doesn't 400 out on missing required field.
    await yt("POST", `/admin/projects/${projectId}/customFields/${existing.id}?fields=id,bundle(id)`, {
      $type: cfType,
      bundle: { id: bundleId, $type: fieldKind === "state" ? "StateBundle" : "EnumBundle" },
      canBeEmpty: true,
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
    : (multi ? "MultiEnumProjectCustomField" : "EnumProjectCustomField");
  const attached = await yt("POST", `/admin/projects/${projectId}/customFields?fields=id`, {
    $type: cfType,
    field: { id: orgField.id, $type: "CustomField" },
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

  console.log("\n[4/4] Area (single-value primary; extra areas mirrored to tags)");
  const areaBundle = await ensureBundle("enum", "grabit areas", AREA_VALUES);
  // Note: YouTrack multi-enum project attach is quirky on this instance's build.
  // Primary area lives as single-enum here; the sync service mirrors any
  // additional area/* labels to YT issue tags (which ARE first-class multi).
  await ensureProjectField(project.id, "Area", "enum", false, areaBundle.id);

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
