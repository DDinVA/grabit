# grabit-sync source

Server entry point and modules live here. See `../README.md` for the
architecture overview.

## Layout (planned — files land as ADR 0008 moves from `proposed` to `accepted`)

```
src/
├── server.mjs              # HTTP entry + webhook receivers
├── github/
│   ├── client.mjs          # Octokit wrapper
│   ├── webhook.mjs         # HMAC verification + event dispatch
│   └── mapping.mjs         # GitHub issue -> YouTrack ticket translation
├── youtrack/
│   ├── client.mjs          # REST wrapper w/ retry + rate-limit
│   ├── webhook.mjs         # Bearer-token verification + event dispatch
│   └── mapping.mjs         # YouTrack ticket -> GitHub issue translation
├── state/
│   └── db.mjs              # better-sqlite3 schema + queries
└── logging.mjs             # pino config
```

Confidential YouTrack tickets — those with any restricted-visibility
group set — are filtered out at the mapping layer. Their contents never
touch the GitHub side even if a webhook fires for one.
