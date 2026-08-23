//
//  main.swift
//  grabit — geometry-aware screen OCR for macOS
//
//  Originally created as macOCR by Marcus Schappi on 17/5/21.
//  Rebranded and extended (paragraph reflow, geometry-aware layout) as
//  grabit by DDinVA <ddinva@proton.me> in 2026. MIT.
//

import Foundation
import CoreImage
import Cocoa
import Vision
import ScreenCapture
import ArgumentParserKit


var joiner = "\n"
var bigSur = false;

if #available(OSX 11, *) {
    bigSur = true;
}

// MARK: - Version & distribution

/// Bump this in step with the git tag that ships the release. The release job in
/// .github/workflows/build.yml refuses to publish a tag that disagrees with it.
let ocrVersion = "1.0.0"
let ocrRepositoryURL = "https://github.com/DDinVA/grabit"
let ocrReleasesURL = "https://github.com/DDinVA/grabit/releases/latest"
let ocrAllReleasesURL = "https://github.com/DDinVA/grabit/releases"
let ocrLatestReleaseAPI = "https://api.github.com/repos/DDinVA/grabit/releases/latest"
let ocrBrewFormula = "DDinVA/grabit/grabit"

/// The slice this binary was compiled as.
#if arch(arm64)
let ocrBinaryArch = "arm64"
#else
let ocrBinaryArch = "x86_64"
#endif

/// True when an Intel binary is running under Rosetta on Apple Silicon. The
/// sysctl is missing on Intel Macs and before macOS 11, where the call fails and
/// leaves this false, which is the right answer for both.
let ocrIsTranslated: Bool = {
    #if arch(arm64)
    return false
    #else
    var translated: Int32 = 0
    var size = MemoryLayout<Int32>.size
    guard sysctlbyname("sysctl.proc_translated", &translated, &size, nil, 0) == 0 else { return false }
    return translated == 1
    #endif
}()

/// The build a user should be downloading, which is the machine's architecture
/// rather than this binary's. Someone hitting Apple's "Intel app" warning needs
/// to be sent to the arm64 build, not handed the Intel one again.
let ocrDownloadArch = ocrIsTranslated ? "arm64" : ocrBinaryArch

func printToStandardError(_ message: String) {
    if let data = (message + "\n").data(using: .utf8) {
        FileHandle.standardError.write(data)
    }
}

func printVersion() {
    if ocrIsTranslated {
        print("grabit \(ocrVersion) (\(ocrBinaryArch) running under Rosetta; an arm64 build is available)")
    } else {
        print("grabit \(ocrVersion) (\(ocrBinaryArch))")
    }
    print(ocrRepositoryURL)
}

func printHelp() {
    // --language is only registered on Big Sur and later, so on older systems it
    // is left out rather than advertised as something the parser would reject.
    var optionLines: [String] = []
    if bigSur {
        optionLines.append("  -l, --language <code>     Set the OCR language, e.g. de-DE")
    }
    optionLines += [
        "      --list-languages      List all supported OCR languages",
        "  -b, --barcodes            Read only QR codes and barcodes, ignoring any text",
        "      --no-barcodes         Read only text, ignoring any QR codes and barcodes",
        "      --symbologies <list>  Only look for these symbologies, e.g. QR,EAN13",
        "      --list-symbologies    List every barcode symbology this copy can read",
        "      --json                Print results as JSON instead of plain text",
        "      --reflow <mode>       Text layout: 'lines' (default) or 'paragraph'",
        "  -R, --rect <x,y,w,h>      Capture a specific region, skipping the interactive selection",
        "  -i, --input <file>        Read an existing image file instead of capturing the screen",
        "  -s, --save-image <path>   Save the captured screenshot to <path>",
        "  -v, --version             Print the grabit version",
        "      --update              Check for a newer version and update via Homebrew",
        "  -h, --help                Show this help",
    ]

    var exampleLines = ["  grabit                    Select a region and read the text and codes in it"]
    if bigSur {
        exampleLines.append("  grabit -l ja-JP              OCR using Japanese")
    }
    exampleLines += [
        "  grabit --list-languages      Show every language code this copy supports",
        "  grabit -b                 Read only the QR codes and barcodes in the region",
        "  grabit -b --symbologies QR   Read QR codes only, ignoring other barcodes",
        "  grabit --no-barcodes         Read only the text, as macOCR (grabit's upstream) did before 1.3.0",
        "  grabit --json                Get the text, symbology and position of everything read",
        "  grabit --reflow paragraph    OCR a paragraph on screen back into a paragraph (not one word per line)",
        "  grabit --rect 100,200,500,300",
        "  grabit -i ~/Desktop/screenshot.png",
        "  grabit -s ~/Desktop/capture.png",
    ]

    var text = """
    grabit \(ocrVersion) - turn any text, QR code or barcode on your screen into text
    on your clipboard, with paragraph-aware reflow.

    By default grabit reads both: any text in the region, plus the payload of any
    QR code or barcode it finds, in the order they appear on screen.

    USAGE:
      grabit [options]

    OPTIONS:
    \(optionLines.joined(separator: "\n"))

    EXAMPLES:
    \(exampleLines.joined(separator: "\n"))

    EXIT STATUS:
      With --barcodes, grabit exits 1 when it finds no codes, so a script can tell
      "nothing there" from a successful read. The other modes succeed on an empty
      region. Any error exits 1 and explains itself on stderr.


    """

    if !bigSur {
        text += """
        NOTE:
          Choosing a language needs macOS 11 (Big Sur) or later; this copy recognises en-US only.


        """
    }

    text += """
    UPDATING:
      Homebrew:   brew upgrade \(ocrBrewFormula)
      Manual:     \(ocrReleasesURL)
      Or run:     grabit --update

    HOMEPAGE:
      \(ocrRepositoryURL)
    """

    print(text)
}

