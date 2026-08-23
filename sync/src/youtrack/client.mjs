// YouTrack Cloud REST client for grabit-sync.
// Scoped to a single project (GRA by default). No deps, ESM only.

// $type mapping: multi-value fields use the Multi* variant, everything else
// (incl. State/Status enums) uses the single-value variant. This mirrors the
// wire format YouTrack expects when creating/updating issues.
const SINGLE_TYPE = "SingleEnumIssueCustomField";
const MULTI_TYPE = "MultiEnumIssueCustomField";

// Status/Stage is a state-machine field, not a plain enum — YouTrack uses a
// distinct $type for it, and resolving/reopening works by writing to it.
const STATE_TYPE = "StateIssueCustomField";

const DEFAULT_FIELDS = [
  "id",
  "idReadable",
  "summary",
  "description",
  "resolved",
  "created",
  "updated",
  "reporter(login)",
  "customFields(name,value(name))",
].join(",");

// Flatten YouTrack's customFields array back to a { name: value } map.
// Single-value fields become strings, multi-value become arrays of names.
function flattenCustomFields(cfArray) {
  if (!Array.isArray(cfArray)) return {};
  const out = {};
  for (const field of cfArray) {
    const name = field.name;
    const val = field.value;
    if (val == null) {
      out[name] = null;
    } else if (Array.isArray(val)) {
      out[name] = val.map((v) => (v && typeof v === "object" ? v.name : v));
    } else if (typeof val === "object") {
      out[name] = val.name ?? null;
    } else {
      out[name] = val;
    }
  }
  return out;
}

// Normalize a single custom-field value (scalar or array) into the YouTrack
// wire-format value payload: {name} for scalars, [{name},...] for arrays.
function toValuePayload(value) {
  if (Array.isArray(value)) {
    return value.map((v) => ({ name: v }));
  }
  return { name: value };
}

// Pick the right $type for a field based on whether the input value is an array.
// Status/State is always the State type regardless of array-ness.
function fieldTypeFor(name, value) {
  if (name === "Status" || name === "Stage" || name === "Stage") return STATE_TYPE;
  return Array.isArray(value) ? MULTI_TYPE : SINGLE_TYPE;
}

// Build the customFields wire array from a { name: value } input map.
function buildCustomFieldsWire(customFields) {
  if (!customFields || Object.keys(customFields).length === 0) return undefined;
  return Object.entries(customFields).map(([name, value]) => ({
    name,
    $type: fieldTypeFor(name, value),
    value: toValuePayload(value),
  }));
}

// Shape a raw YouTrack issue into the grabit-sync canonical form.
function shapeIssue(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    idReadable: raw.idReadable,
    summary: raw.summary ?? null,
    description: raw.description ?? null,
    resolved: raw.resolved ?? null,
    created: raw.created ?? null,
    updated: raw.updated ?? null,
    reporter: raw.reporter?.login ?? null,
    customFields: flattenCustomFields(raw.customFields),
  };
}

