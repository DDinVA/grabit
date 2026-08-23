import Database from 'better-sqlite3';

// Unix seconds — used for all timestamp columns so we stay timezone-agnostic.
const now = () => Math.floor(Date.now() / 1000);

export class MappingStore {
  constructor(dbPath) {
    // fileMustExist:false so first import on a fresh repo auto-creates the DB.
    this._db = new Database(dbPath, { fileMustExist: false });

    // WAL gives us concurrent readers (sync runs) without blocking; NORMAL avoids
    // an fsync per commit which we don't need for a local bridge state cache.
    this._db.pragma('journal_mode = WAL');
    this._db.pragma('synchronous = NORMAL');

    this._migrate();

    // Cache once — better-sqlite3 prepared statements are reusable across calls
    // and re-preparing per call would be wasteful and can fragment the cache.
    this._stmts = {
      getByGithub: this._db.prepare(
        'SELECT github_issue_number, youtrack_id, youtrack_readable_id, last_synced_at FROM issue_mapping WHERE github_issue_number = ?'
      ),
      getByYoutrack: this._db.prepare(
        'SELECT github_issue_number, youtrack_id, youtrack_readable_id, last_synced_at FROM issue_mapping WHERE youtrack_id = ?'
      ),
      getByYoutrackReadable: this._db.prepare(
        'SELECT github_issue_number, youtrack_id, youtrack_readable_id, last_synced_at FROM issue_mapping WHERE youtrack_readable_id = ?'
      ),
      upsert: this._db.prepare(
        `INSERT INTO issue_mapping (github_issue_number, youtrack_id, youtrack_readable_id, created_at, last_synced_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(github_issue_number) DO UPDATE SET
           youtrack_id = excluded.youtrack_id,
           youtrack_readable_id = excluded.youtrack_readable_id,
           last_synced_at = excluded.last_synced_at`
      ),
      touch: this._db.prepare(
        'UPDATE issue_mapping SET last_synced_at = ? WHERE github_issue_number = ?'
      ),
      all: this._db.prepare(
        'SELECT github_issue_number, youtrack_id, youtrack_readable_id, last_synced_at FROM issue_mapping'
      ),
      count: this._db.prepare('SELECT COUNT(*) AS n FROM issue_mapping'),
    };
  }

  // Idempotent — safe to import this module repeatedly across reloads.
  _migrate() {
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS issue_mapping (
        github_issue_number   INTEGER PRIMARY KEY,
        youtrack_id           TEXT NOT NULL UNIQUE,
        youtrack_readable_id  TEXT NOT NULL UNIQUE,
        created_at            INTEGER NOT NULL,
        last_synced_at        INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_yt_readable ON issue_mapping(youtrack_readable_id);
    `);
  }

  _requireGithub(n) {
    // GitHub issue numbers are positive integers; guard against accidental
    // undefined/null/string inputs from loose callers up the stack.
    if (n === undefined || n === null || !Number.isInteger(n) || n <= 0) {
      throw new Error(`Invalid githubIssueNumber: ${n}`);
    }
  }

  getByGithub(issueNumber) {
    this._requireGithub(issueNumber);
    return this._stmts.getByGithub.get(issueNumber) ?? null;
  }

  getByYoutrack(youtrackId) {
    if (!youtrackId) throw new Error(`Invalid youtrackId: ${youtrackId}`);
    return this._stmts.getByYoutrack.get(youtrackId) ?? null;
  }

  getByYoutrackReadable(readable) {
    if (!readable) throw new Error(`Invalid youtrackReadableId: ${readable}`);
    return this._stmts.getByYoutrackReadable.get(readable) ?? null;
  }

  put({ githubIssueNumber, youtrackId, youtrackReadableId }) {
    this._requireGithub(githubIssueNumber);
    if (!youtrackId) throw new Error(`Invalid youtrackId: ${youtrackId}`);
    if (!youtrackReadableId) throw new Error(`Invalid youtrackReadableId: ${youtrackReadableId}`);

    const ts = now();
    // created_at only sticks on first insert (excluded.* won't touch it on
    // conflict), so passing ts for both columns is correct on the update path.
    this._stmts.upsert.run(githubIssueNumber, youtrackId, youtrackReadableId, ts, ts);
  }

  touch(githubIssueNumber) {
    this._requireGithub(githubIssueNumber);
    this._stmts.touch.run(now(), githubIssueNumber);
  }

  all() {
    return this._stmts.all.all();
  }

  count() {
    return this._stmts.count.get().n;
  }

  close() {
    if (this._db) {
      this._db.close();
      this._db = null;
    }
  }
}