// MARK: - Updating

/// The real on-disk location of this binary, with symlinks (such as the ones
/// Homebrew puts in its bin directory) resolved.
func resolvedExecutablePath() -> String {
    let path = Bundle.main.executablePath ?? CommandLine.arguments[0]
    return (path as NSString).resolvingSymlinksInPath
}

/// Homebrew links its binaries out of the Cellar, so a resolved path inside the
/// Cellar is a reliable signal that this copy was installed with `brew`.
func isHomebrewInstall() -> Bool {
    return resolvedExecutablePath().contains("/Cellar/")
}

func homebrewExecutablePath() -> String? {
    var candidates: [String] = []

    // The Cellar path this binary resolved to already names the prefix it was
    // installed under, so prefer that over the environment or a fixed guess.
    let path = resolvedExecutablePath()
    if let cellar = path.range(of: "/Cellar/") {
        candidates.append(path[path.startIndex..<cellar.lowerBound] + "/bin/brew")
    }
    if let prefix = ProcessInfo.processInfo.environment["HOMEBREW_PREFIX"] {
        candidates.append("\(prefix)/bin/brew")
    }
    candidates += ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"]

    return candidates.first(where: { FileManager.default.isExecutableFile(atPath: $0) })
}

/// Best effort lookup of the newest published release. Returns nil when we are
/// offline, rate limited, or GitHub hands back something unexpected.
func latestReleaseVersion() -> String? {
    guard let url = URL(string: ocrLatestReleaseAPI) else { return nil }

    var request = URLRequest(url: url)
    request.timeoutInterval = 6
    request.setValue("grabit/\(ocrVersion)", forHTTPHeaderField: "User-Agent")
    request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")

    var tagName: String? = nil
    let semaphore = DispatchSemaphore(value: 0)

    URLSession.shared.dataTask(with: request) { data, _, _ in
        defer { semaphore.signal() }
        guard let data = data,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let tag = json["tag_name"] as? String else { return }
        tagName = tag
    }.resume()

    _ = semaphore.wait(timeout: .now() + 8)
    return tagName
}

/// Compares dotted version strings such as "v1.2.0", "1.10" and "1.2.0-beta1".
/// Returns true when `latest` is newer than `current`. A prerelease sorts below
/// the release with the same numbers, so 1.2.0 beats 1.2.0-beta1.
func isNewerVersion(_ latest: String, than current: String) -> Bool {
    func parse(_ version: String) -> (numbers: [Int], isPrerelease: Bool) {
        var trimmed = version.hasPrefix("v") ? String(version.dropFirst()) : version
        var isPrerelease = false
        if let dash = trimmed.firstIndex(of: "-") {
            isPrerelease = true
            trimmed = String(trimmed[trimmed.startIndex..<dash])
        }
        return (trimmed.split(separator: ".").map { Int($0) ?? 0 }, isPrerelease)
    }

    let latestVersion = parse(latest)
    let currentVersion = parse(current)

    for index in 0..<max(latestVersion.numbers.count, currentVersion.numbers.count) {
        let l = index < latestVersion.numbers.count ? latestVersion.numbers[index] : 0
        let c = index < currentVersion.numbers.count ? currentVersion.numbers[index] : 0
        if l != c { return l > c }
    }

    return currentVersion.isPrerelease && !latestVersion.isPrerelease
}

func printManualUpdateInstructions() {
    let installPath = resolvedExecutablePath()

    if ocrIsTranslated {
        print("\nThis is the Intel build running under Rosetta. The commands below")
        print("replace it with the native Apple Silicon build.")
    }

    print("""

    Replace this copy with the latest \(ocrDownloadArch) build:

      curl -L -o grabit-\(ocrDownloadArch).tar.gz \\
        \(ocrReleasesURL)/download/grabit-\(ocrDownloadArch).tar.gz
      tar xzf grabit-\(ocrDownloadArch).tar.gz
      sudo mv ocr \(installPath)

    Or switch to Homebrew, which can do this for you from then on:

      sudo rm \(installPath)
      brew install \(ocrBrewFormula)

    All releases: \(ocrAllReleasesURL)
    """)
}

