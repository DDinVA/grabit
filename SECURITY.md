# Security Policy

grabit reads text from your screen and puts it on your clipboard. That is a
sensitive surface — the pixels it sees can include passwords, private
conversations, medical records, and anything else you happen to have on
screen. This document explains what grabit does with that data, what it
does not, and how to report a security problem responsibly.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security reports.** Use one
of these channels instead:

1. **Preferred:** GitHub Security Advisories — open a private report at
   [github.com/DDinVA/grabit/security/advisories/new](https://github.com/DDinVA/grabit/security/advisories/new).
   Only maintainers can see the draft, and GitHub coordinates the fix and
   the CVE if one is warranted.
2. **Email:** `ddinva@proton.me` with subject `[grabit security]`. If you
   want end-to-end encryption, request the PGP key in a first message and
   we will exchange fingerprints out-of-band.

Please include:

- grabit version (`grabit --version`)
- macOS version and CPU architecture
- What the vulnerability is and what an attacker can do with it
- Steps to reproduce, or a proof-of-concept
- Whether you have already disclosed this anywhere else

### What to expect

| Milestone | Target |
|---|---|
| Acknowledgement of your report | Within 3 business days |
| Initial triage (severity, scope) | Within 7 business days |
| Fix or public disclosure decision | Within 90 days |

If we go silent past those windows, escalate by opening a
[public GitHub issue](https://github.com/DDinVA/grabit/issues/new/choose)
with only the text "waiting on security response, N days" and no details —
that is a nudge, not a disclosure.

### Coordinated disclosure

We follow standard 90-day coordinated disclosure. If a fix is not ready in
that window we may agree in writing to extend it. If a vulnerability is
being actively exploited in the wild the window shrinks — we will ship a
fix as quickly as we can and credit you in the release notes.

We will not sue or threaten legal action against researchers acting in
good faith. If you are unsure whether your research is in scope, ask
first.

## What grabit needs, and why

grabit only works if macOS grants it two things:

1. **Screen Recording permission** — required to capture pixels of the
   region you select. macOS prompts for this the first time you run
   grabit, and the choice is visible under System Settings → Privacy &
   Security → Screen Recording.
2. **Accessibility permission** (may be requested by macOS for hotkey /
   region-selection flows in newer macOS versions).

You can revoke either permission at any time from System Settings.
grabit will refuse to run without Screen Recording, rather than silently
returning empty results.

## What grabit does with the pixels

- Runs Apple's on-device
  [Vision framework](https://developer.apple.com/documentation/vision) to
  recognise text and barcodes. Vision runs entirely on your Mac — no
  pixels leave the machine as part of the recognition step.
- Writes the resulting text (or the JSON representation of the results)
  to `stdout` and, unless the result is empty, to the general macOS
  pasteboard (`NSPasteboard.general`).
- With `--save-image <path>`, writes the raw screenshot PNG to a path
  you choose. Without that flag, the temporary capture PNG is deleted
  immediately after Vision finishes reading it — see
  [`ocr/main.swift`](ocr/main.swift) for the exact removal call.

## What grabit does NOT do

- **No network calls with your pixels or your text.** The Vision request
  is entirely local. The only outbound HTTPS request grabit ever makes is
  to `api.github.com` when you run `grabit --update`, to check the latest
  released version — a plain metadata request with no user content.
- **No telemetry.** No analytics, no crash reports, no usage counters.
- **No cloud OCR fallback.** If Vision fails, grabit exits with an error;
  it does not upload the image anywhere.
- **No background processes.** grabit is a one-shot CLI — it runs, it
  exits.

## Threat model

The scenarios we design against:

| Threat | Mitigation |
|---|---|
| Malicious release binary shipped in our name | GitHub-attested build provenance ([SLSA level 3](https://slsa.dev/spec/v1.0/levels)); release SHA256SUMS; hardened GitHub Actions runners. |
| Compromised third-party GitHub Action stealing our release-signing key | All Actions pinned to full commit SHAs (not floating tags); least-privilege `permissions:` on every workflow job; `step-security/harden-runner` blocks unexpected outbound traffic. |
| Vulnerable dependency (CocoaPod, Swift package) | Dependabot enabled on `Podfile.lock`; dependency-review-action gates PRs. |
| Injected static-analysis regression | CodeQL (Swift) runs on every push and PR. |
| Attacker with local execution reading pixels via grabit | grabit needs the Screen Recording TCC grant — outside grabit's scope; report to Apple. |
| Malicious image passed via `-i` triggering a Vision crash | Vision is Apple code; report to Apple. grabit does bound the request (single image, timeouts on network metadata calls) so a crash is local, not remote. |
| Pasteboard poisoning | grabit only writes to the pasteboard when the OCR result is non-empty and only writes the recognised text. It does not read from the pasteboard. |

Scenarios explicitly **out of scope**:

- macOS TCC subsystem vulnerabilities (Apple's problem)
- Vision framework vulnerabilities (Apple's problem)
- Vulnerabilities in third-party clipboard managers that ingest what
  grabit writes (their problem)
- Physical access to an unlocked Mac (nothing we can do)

## Supply chain

- **Every GitHub Action is pinned by full commit SHA**, not by tag. If
  you see `uses: some/action@v3` in a workflow, that is a bug — please
  report it.
- Release binaries are built by GitHub-hosted runners with
  `actions/attest-build-provenance` attaching SLSA v1 provenance.
- Every release ships a `SHA256SUMS` file. Verify before you install:

  ```bash
  shasum -a 256 -c SHA256SUMS
  ```

- No release is ever manually uploaded from a developer laptop — if the
  Actions workflow did not produce it, it is not official.

## Cryptographic signatures

Signed releases (via `cosign` keyless / OIDC) are on the roadmap. Until
then, `SHA256SUMS` plus GitHub's build attestations
([`gh attestation verify`](https://cli.github.com/manual/gh_attestation_verify))
are the authoritative way to verify a release binary.

## Contact

- Security reports: [security advisory](https://github.com/DDinVA/grabit/security/advisories/new) or `ddinva@proton.me`
- Everything else: [GitHub Issues](https://github.com/DDinVA/grabit/issues)
