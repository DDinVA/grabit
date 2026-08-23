# Contributing to grabit

Thanks for your interest — grabit is small on purpose, and contributions
that keep it that way are welcome.

## Before you start

- **Small PRs get merged fast. Big PRs stall.** If your idea is more than
  a hundred lines or touches how the CLI behaves, open an issue first and
  we will agree on the shape before you write it.
- **Security-relevant changes go through the private channel first.**
  See [SECURITY.md](SECURITY.md). Do not open a public PR that
  demonstrates a vulnerability.
- All contributions must be MIT-licensable. If you cannot license your
  work under MIT, we cannot accept the PR.

## Set up

You need:

- macOS 12 (Monterey) or later — we build against every Vision language
  the current SDK ships
- Xcode 15 or later
- CocoaPods (`sudo gem install cocoapods` or `brew install cocoapods`)

Clone and build:

```bash
git clone git@github.com:DDinVA/grabit.git
cd grabit
pod install
xcodebuild -workspace ocr.xcworkspace -scheme ocr -configuration Release \
  -derivedDataPath build \
  CODE_SIGN_IDENTITY="" CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=NO \
  build
./build/Build/Products/Release/ocr --version
```

The binary that lands in `build/Build/Products/Release/ocr` is the
same shape the release workflow produces. You do not need a paid Apple
Developer account to build for personal use — the workflow disables
signing.

## Branching and commits

- Branch off `main`. Branch names: `feat/short-name`, `fix/short-name`,
  `docs/short-name`, `security/short-name`.
- One logical change per PR. Refactors go in their own PR, ahead of the
  feature that needs them.
- Commit messages use Conventional Commits:

  ```
  feat: add --reflow markdown mode
  fix: paragraph break threshold on tiny captures
  docs: clarify Screen Recording permission section
  chore(ci): pin actions to full commit SHAs
  ```

- Sign your commits (`git commit -S`) if you can. Not required for
  merging, but strongly encouraged — it makes the audit trail meaningful.

## What good PRs look like

A PR that gets merged quickly usually has:

1. A **Minto-style body** — decision first, one paragraph. What did you
   change, and why? Not what files, not what lines. The reader can see
   the diff.
2. **Concrete before/after** if you touched OCR behaviour. Paste the
   `grabit` output for a representative screenshot from before and after
   your change. Attach the screenshot if you can share it.
3. **Backward compatibility statement.** grabit users have scripts that
   depend on the current output format. If your PR changes the default
   behaviour of `grabit` (with no flags), explain why and how you kept
   `--reflow lines` byte-identical, or why the break is acceptable.
4. **Security checkbox in the PR template.** If your change touches how
   grabit interacts with the pasteboard, screen capture, file paths, or
   the network, say so and explain why the new surface is safe.

## Testing

We do not (yet) have an in-repo test harness — the algorithm is small and
Vision is not mockable. When you contribute a change to the reflow
algorithm, please:

1. Add a fixture screenshot to `tests/fixtures/` (small PNG, well under
   1MB, no sensitive content, ideally something reproducible from public
   sources you cite in the commit message).
2. Include the expected `grabit --reflow paragraph` output in
   `tests/fixtures/expected/`.
3. Mention the fixture in the PR body so the reviewer can run it.

A proper test harness is on the roadmap. Wire it up if you want to.

## Reporting bugs and requesting features

Use the issue templates at
[github.com/DDinVA/grabit/issues/new/choose](https://github.com/DDinVA/grabit/issues/new/choose).
The templates ask for the information we need to reproduce — please fill
them out rather than opening a blank issue.

For anything with a security angle, see [SECURITY.md](SECURITY.md)
instead — do not open a public issue.

## Review timeline and expectations

- Non-security PRs: initial response within 5 business days.
- Security PRs (opened via advisory): initial response within 3 business
  days.
- If a PR sits for more than 30 days without review, ping the thread
  once and CC the maintainer. If it sits another 14 days after that,
  fork it — we would rather see the work merged somewhere than lost.

Maintainers can and do reject PRs. Common reasons:

- Broadens the surface area (new CLI flags for edge cases we would
  rather not maintain forever)
- Adds a dependency for a feature that could be done without one
- Trades simplicity for a small correctness win
- Ships to gain compliance with a spec that grabit does not target

None of those are personal. We would rather say no early than merge
something we regret.

## Code style

Swift, four-space indent, no explicit `self` unless required for
capture-list clarity, comments explain **why** not **what**. Keep
functions small enough to fit on one screen. `ocr/main.swift` is
deliberately one file — do not split it up unless you have a very good
reason. If in doubt, match what is already there.

## Code of Conduct

By participating you agree to abide by our
[Code of Conduct](CODE_OF_CONDUCT.md).

## License

Contributions are licensed under the same MIT license as grabit. See
[LICENSE](LICENSE).