/// Asks Homebrew which version of the formula is installed, e.g. "1.1.0".
/// Returns nil when brew cannot answer.
func homebrewInstalledVersion(brew: String) -> String? {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: brew)
    process.arguments = ["list", "--versions", ocrBrewFormula]

    let pipe = Pipe()
    process.standardOutput = pipe
    process.standardError = FileHandle.nullDevice

    do {
        try process.run()
    } catch {
        return nil
    }

    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    process.waitUntilExit()

    guard process.terminationStatus == 0,
          let output = String(data: data, encoding: .utf8),
          let line = output.split(separator: "\n").first else { return nil }

    return line.split(separator: " ").last.map(String.init)
}

/// Runs `brew upgrade` for the macOCR formula, inheriting stdout/stderr so the
/// user sees Homebrew's own output. Returns brew's exit status.
func runHomebrewUpgrade(brew: String) -> Int32 {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: brew)
    process.arguments = ["upgrade", ocrBrewFormula]

    // Our own output is block buffered when stdout is not a terminal, so flush
    // it before brew starts writing or the two get interleaved out of order.
    fflush(stdout)

    do {
        try process.run()
    } catch {
        printToStandardError("Error: could not run \(brew): \(error.localizedDescription)")
        return EXIT_FAILURE
    }

    process.waitUntilExit()
    return process.terminationStatus
}

func performUpdate() -> Never {
    let installedWithHomebrew = isHomebrewInstall()
    print("grabit \(ocrVersion) (\(ocrBinaryArch)), installed at \(resolvedExecutablePath())")
    print(installedWithHomebrew ? "Installed via Homebrew." : "Installed manually.")
    if ocrIsTranslated {
        print("Running under Rosetta on Apple Silicon; a native arm64 build is available.")
    }

    let latest = latestReleaseVersion()

    if let latest = latest {
        if isNewerVersion(latest, than: ocrVersion) {
            print("A newer version is available: \(latest)")
        } else {
            if isNewerVersion(ocrVersion, than: latest) {
                print("You are ahead of the latest published release (\(latest)).")
            } else {
                print("You are on the latest version (\(latest)).")
            }
            // A translated Intel build is worth replacing even when it is
            // current, so keep going in that case.
            if !ocrIsTranslated {
                if !installedWithHomebrew {
                    print("Homepage: \(ocrRepositoryURL)")
                }
                exit(EXIT_SUCCESS)
            }
        }
    } else {
        print("Could not check GitHub for the latest release.")
    }

    guard installedWithHomebrew, let brew = homebrewExecutablePath() else {
        printManualUpdateInstructions()
        exit(EXIT_SUCCESS)
    }

    print("\nRunning: brew upgrade \(ocrBrewFormula)\n")
    let status = runHomebrewUpgrade(brew: brew)
    guard status == EXIT_SUCCESS else { exit(status) }

    // brew exits 0 when it has nothing to install, so a formula that has not
    // caught up with the release yet would otherwise look like a successful
    // update that changed nothing.
    if let latest = latest, let installed = homebrewInstalledVersion(brew: brew) {
        if isNewerVersion(latest, than: installed) {
            print("""

            Homebrew still has \(installed); the \(latest) formula is not published yet.
            Grab the binary directly if you need it now: \(ocrReleasesURL)
            """)
        } else {
            print("\nmacOCR is now on \(installed).")
        }
    }

    exit(EXIT_SUCCESS)
}

// MARK: - Early flags
//
// These are handled before the argument parser runs so that they behave the
// same on every macOS version, and so --help can carry the install, update and
// homepage details that ArgumentParserKit's generated usage cannot.

/// Options whose value is the following token. The scan below has to step over
/// those tokens, or `ocr --input --version` would print the version instead of
/// treating "--version" as the file name the parser will complain about.
let ocrValueTakingOptions: Set<String> = [
    "-l", "--language",
    "--symbologies",
    "-R", "--rect",
    "-i", "--input",
    "-s", "--save-image",
]

/// Returns the flag macOCR handles itself, or nil. Only tokens in an option
/// position count, and scanning stops at "--".
func earlyFlag(in arguments: [String]) -> String? {
    var index = 0
    while index < arguments.count {
        let argument = arguments[index]

        if argument == "--" { return nil }

        switch argument {
        case "-h", "-help", "--help": return "--help"
        case "-v", "--version": return "--version"
        case "--update": return "--update"
        default: break
        }

        // The --option=value form carries its value inline, so only the bare
        // form consumes the next token.
        if ocrValueTakingOptions.contains(argument) { index += 1 }
        index += 1
    }
    return nil
}

switch earlyFlag(in: Array(CommandLine.arguments.dropFirst())) {
case "--help":
    printHelp()
    exit(EXIT_SUCCESS)
case "--version":
    printVersion()
    exit(EXIT_SUCCESS)
case "--update":
    performUpdate()
default:
    break
}

func convertCIImageToCGImage(inputImage: CIImage) -> CGImage? {
    let context = CIContext(options: nil)
    if let cgImage = context.createCGImage(inputImage, from: inputImage.extent) {
        return cgImage
    }
    return nil
}

