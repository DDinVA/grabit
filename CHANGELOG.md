# Changelog

All notable changes to grabit are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Security-relevant changes are tagged **[Security]** and cross-referenced
to [SECURITY.md](SECURITY.md).

## [Unreleased]

### Added
- Governance: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`,
  issue templates (bug / feature), PR template with security checklist,
  `.github/SUPPORT.md`.
- **[Security]** CodeQL Swift analysis on every push, PR, and weekly.
- **[Security]** Dependency review workflow blocking PRs that introduce
  vulnerable or non-permissive-licensed dependencies.
- **[Security]** Dependabot for GitHub Actions with grouped weekly PRs.
- **[Security]** Build workflow hardened: every action pinned to full
  commit SHA, `step-security/harden-runner` on every job, least-privilege
  `permissions:` blocks, build provenance attestation via
  `actions/attest-build-provenance`, `SHA256SUMS` published with every
  release.
- Release binary now named `grabit` on disk (was `ocr` in macOCR).

### Changed
- CI branch triggers moved from `master` to `main`.
- Release artifacts renamed `macOCR-*.tar.gz` → `grabit-*.tar.gz`.

## [1.0.0] — 2026-08-23

### Added
- `--reflow paragraph` mode: geometry-aware reflow using Vision's
  bounding-box positions and heights. Turns a paragraph on screen into a
  paragraph on your clipboard instead of one line per Vision observation.
- Horizontal-gap column-defence: same-row fragments separated by more
  than 3× line-height are treated as a column break, not a within-line
  space, so multi-column layouts don't collapse into gibberish.
- Barcodes always land on their own line, even when interleaved with
  text in `--reflow paragraph` mode.

### Preserved from upstream (macOCR 1.3.0)
- `--reflow lines` (default) — byte-identical to macOCR 1.3.0 output.
- `--json` — structured records with bounding boxes, unchanged.
- All original macOCR flags (`--barcodes`, `--no-barcodes`,
  `--symbologies`, `--rect`, `--input`, `--save-image`, `--language`,
  `--list-languages`, `--list-symbologies`, `--update`).

### Credits
Forked from [macOCR](https://github.com/schappim/macOCR) by Marcus
Schappi (MIT). Original license preserved in
[`LICENSES/macOCR-MIT.txt`](LICENSES/macOCR-MIT.txt).

[Unreleased]: https://github.com/DDinVA/grabit/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/DDinVA/grabit/releases/tag/v1.0.0
