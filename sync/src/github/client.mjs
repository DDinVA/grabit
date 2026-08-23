// GitHub Octokit wrapper for the grabit-sync bridge.
// Exposes only the issue/comment/label operations the sync needs, and centralizes
// rate-limit handling and idempotent-GET retry so callers never deal with Octokit
// internals or transient GitHub failures.
import { Octokit } from "@octokit/rest";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Up to 3 tries on idempotent GETs. Backoff doubles between attempts:
// 1st retry waits 500ms, 2nd retry waits 2s. (8s is the next step in the sequence,
// unused because we cap at 3 tries, but kept to make the progression explicit.)
const GET_BACKOFFS = [500, 2000, 8000];
const MAX_GET_TRIES = 3;

export class GitHubClient {
  constructor({ token, owner = "DDinVA", repo = "grabit" }) {
    this.owner = owner;
    this.repo = repo;
    this.octokit = new Octokit({ auth: token, userAgent: "grabit-sync/0.1" });

    // Epoch-ms timestamp before which we must not send another request, because a
    // prior response reported the rate-limit bucket was empty. 0 means "free to call."
    this._rateLimitResetAt = 0;

    // Wrap the core request function so EVERY Octokit call (including each page of
    // paginate()) is rate-limit aware and gets GET retries. Mutations pass through
    // unchanged — they are not safe to replay.
    this.octokit.hook.wrap("request", async (request, options) => {
      const isGet = options.method === "GET";

      for (let attempt = 0; attempt < (isGet ? MAX_GET_TRIES : 1); attempt++) {
        // Block until the rate-limit window resets if a previous response drained it.
        if (this._rateLimitResetAt > Date.now()) {
          await sleep(this._rateLimitResetAt - Date.now());
        }

        try {
          const res = await request(options);
          this._noteRateLimit(res.headers);
          return res;
        } catch (err) {
          // 404 is a definitive "not found", not a transient failure — never retry it;
          // callers decide whether a 404 is expected (e.g. getIssue -> null).
          if (err.status === 404) throw err;

          // Only idempotent GETs are safe to replay, and only on 5xx or 429.
          if (isGet && (err.status >= 500 || err.status === 429) && attempt < MAX_GET_TRIES - 1) {
            // A 429 often carries the rate-limit headers that tell us when to retry;
            // honor them so we don't burn the remaining attempts against a locked bucket.
            if (err.response && err.response.headers) {
              this._noteRateLimit(err.response.headers);
            }
            await sleep(GET_BACKOFFS[attempt]);
            continue;
          }

          throw err;
        }
      }
    });
  }

  // Record the rate-limit state from a response. We only care about the "bucket empty"
  // case: when remaining hits 0, stall until the reset timestamp. We deliberately do
  // NOT pre-emptively slow down on low-but-nonzero remaining — the spec only mandates
  // stalling once the bucket is actually empty.
  _noteRateLimit(headers) {
    if (!headers) return;
    const remaining = headers["x-ratelimit-remaining"];
    const reset = headers["x-ratelimit-reset"];
    if (remaining !== undefined && String(remaining) === "0" && reset) {
      // x-ratelimit-reset is epoch seconds; convert to ms for Date comparison.
      this._rateLimitResetAt = Number(reset) * 1000;
    }
  }

  // -- Response shapers: strip Octokit wrappers, keep only the fields the sync maps. --

  _mapIssue(i) {
    return {
      number: i.number,
      title: i.title,
      body: i.body,
      state: i.state,
      labels: (i.labels || []).map((l) => l.name),
      assignees: (i.assignees || []).map((a) => a.login),
      user: i.user ? i.user.login : null,
      created_at: i.created_at,
      updated_at: i.updated_at,
      html_url: i.html_url,
    };
  }

  _mapComment(c) {
    return {
      id: c.id,
      body: c.body,
      user: c.user ? c.user.login : null,
      created_at: c.created_at,
      updated_at: c.updated_at,
      html_url: c.html_url,
    };
  }

  // -- Issues --

  // Returns ALL issues across all pages. GitHub's listForRepo endpoint also returns
  // pull requests (they are issues with a `pull_request` field); we filter them out so
  // the YouTrack side never receives phantom "issues" that are really PRs.
  async listIssues({ state = "all", perPage = 100 } = {}) {
    const items = await this.octokit.paginate(this.octokit.rest.issues.listForRepo, {
      owner: this.owner,
      repo: this.repo,
      state,
      per_page: perPage,
    });
    return items
      .filter((i) => !i.pull_request)
      .map((i) => this._mapIssue(i));
  }

  async getIssue(number) {
    try {
      const { data } = await this.octokit.rest.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: number,
      });
      return this._mapIssue(data);
    } catch (err) {
      // 404 means "no such issue" — a legitimate, non-error outcome for callers
      // polling for an issue that may not exist yet.
      if (err.status === 404) return null;
      throw err;
    }
  }

  async createIssue({ title, body, labels = [], assignees = [] }) {
    const { data } = await this.octokit.rest.issues.create({
      owner: this.owner,
      repo: this.repo,
      title,
      body,
      labels,
      assignees,
    });
    return this._mapIssue(data);
  }

  // Only the fields the caller actually passes are forwarded, so a partial update
  // never nulls out fields it didn't intend to touch.
  async updateIssue(number, { title, body, state, labels, assignees } = {}) {
    const patch = {};
    if (title !== undefined) patch.title = title;
    if (body !== undefined) patch.body = body;
    if (state !== undefined) patch.state = state;
    if (labels !== undefined) patch.labels = labels;
    if (assignees !== undefined) patch.assignees = assignees;

    const { data } = await this.octokit.rest.issues.update({
      owner: this.owner,
      repo: this.repo,
      issue_number: number,
      ...patch,
    });
    return this._mapIssue(data);
  }

  // -- Comments --

  async listComments(number) {
    const comments = await this.octokit.paginate(this.octokit.rest.issues.listComments, {
      owner: this.owner,
      repo: this.repo,
      issue_number: number,
      per_page: 100,
    });
    return comments.map((c) => this._mapComment(c));
  }

  async createComment(number, body) {
    const { data } = await this.octokit.rest.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: number,
      body,
    });
    return this._mapComment(data);
  }

  // -- Labels --

  async addLabels(number, labelNames) {
    const { data } = await this.octokit.rest.issues.addLabels({
      owner: this.owner,
      repo: this.repo,
      issue_number: number,
      labels: labelNames,
    });
    // Return the resulting label set so callers can reconcile without a follow-up GET.
    return data.map((l) => l.name);
  }

  async removeLabel(number, labelName) {
    try {
      await this.octokit.rest.issues.removeLabel({
        owner: this.owner,
        repo: this.repo,
        issue_number: number,
        name: labelName,
      });
    } catch (err) {
      // A 404 here means the label is already gone — which is exactly the desired
      // post-condition, so treat it as success rather than surfacing a noisy error.
      if (err.status === 404) return;
      throw err;
    }
  }

  async setLabels(number, labelNames) {
    const { data } = await this.octokit.rest.issues.setLabels({
      owner: this.owner,
      repo: this.repo,
      issue_number: number,
      labels: labelNames,
    });
    return data.map((l) => l.name);
  }
}