func loadImage(at url: URL) -> CGImage? {
    guard let ciImage = CIImage(contentsOf: url) else { return nil }
    return convertCIImageToCGImage(inputImage: ciImage)
}

// MARK: - Barcode symbologies

/// Vision spells its symbologies "VNBarcodeSymbologyQR" and friends. The prefix is
/// noise on a command line, so it is dropped on the way out and optional on the way in.
let ocrSymbologyPrefix = "VNBarcodeSymbology"

func symbologyName(_ symbology: VNBarcodeSymbology) -> String {
    let raw = symbology.rawValue
    guard raw.hasPrefix(ocrSymbologyPrefix) else { return raw }
    return String(raw.dropFirst(ocrSymbologyPrefix.count))
}

/// Every symbology this copy of Vision can read. Before Monterey there is nothing
/// to ask, but a fresh request comes configured with all of them, which is the
/// same list by another route.
func supportedSymbologies() -> [VNBarcodeSymbology] {
    let request = VNDetectBarcodesRequest()
    if #available(macOS 12.0, *), let symbologies = try? request.supportedSymbologies() {
        return symbologies
    }
    return request.symbologies
}

/// Case and punctuation are thrown away when matching names, so "QR", "qr",
/// "gs1-databar" and "VNBarcodeSymbologyGS1DataBar" all land on the same symbology.
func symbologyKey(_ name: String) -> String {
    let compact = name.lowercased().filter { $0.isLetter || $0.isNumber }
    let prefix = ocrSymbologyPrefix.lowercased()
    return compact.hasPrefix(prefix) ? String(compact.dropFirst(prefix.count)) : compact
}

/// Turns a `--symbologies QR,EAN13` value into Vision symbologies, exiting with a
/// usable error rather than silently scanning for everything when a name is wrong.
func parseSymbologies(_ list: String) -> [VNBarcodeSymbology] {
    var byKey: [String: VNBarcodeSymbology] = [:]
    for symbology in supportedSymbologies() {
        byKey[symbologyKey(symbology.rawValue)] = symbology
    }

    var chosen: [VNBarcodeSymbology] = []
    for name in list.split(separator: ",") {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { continue }
        guard let symbology = byKey[symbologyKey(trimmed)] else {
            printToStandardError("Error: \"\(trimmed)\" is not a barcode symbology this Mac can read.")
            printToStandardError("Run `ocr --list-symbologies` to see the ones it can.")
            exit(EXIT_FAILURE)
        }
        if !chosen.contains(symbology) { chosen.append(symbology) }
    }

    if chosen.isEmpty {
        printToStandardError("Error: --symbologies needs at least one symbology, e.g. --symbologies QR,EAN13")
        exit(EXIT_FAILURE)
    }
    return chosen
}

// MARK: - Output

func boundingBoxRecord(_ box: CGRect) -> [String: Any] {
    // Vision works in normalised coordinates with the origin at the bottom left.
    return [
        "x": Double(box.origin.x),
        "y": Double(box.origin.y),
        "width": Double(box.size.width),
        "height": Double(box.size.height),
    ]
}

/// VNConfidence is a Float, and widening one to Double turns 0.95 into
/// 0.949999988079071 in the JSON. Four places is more precision than the number
/// carries anyway, and it reads like something a person would write.
func confidenceValue(_ confidence: VNConfidence) -> Double {
    return (Double(confidence) * 10_000).rounded() / 10_000
}

func jsonString(for records: [[String: Any]]) -> String {
    guard !records.isEmpty else { return "[]" }

    let options: JSONSerialization.WritingOptions = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    guard let data = try? JSONSerialization.data(withJSONObject: records, options: options),
          let string = String(data: data, encoding: .utf8) else {
        printToStandardError("Error: could not encode the results as JSON.")
        exit(EXIT_FAILURE)
    }
    return string
}

func copyToClipboard(_ string: String) {
    let pasteboard = NSPasteboard.general
    pasteboard.declareTypes([.string], owner: nil)
    pasteboard.setString(string, forType: .string)
}

/// The whole point of grabit is that what it read ends up on the clipboard, so the
/// clipboard gets the plain payloads even when stdout is JSON for a script to parse.
func emit(payloads: [String], records: [[String: Any]], asJSON: Bool) {
    let joined = payloads.joined(separator: joiner)
    print(asJSON ? jsonString(for: records) : joined)

    // Nothing readable came back, so leave the clipboard holding whatever the user
    // already had. A misjudged capture should cost them a second attempt, not
    // whatever they had copied before it.
    if !joined.isEmpty { copyToClipboard(joined) }
}

// MARK: - Recognition

/// What grabit is looking for. Vision can answer both questions about one image in
/// a single pass, so reading codes as well as text costs a request rather than a
/// second run, which is why `both` is the default.
enum ScanMode {
    case text
    case barcodes
    case both
}

