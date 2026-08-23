# ADR 0004 — Vision shim API shape

- **Status:** proposed
- **Date proposed:** 2026-08-23
- **Date accepted:** —
- **Superseded by:** —
- **Tracking issue:** [DDinVA/grabit#5](https://github.com/DDinVA/grabit/issues/5)

## Context

[ADR 0001](0001-two-binary-split.md) requires a JSON protocol between
the Rust CLI and the Swift Vision shim. The shape of that protocol
determines how `grabit-vision` runs (one shot vs long-lived) and how
the Rust side spawns and manages it.

The protocol will be specified in detail in
[`docs/specs/vision-shim-protocol.md`](../specs/vision-shim-protocol.md).
This ADR is about the surrounding invocation shape.

## Decision

`grabit-vision` runs as a one-shot subprocess. Rust writes a single
JSON request to its stdin, closes stdin, and reads a single JSON
response from its stdout. The subprocess exits after one exchange.

## Options considered

### Option A — Request-response over stdio, one-shot (chosen)
- One invocation per capture.
- **Pro:** Trivial to reason about. Subprocess lifetime bounded to a
  single OCR call. Crash-safe (a segfault in Vision kills only the
  subprocess). No state to manage on the Rust side.
- **Con:** Process spawn cost per invocation (~10-20ms). Fine for a
  one-shot CLI, not for a rapid stream.

### Option B — Line-delimited streaming, long-lived
- `grabit-vision` runs as a daemon. Rust sends one request per line,
  reads one response per line, keeps the subprocess alive for the
  duration of the `grabit` invocation.
- **Pro:** Amortises spawn cost. Enables `grabit --watch` (streaming
  re-capture) as a straight extension.
- **Con:** State machine on both sides. Error handling gets richer
  (partial writes, protocol resync). Vision framework holds
  resources for the shim's lifetime.

### Option C — Unix socket / named pipe
- Same as B but over a socket.
- **Con:** All of B's complexity plus socket-file management, no
  benefit over stdio for a single-parent-single-child pipe.

## Rationale

- v2.0.0 is a one-shot CLI, exactly like v1.0.0. There is no watch
  mode to amortise against.
- The 10-20ms spawn cost is dominated by Vision's own startup (~100ms
  cold, ~40ms warm), so streaming would not deliver the "instant"
  perception until Vision itself is warm.
- Option B is the right shape when watch mode ships — it can supersede
  this ADR then, cleanly.

## Consequences

- **Positive:** Simplest possible protocol. Subprocess crashes are
  contained. Rust side has no session state.
- **Negative:** Every capture pays the full startup cost. Watch mode
  will require this decision to be revisited.
- **Neutral:** The JSON schema itself is the same in both shapes; the
  wire framing is what changes. A future streaming ADR can inherit
  the schema.

## Validation

- End-to-end capture latency measured — spawn + Vision + reflow +
  pasteboard writes under 500ms warm on reference hardware.
- Killing `grabit` mid-capture leaves no orphan `grabit-vision`
  processes.

## Related

- [ADR 0001](0001-two-binary-split.md) — architecture.
- Spec: `docs/specs/vision-shim-protocol.md` (to be written).
- Future: watch mode ADR will likely supersede this.
