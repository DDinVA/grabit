# grabit

**Screen OCR for macOS that gives you back what you captured.**

grabit selects a region of your screen, reads the text and any barcodes in it, and puts the result on your clipboard. Unlike existing tools, it understands what a paragraph is: `--reflow paragraph` turns a paragraph on screen back into a paragraph in your clipboard, not a vertical list of one line per Vision observation.

```
grabit --reflow paragraph
```

That is the whole pitch.

---

## Install

Download the arm64 binary from [Releases](https://github.com/DDinVA/grabit/releases/latest):

```bash
curl -L -o grabit-arm64.tar.gz \
  https://github.com/DDinVA/grabit/releases/latest/download/grabit-arm64.tar.gz
tar xzf grabit-arm64.tar.gz
sudo mv grabit /usr/local/bin/
```

A Homebrew tap is on the roadmap once there's a build cadence worth automating.

First run will prompt for **Screen Recording** permission. Approve it once in System Settings → Privacy & Security → Screen Recording.

## Use

| Command | What it does |
|---|---|
| `grabit` | Select a region, get text + barcodes on your clipboard (one line per Vision observation) |
| `grabit --reflow paragraph` | Same, but reflow into paragraphs using bounding-box geometry |
| `grabit --json` | Structured output: observations, confidence scores, bounding boxes |
| `grabit -l ja-JP` | Recognise Japanese (or any [supported language](#languages)) |
| `grabit -b` | Read only barcodes, ignoring text |
| `grabit --rect 100,200,500,300` | Capture a fixed region, no interactive selection |
| `grabit -i screenshot.png` | Read an existing image instead of capturing the screen |

Full options: `grabit --help`.

## Why paragraph reflow

Apple's Vision framework returns one text observation per detected line segment. Every OCR tool built on Vision — including the one this is forked from — joins those with `\n` and calls it done. Capture a paragraph and you get:

```
The quick brown fox jumps over the lazy dog. This is
a proper paragraph, wrapped across several visual lines
the way real screen text is. It should reflow into
one paragraph when you paste it somewhere.
```

Four lines. Four `\n`s. Your paste target has to un-wrap them manually.

`--reflow paragraph` uses the geometry Vision already reports (each observation's bounding box position and height) to decide which lines belong to the same paragraph:

- Same visual row (midY within half a line-height) → join with a space
- Consecutive rows with normal line spacing → join with a space (continuation line)
- Vertical gap larger than ~0.6× line-height → paragraph break (blank line)
- Horizontal gap wider than 3× line-height between two same-row fragments → column break, not a within-line space

Result of the same capture:

```
The quick brown fox jumps over the lazy dog. This is a proper paragraph, wrapped across several visual lines the way real screen text is. It should reflow into one paragraph when you paste it somewhere.
```

One line. Paste-ready.

The default is still `--reflow lines` (byte-identical to macOCR 1.3.0) so existing scripts that split on newlines keep working. `--json` output is untouched — it uses structured records, not the joined payload string.

## What grabit handles well

- **Multi-line prose** — reflows into a single paragraph
- **Multiple paragraphs** — preserves paragraph breaks where the vertical gap says one exists
- **Mixed text + barcodes** — barcodes never merge with text; each stays on its own line
- **Two-column layouts** — the horizontal-gap defence keeps columns separate (see [Known limits](#known-limits))
- **Bullet lists** — each bullet is its own visual row, so they stay on separate lines

## Known limits

- **Multi-column academic PDFs**: the column-gap heuristic (3× line-height) works for typical two-column news layouts but has not been tested against every academic template. Report failures with a fixture.
- **Right-to-left scripts** (Arabic, Hebrew): word order within a row is currently sorted by minX ascending, which is LTR-only. Tracked as an open issue.
- **Tables**: cells on the same visual row will merge into a space-joined string. There is no table detection — use `--json` and reconstruct from bounding boxes if you need column structure.
- **Code blocks with wide line spacing**: may trigger false paragraph breaks. If this matters to you, use default `--reflow lines`.

## Languages

`grabit --list-languages` shows every language your macOS Vision framework can read. Language support depends on the macOS version — Big Sur (macOS 11) added `--language`; Monterey (12) expanded the list; every release since has added more.

## JSON output

`grabit --json` prints each observation as an object:

```json
[
  {
    "type": "text",
    "text": "The quick brown fox jumps over the lazy dog.",
    "confidence": 1.0,
    "boundingBox": {
      "x": 0.031, "y": 0.884, "width": 0.567, "height": 0.056
    }
  },
  {
    "type": "barcode",
    "symbology": "QR",
    "payload": "https://example.com",
    "confidence": 1.0,
    "boundingBox": { ... }
  }
]
```

`x`/`y` are Vision's normalised coordinates (origin bottom-left, 0..1).

## Building from source

Requires Xcode 15+ and CocoaPods.

```bash
git clone https://github.com/DDinVA/grabit.git
cd grabit
pod install
xcodebuild -workspace ocr.xcworkspace -scheme ocr -configuration Release \
  CODE_SIGN_IDENTITY="" CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=NO \
  build
```

Binary lands in `~/Library/Developer/Xcode/DerivedData/ocr-*/Build/Products/Release/ocr`. Rename to `grabit` on install.

## Credits

grabit is a fork of [**macOCR**](https://github.com/schappim/macOCR) by [Marcus Schappi](https://github.com/schappim), which established the core Vision-based OCR + clipboard pipeline this builds on. The reflow algorithm, multi-column defence, geometry-aware layout, and everything downstream is new work in grabit.

Original macOCR license (MIT) preserved in [`LICENSES/macOCR-MIT.txt`](LICENSES/macOCR-MIT.txt). ArgumentParserKit (Apple, Apache 2.0) and ScreenCapture (Jack P., MIT) licenses in the same directory.

## License

MIT. See [`LICENSE`](LICENSE).