/// How stdout and the clipboard should be shaped from what Vision returned.
enum ReflowMode: String {
    /// One observation per output line, joined with "\n". grabit's default behaviour (macOCR's original
    /// behaviour) — kept as the default so existing scripts that split on
    /// newlines keep working.
    case lines
    /// Reflow observations into visual paragraphs using bounding-box geometry:
    /// fragments on the same visual row join with a space, continuation lines
    /// of a paragraph join with a space, and a paragraph break (large vertical
    /// gap) becomes a blank line.
    case paragraph
}

/// One thing macOCR read: a line of text, or the payload of a barcode.
struct ScanResult {
    /// nil for a barcode carrying bytes that are not text, which have nothing to
    /// contribute to the clipboard.
    let payload: String?
    let record: [String: Any]

    /// Where this sits in reading order. Text keeps the order Vision returned it
    /// in, and each code is given a fractional order so it slots in between the
    /// lines it sits between on screen.
    let order: Double
    let y: Double
    let x: Double
    /// Width and height of the observation's bounding box in Vision's normalised
    /// coordinates. Reflow uses these to group same-row fragments and to detect
    /// paragraph breaks; the JSON path ignores them (the box is already in the
    /// record).
    let width: Double
    let height: Double
    /// True for text observations, false for barcodes. Reflow never space-joins
    /// a barcode with adjacent text — each code always sits on its own line.
    let isText: Bool
}

func scanResults(in image: CGImage, mode: ScanMode, symbologies: [VNBarcodeSymbology]?, asJSON: Bool) -> [ScanResult] {
    var requests: [VNRequest] = []

    let textRequest = VNRecognizeTextRequest()
    textRequest.recognitionLanguages = recognitionLanguages
    if mode != .barcodes { requests.append(textRequest) }

    let barcodeRequest = VNDetectBarcodesRequest()
    if let symbologies = symbologies { barcodeRequest.symbologies = symbologies }
    if mode != .text { requests.append(barcodeRequest) }

    do {
        try VNImageRequestHandler(cgImage: image).perform(requests)
    } catch {
        printToStandardError("Error: unable to read the image: \(error.localizedDescription)")
        exit(EXIT_FAILURE)
    }

    var results: [ScanResult] = []

    let lines = textRequest.results ?? []
    for (index, observation) in lines.enumerated() {
        // Only the top candidate, which is what the clipboard wants.
        guard let candidate = observation.topCandidates(1).first else { continue }
        results.append(ScanResult(
            payload: candidate.string,
            record: [
                "type": "text",
                "text": candidate.string,
                "confidence": confidenceValue(candidate.confidence),
                "boundingBox": boundingBoxRecord(observation.boundingBox),
            ],
            order: Double(index),
            y: Double(observation.boundingBox.midY),
            x: Double(observation.boundingBox.minX),
            width: Double(observation.boundingBox.width),
            height: Double(observation.boundingBox.height),
            isText: true))
    }

    for observation in barcodeRequest.results ?? [] {
        let box = observation.boundingBox

        // Vision returns codes in no particular order, so place each one among the
        // text by where it actually sits: half a step before the first line below
        // it. Vision's origin is the bottom left, so a line with a larger midY is
        // further up the image. Re-sorting the text itself would only make things
        // worse on multi-column layouts, where Vision's own order already reads
        // correctly.
        let linesAbove = lines.filter { $0.boundingBox.midY > box.midY }.count

        var record: [String: Any] = [
            "type": "barcode",
            "symbology": symbologyName(observation.symbology),
            "confidence": confidenceValue(observation.confidence),
            "boundingBox": boundingBoxRecord(box),
        ]

        let payload = observation.payloadStringValue
        if let payload = payload {
            record["payload"] = payload
        } else {
            // Some codes carry bytes that are not text at all. There is nothing to
            // put on the clipboard for those, so say so rather than drop them
            // silently, and hand the bytes over in JSON where they can be decoded.
            var note = "Note: skipped a \(symbologyName(observation.symbology)) code whose payload is not text"
            if #available(macOS 14.0, *), let data = observation.payloadData {
                record["payloadBase64"] = data.base64EncodedString()
                note += asJSON ? "; it is in the JSON as payloadBase64." : "; run again with --json to get it as base64."
            } else {
                note += "."
            }
            printToStandardError(note)
        }

        results.append(ScanResult(
            payload: payload,
            record: record,
            order: Double(linesAbove) - 0.5,
            y: Double(box.midY),
            x: Double(box.minX),
            width: Double(box.width),
            height: Double(box.height),
            isText: false))
    }

    return results.sorted { first, second in
        if first.order != second.order { return first.order < second.order }
        // Centres within a percent of the image height count as the same row, so
        // two codes side by side come out left to right instead of being ordered by
        // whichever sits a hair higher. Rounding to a row is a plain function of y,
        // so this stays a consistent ordering rather than a fuzzy comparison.
        let firstRow = (first.y * 100).rounded(), secondRow = (second.y * 100).rounded()
        if firstRow != secondRow { return firstRow > secondRow }
        return first.x < second.x
    }
}