// Identify which custom field is the state-machine field on an issue.
// YouTrack state fields typically carry values like "status/*"; we also
// accept the conventional names "Stage" / "Status" as a fallback so this
// works even when the current value hasn't been populated.
function findStateFieldName(customFields) {
  if (!customFields) return null;
  for (const [name, val] of Object.entries(customFields)) {
    const str = Array.isArray(val) ? val.join(",") : String(val ?? "");
    if (str.includes("status/")) return name;
  }
  if ("Stage" in customFields) return "Stage";
  if ("Status" in customFields) return "Status";
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Typed error carrying the HTTP status and raw body, so callers can branch on
// status (e.g. 404 → null) and inspect YouTrack's error_description.
export class YouTrackError extends Error {
  constructor(status, body, path) {
    let msg = `YouTrack API error ${status}`;
    let parsed = null;
    try {
      parsed = JSON.parse(body);
      if (parsed?.error) msg += `: ${parsed.error}`;
      if (parsed?.error_description) msg += ` — ${parsed.error_description}`;
    } catch {
      if (body) msg += `: ${body.slice(0, 200)}`;
    }
    super(msg);
    this.name = "YouTrackError";
    this.status = status;
    this.body = parsed ?? body;
    this.path = path;
  }
}

export class YouTrackClient {
  constructor({ baseUrl, token, project = "GRA" }) {
    if (!baseUrl) throw new TypeError("YouTrackClient: baseUrl is required");
    if (!token) throw new TypeError("YouTrackClient: token is required");
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
    this.project = project;
  }

  // Core fetch wrapper. Always sends Bearer + Accept. Mutations add
  // Content-Type. Throws a typed error on non-2xx, embedding the full body
  // so callers can inspect YouTrack's error/error_description.
  async _request(path, { method = "GET", body, query = {}, retry = false } = {}) {
    const url = new URL(`${this.baseUrl}/api/${path.replace(/^\//, "")}`);
    for (const [k, v] of Object.entries(query)) {
      if (v != null) url.searchParams.set(k, v);
    }

    const headers = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
    };
    const isMutation = method !== "GET" && method !== "HEAD";
    if (isMutation && body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const fetchOpts = { method, headers };
    if (body !== undefined) fetchOpts.body = JSON.stringify(body);

    // Retry only idempotent GETs on 5xx / 429. Mutations must surface errors
    // immediately — retrying a POST could duplicate a partially-applied write.
    const maxTries = retry ? 3 : 1;
    let lastErr;
    for (let attempt = 0; attempt < maxTries; attempt++) {
      if (attempt > 0) {
        // Exponential backoff 500ms → 2s → 8s between the 3 tries.
        const delay = 500 * Math.pow(4, attempt - 1);
        await sleep(delay);
      }
      let res;
      try {
        res = await fetch(url, fetchOpts);
      } catch (e) {
        // Network errors are retryable for GETs; record and retry.
        lastErr = e;
        continue;
      }

      if (res.ok) {
        if (res.status === 204) return null;
        return res.json();
      }

      // 429 / 5xx are retryable for GETs — don't throw yet, loop again.
      if (retry && (res.status === 429 || res.status >= 500)) {
        let text = "";
        try {
          text = await res.text();
        } catch {
          /* ignore body read failure */
        }
        lastErr = new YouTrackError(res.status, text, path);
        continue;
      }

      // Non-retryable: surface immediately with full body for diagnostics.
      let errText = "";
      try {
        errText = await res.text();
      } catch {
        /* ignore */
      }
      throw new YouTrackError(res.status, errText, path);
    }
    // Exhausted retries — throw the last error we captured.
    throw lastErr ?? new YouTrackError(0, "retry exhausted", path);
  }

  // --- project metadata ---

  async getProject() {
    return this._request(`admin/projects/${this.project}`, {
      query: {
        fields: "id,shortName,name,archived,customFields(name)",
      },
      retry: true,
    });
  }

  // --- issues ---

  async listIssues({ query = `project: ${this.project}` } = {}) {
    const all = [];
    let skip = 0;
    const top = 100;
    // Page until a short page arrives — that signals the tail.
    for (;;) {
      const page = await this._request("issues", {
        query: {
          fields: DEFAULT_FIELDS,
          $top: String(top),
          $skip: String(skip),
          query,
        },
        retry: true,
      });
      const items = Array.isArray(page) ? page : [];
      for (const raw of items) all.push(shapeIssue(raw));
      if (items.length < top) break;
      skip += top;
    }
    return all;
  }

  async getIssue(idReadable) {
    if (!idReadable) throw new TypeError("getIssue: idReadable is required");
    try {
      const raw = await this._request(`issues/${encodeURIComponent(idReadable)}`, {
        query: { fields: DEFAULT_FIELDS },
        retry: true,
      });
      return shapeIssue(raw);
    } catch (e) {
      // 404 is a normal "not found" — return null, let other errors throw.
      if (e instanceof YouTrackError && e.status === 404) return null;
      throw e;
    }
  }

  async createIssue({ summary, description, customFields = {} }) {
    if (!summary) throw new TypeError("createIssue: summary is required");
    const body = {
      summary,
      description: description ?? "",
      project: { id: await this._projectId() },
      customFields: buildCustomFieldsWire(customFields) ?? [],
    };
    const raw = await this._request("issues", {
      method: "POST",
      body,
      query: { fields: DEFAULT_FIELDS },
    });
    return shapeIssue(raw);
  }

  async updateIssue(idReadable, { summary, description, customFields } = {}) {
    if (!idReadable) throw new TypeError("updateIssue: idReadable is required");
    const body = {};
    if (summary !== undefined) body.summary = summary;
    if (description !== undefined) body.description = description;
    const cfWire = buildCustomFieldsWire(customFields);
    if (cfWire) body.customFields = cfWire;

    const raw = await this._request(`issues/${encodeURIComponent(idReadable)}`, {
      method: "POST",
      body,
      query: { fields: DEFAULT_FIELDS },
    });
    return shapeIssue(raw);
  }

  // --- comments ---

  async listComments(idReadable) {
    if (!idReadable) throw new TypeError("listComments: idReadable is required");
    const raw = await this._request(
      `issues/${encodeURIComponent(idReadable)}/comments`,
      {
        query: {
          fields: "id,text,author(login),created,updated",
        },
        retry: true,
      },
    );
    const list = Array.isArray(raw) ? raw : [];
    return list.map((c) => ({
      id: c.id,
      text: c.text ?? "",
      author: c.author?.login ?? null,
      created: c.created ?? null,
      updated: c.updated ?? null,
    }));
  }

  async createComment(idReadable, text) {
    if (!idReadable) throw new TypeError("createComment: idReadable is required");
    if (!text) throw new TypeError("createComment: text is required");
    return this._request(`issues/${encodeURIComponent(idReadable)}/comments`, {
      method: "POST",
      body: { text },
      query: { fields: "id,text,author(login),created,updated" },
    });
  }

  // --- resolution ---

  // Resolve / reopen both work by rewriting the State custom field. We look up
  // the field's actual name per-issue (it may be "Stage" or "Status" depending
  // on project config) so this stays robust against schema drift.

  async resolveIssue(idReadable, statusValue = "resolved") {
    if (!idReadable) throw new TypeError("resolveIssue: idReadable is required");
    const issue = await this.getIssue(idReadable);
    if (!issue) return null;
    const stateField = findStateFieldName(issue.customFields);
    if (!stateField) {
      throw new YouTrackError(0, `no state field found on ${idReadable}`, "resolveIssue");
    }
    return this.updateIssue(idReadable, {
      customFields: { [stateField]: statusValue },
    });
  }

  async reopenIssue(idReadable) {
    if (!idReadable) throw new TypeError("reopenIssue: idReadable is required");
    const issue = await this.getIssue(idReadable);
    if (!issue) return null;
    const stateField = findStateFieldName(issue.customFields);
    if (!stateField) {
      throw new YouTrackError(0, `no state field found on ${idReadable}`, "reopenIssue");
    }
    return this.updateIssue(idReadable, {
      customFields: { [stateField]: "status/triage" },
    });
  }

  // Lazily resolve and cache the project's internal id so createIssue can
  // reference it without forcing the caller to pass it.
  async _projectId() {
    if (this._cachedProjectId) return this._cachedProjectId;
    const project = await this.getProject();
    this._cachedProjectId = project.id;
    return project.id;
  }
}
