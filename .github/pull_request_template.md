## Summary

<!-- One paragraph. Decision first. What did you change, and why. -->

## Before / after

<!-- If your change affects OCR output, paste grabit output on a
     representative screenshot before and after your change. -->

## Backward compatibility

<!-- Does the default `grabit` command (no flags) still produce
     byte-identical output for a text-only screenshot? If not, why is the
     break acceptable, and what should users update? -->

## Testing

<!-- What did you test, and how? If you added a fixture, list its path.
     If a maintainer needs macOS/Xcode to reproduce, say so. -->

## Security & permissions checklist

<!-- Tick every box that applies. If any of these are checked, expand
     below with a paragraph explaining the new surface. -->

- [ ] This PR changes what grabit writes to the pasteboard
- [ ] This PR adds a new file-write path (temp file, save-image, log)
- [ ] This PR adds a new outbound network call
- [ ] This PR changes how permissions (Screen Recording, Accessibility) are requested or checked
- [ ] This PR adds or updates a GitHub Actions workflow
- [ ] This PR adds or bumps a third-party dependency (CocoaPod, Swift package, GitHub Action)
- [ ] None of the above — this is a pure behaviour/documentation change

## Related issues

<!-- Fixes #, Closes #, Refs # -->

## Checklist

- [ ] I ran `pod install && xcodebuild ... build` and it succeeded
- [ ] I ran the built `grabit` binary against my new/changed behaviour and it does what the summary claims
- [ ] I updated `README.md` if user-facing behaviour changed
- [ ] I updated `SECURITY.md` if the threat model changed
- [ ] My commits follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`)
- [ ] I have read and agree to the [Code of Conduct](CODE_OF_CONDUCT.md)