// MARK: - Text reflow
//
// Vision returns one observation per detected line segment. Joining those with
// "\n" (grabit's default behaviour (macOCR's original --reflow lines behaviour) turns a paragraph on screen
// into a vertical stack of lines on the clipboard. --reflow paragraph groups
// same-row fragments and treats consecutive close-together rows as continuation
// lines of one paragraph, so a paragraph on screen becomes a paragraph on the
// clipboard.

/// Reflows text observations into readable paragraphs using bounding-box geometry.
///
/// - Fragments on the same visual row (midY within half a line-height) join with a space.
/// - Rows separated by less than 1.6 line-heights are continuation lines of the same
///   paragraph and also join with a space.
/// - Rows separated by more than that get a blank line between them (paragraph break).
/// - Barcodes are never merged with text; each barcode gets its own line.
/// - A large horizontal gap between two same-row fragments (> 3 line-heights of
///   whitespace) is treated as a column break, not a within-line gap, so multi-column
///   layouts don't get their columns space-joined into gibberish.
///
/// Returns one string per output line. emit() joins these with the "\n" joiner,
/// so a "" element produces "\n\n" — a blank line, i.e. a paragraph break.
func reflowedPayloads(from results: [ScanResult]) -> [String] {
    // Only text participates in reflow; barcodes are emitted verbatim, each on
    // its own line, interleaved by the caller's order.
    struct Item {
        let payload: String
        let isText: Bool
        let order: Double
        let midY: Double
        let minX: Double
        let maxX: Double
        let height: Double
    }

    let items: [Item] = results.compactMap { r in
        guard let p = r.payload else { return nil }
        return Item(
            payload: p, isText: r.isText, order: r.order,
            midY: r.y, minX: r.x, maxX: r.x + r.width, height: r.height)
    }
    guard items.count > 1 else { return items.map { $0.payload } }

    // Keep the caller's reading order (top-to-bottom, left-to-right, with
    // barcodes slotted in) but let each row-grouping decision use geometry.
    let sorted = items.sorted { $0.order < $1.order }

    // Row grouping: an item joins the previous row when both are text, midY
    // matches within half a line-height, and the horizontal gap is small
    // enough that this really is the same visual line (not a neighbouring
    // column at the same vertical position).
    var rows: [[Item]] = []
    for item in sorted {
        var mergedIntoPrevious = false
        if item.isText, let lastRow = rows.last, let last = lastRow.last, last.isText {
            let lineHeight = max(0.0001, min(item.height, last.height))
            let sameRow = abs(item.midY - last.midY) <= lineHeight * 0.5
            // maxX of the row's rightmost item vs this item's minX. Columns
            // typically leave a gutter several line-heights wide.
            let rightmostMaxX = lastRow.map { $0.maxX }.max() ?? last.maxX
            let horizontalGap = item.minX - rightmostMaxX
            let sameColumn = horizontalGap <= lineHeight * 3.0
            if sameRow && sameColumn {
                rows[rows.count - 1].append(item)
                mergedIntoPrevious = true
            }
        }
        if !mergedIntoPrevious {
            rows.append([item])
        }
    }

    // Emit each row. Between text rows in the same paragraph, join with a
    // space (continuation line). Between paragraphs, insert a blank line.
    // Barcodes always break the paragraph — a code sitting between two lines
    // of prose is not a continuation of the prose above it.
    var lines: [String] = []
    var currentParagraph: String = ""

    func flushParagraph() {
        if !currentParagraph.isEmpty {
            lines.append(currentParagraph)
            currentParagraph = ""
        }
    }

    for (i, row) in rows.enumerated() {
        let rowText = row.map { $0.payload }.joined(separator: " ")
        let rowIsText = row.first?.isText ?? false

        if !rowIsText {
            // Barcode row: flush any pending paragraph, then emit the payload
            // on its own line.
            flushParagraph()
            lines.append(rowText)
            continue
        }

        if i == 0 {
            currentParagraph = rowText
            continue
        }

        // Decide if this text row continues the current paragraph or starts
        // a new one. A large vertical gap (> ~1.6 line-heights of whitespace
        // between the two rows) means a new paragraph. A large horizontal
        // indent shift is a weaker signal we deliberately don't act on —
        // paragraph indents don't consistently exist in screen captures.
        let prev = rows[i - 1]
        let prevWasText = prev.first?.isText ?? false
        if !prevWasText {
            // Previous row was a barcode; start a fresh paragraph.
            currentParagraph = rowText
            continue
        }

        let prevMidY = prev.map { $0.midY }.min() ?? row[0].midY
        let prevHeight = prev.map { $0.height }.max() ?? row[0].height
        let curMidY = row.map { $0.midY }.max() ?? prevMidY
        let curHeight = row.map { $0.height }.max() ?? prevHeight
        // Vision's origin is bottom-left, so prev (higher on screen) has a
        // larger midY than cur. The centre-to-centre distance minus half of
        // each line height is the whitespace between them.
        let gap = prevMidY - curMidY - (prevHeight + curHeight) / 2
        let referenceLineHeight = max(prevHeight, curHeight)
        let paragraphBreak = gap > referenceLineHeight * 0.6

        if paragraphBreak {
            flushParagraph()
            lines.append("") // blank line → \n\n
            currentParagraph = rowText
        } else {
            currentParagraph += " " + rowText
        }
    }
    flushParagraph()

    return lines
}

func report(_ results: [ScanResult], mode: ScanMode, reflow: ReflowMode, asJSON: Bool) -> Never {
    let payloads: [String]
    switch reflow {
    case .lines:
        payloads = results.compactMap { $0.payload }
    case .paragraph:
        payloads = reflowedPayloads(from: results)
    }
    let records = results.map { $0.record }

    // Only --barcodes treats finding nothing as a failure: it is the one mode that
    // exists solely to find codes, so a script can branch on it. The default and
    // --no-barcodes keep succeeding on a blank region, as macOCR always has.
    if mode == .barcodes && records.isEmpty {
        // An empty array still parses, so a script piping into jq gets something
        // it can read; the exit status is what says nothing was found.
        if asJSON { print("[]") }
        printToStandardError("No barcodes found.")
        exit(EXIT_FAILURE)
    }

    emit(payloads: payloads, records: records, asJSON: asJSON)
    exit(EXIT_SUCCESS)
}


var recognitionLanguages = ["en-US"]

do {


    let arguments = Array(CommandLine.arguments.dropFirst())

    let parser = ArgumentParser(usage: "<options>", overview: "grabit reads text and barcodes off your screen and puts the result on your clipboard. It understands paragraphs, columns, and mixed text/barcode captures — pass --reflow paragraph to get prose back as prose instead of one line per Vision observation.")

    let listLanguagesOption = parser.add(option: "--list-languages", kind: Bool.self, usage: "List supported OCR languages")
    let barcodesOption = parser.add(option: "--barcodes", shortName: "-b", kind: Bool.self, usage: "Read only QR codes and barcodes, ignoring any text")
    let noBarcodesOption = parser.add(option: "--no-barcodes", kind: Bool.self, usage: "Read only text, ignoring any QR codes and barcodes")
    let symbologiesOption = parser.add(option: "--symbologies", kind: String.self, usage: "Only look for these symbologies, e.g. QR,EAN13")
    let listSymbologiesOption = parser.add(option: "--list-symbologies", kind: Bool.self, usage: "List supported barcode symbologies")
    let jsonOption = parser.add(option: "--json", kind: Bool.self, usage: "Print results as JSON instead of plain text")
    let rectOption = parser.add(option: "--rect", shortName: "-R", kind: String.self, usage: "Capture specific region: x,y,width,height (no interactive selection)")
    let inputFileOption = parser.add(option: "--input", shortName: "-i", kind: String.self, usage: "Use image file instead of screen capture")
    let saveImageOption = parser.add(option: "--save-image", shortName: "-s", kind: String.self, usage: "Save captured screenshot to specified path")
    let reflowOption = parser.add(option: "--reflow", kind: String.self, usage: "Text layout: lines (default, one line per observation) or paragraph (reflow into paragraphs)")

    // --language is only registered on Big Sur and later, where Vision can
    // actually recognise something other than English.
    var languageOption: OptionArgument<String>? = nil
    if bigSur {
        languageOption = parser.add(option: "--language", shortName: "-l", kind: String.self, usage: "Set Language (Supports Big Sur and Above)")
    }

    var rectValues: (x: Int, y: Int, w: Int, h: Int)? = nil
    var inputFile: String? = nil
    var saveImagePath: String? = nil

    let parsedArguments = try parser.parse(arguments)

    // Check if user wants to list languages
    if parsedArguments.get(listLanguagesOption) == true {
        // Ask the same request the OCR path uses rather than a fixed revision.
        // Pinning revision 2 here reported eight languages on Macs whose Vision
        // recognises thirty, so --language accepted codes this flag never listed.
        let request = VNRecognizeTextRequest()

        var languages: [String] = []
        if #available(macOS 12.0, *) {
            languages = (try? request.supportedRecognitionLanguages()) ?? []
        } else if #available(macOS 11.0, *) {
            languages = (try? VNRecognizeTextRequest.supportedRecognitionLanguages(
                for: .accurate, revision: request.revision)) ?? []
        }

        guard !languages.isEmpty else {
            print("en-US (choosing a language requires macOS 11.0 or later)")
            exit(EXIT_SUCCESS)
        }

        print("Supported languages (accurate):")
        for language in languages {
            print("  \(language)")
        }
        exit(EXIT_SUCCESS)
    }

    if parsedArguments.get(listSymbologiesOption) == true {
        print("Supported barcode symbologies:")
        for symbology in supportedSymbologies().map(symbologyName).sorted() {
            print("  \(symbology)")
        }
        exit(EXIT_SUCCESS)
    }

    let outputJSON = parsedArguments.get(jsonOption) == true
    let barcodesOnly = parsedArguments.get(barcodesOption) == true
    let textOnly = parsedArguments.get(noBarcodesOption) == true

    if barcodesOnly && textOnly {
        printToStandardError("Error: --barcodes and --no-barcodes ask for opposite things; pick one.")
        exit(EXIT_FAILURE)
    }

    // Reading both is the default: a screenshot with a QR code in it should give
    // you the QR code without your having to know it was there beforehand.
    let mode: ScanMode = barcodesOnly ? .barcodes : (textOnly ? .text : .both)

    var symbologies: [VNBarcodeSymbology]? = nil
    if let list = parsedArguments.get(symbologiesOption) {
        guard mode != .text else {
            printToStandardError("Error: --symbologies has nothing to narrow when --no-barcodes is set.")
            exit(EXIT_FAILURE)
        }
        symbologies = parseSymbologies(list)
    }

    // Parse rect option
    if let rectString = parsedArguments.get(rectOption) {
        let parts = rectString.split(separator: ",").compactMap { Int($0) }
        if parts.count == 4 {
            rectValues = (x: parts[0], y: parts[1], w: parts[2], h: parts[3])
        } else {
            printToStandardError("Error: --rect requires format x,y,width,height (e.g., --rect 100,100,500,300)")
            exit(EXIT_FAILURE)
        }
    }

    // Parse input file option
    inputFile = parsedArguments.get(inputFileOption)

    // Parse save image option
    saveImagePath = parsedArguments.get(saveImageOption)

    // Parse reflow mode
    var reflow: ReflowMode = .lines
    if let raw = parsedArguments.get(reflowOption) {
        guard let parsed = ReflowMode(rawValue: raw.lowercased()) else {
            printToStandardError("Error: --reflow must be 'lines' or 'paragraph', not \"\(raw)\".")
            exit(EXIT_FAILURE)
        }
        reflow = parsed
    }

    if let languageOption = languageOption, let language = parsedArguments.get(languageOption), !language.isEmpty {
        recognitionLanguages.insert(language, at: 0)
    }

    if inputFile != nil && saveImagePath != nil {
        printToStandardError("Warning: --save-image has nothing to save when --input is used; ignoring it.")
    }

    // Determine the image to process
    let imageURL: URL
    // Set only when grabit took the screenshot itself, and so is the one that has
    // to tidy it up afterwards.
    var temporaryCapture: String? = nil

    if let input = inputFile {
        // Use provided image file
        let inputPath = (input as NSString).expandingTildeInPath
        imageURL = URL(fileURLWithPath: inputPath)
        if !FileManager.default.fileExists(atPath: imageURL.path) {
            printToStandardError("Error: Input file does not exist: \(input)")
            exit(EXIT_FAILURE)
        }
    } else {
        // The screenshot lands in this user's own temp directory rather than a
        // shared one, under a name carrying this process's id so that two runs at
        // once cannot read each other's capture. Any earlier file of the same name
        // is cleared first, so cancelling the capture leaves nothing behind to be
        // mistaken for a screenshot the user just took.
        let tempPath = (NSTemporaryDirectory() as NSString)
            .appendingPathComponent("grabit-capture-\(ProcessInfo.processInfo.processIdentifier).png")
        try? FileManager.default.removeItem(atPath: tempPath)

        if let rect = rectValues {
            let _ = ScreenCapture.captureRect(destination: tempPath, x: rect.x, y: rect.y, width: rect.w, height: rect.h)
        } else {
            let _ = ScreenCapture.captureRegion(destination: tempPath)
        }

        guard FileManager.default.fileExists(atPath: tempPath) else {
            printToStandardError("No screenshot was taken; the capture was cancelled.")
            exit(EXIT_FAILURE)
        }

        imageURL = URL(fileURLWithPath: tempPath)
        temporaryCapture = tempPath

        // Save image if requested
        if let savePath = saveImagePath {
            let expandedPath = (savePath as NSString).expandingTildeInPath
            do {
                try FileManager.default.copyItem(atPath: tempPath, toPath: expandedPath)
            } catch {
                printToStandardError("Warning: Could not save image to \(savePath): \(error.localizedDescription)")
            }
        }
    }

    let decoded = loadImage(at: imageURL)

    // The screenshot has been decoded into memory, so the file has done its job.
    // Leaving it on disk would mean every run of grabit abandoned a copy of
    // whatever was on screen at the time.
    if let path = temporaryCapture {
        try? FileManager.default.removeItem(atPath: path)
    }

    guard let image = decoded else {
        printToStandardError("Error: could not read an image from \(imageURL.path)")
        exit(EXIT_FAILURE)
    }

    report(scanResults(in: image, mode: mode, symbologies: symbologies, asJSON: outputJSON),
           mode: mode,
           reflow: reflow,
           asJSON: outputJSON)

} catch {
    printToStandardError("Error: \(error)")
    printToStandardError("Run `grabit --help` for usage.")
    exit(EXIT_FAILURE)
}

exit(EXIT_SUCCESS)
