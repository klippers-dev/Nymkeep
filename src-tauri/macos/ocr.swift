import Foundation
import Vision
import ImageIO

// Offline stdin PNG -> stdout JSON. No files, image arguments or content logs.
struct Word: Encodable {
    let text: String
    let x: UInt32
    let y: UInt32
    let w: UInt32
    let h: UInt32
    let conf: Float
}
struct Result: Encodable {
    let width: UInt32
    let height: UInt32
    let words: [Word]
}
enum RecognitionFailure: Error { case unavailable }

func request() -> VNRecognizeTextRequest {
    let value = VNRecognizeTextRequest()
    value.recognitionLevel = .accurate
    value.usesLanguageCorrection = false
    value.automaticallyDetectsLanguage = true
    return value
}

do {
    if Array(CommandLine.arguments.dropFirst()) == ["--probe"] {
        guard !(try request().supportedRecognitionLanguages()).isEmpty else {
            throw RecognitionFailure.unavailable
        }
        exit(0)
    }
    guard CommandLine.arguments.count == 1 else { throw RecognitionFailure.unavailable }
    // Read at most one byte beyond the accepted limit, never unbounded stdin.
    let limit = 20 * 1024 * 1024
    var data = Data()
    while data.count <= limit {
        let chunk = try FileHandle.standardInput.read(upToCount: min(65536, limit + 1 - data.count)) ?? Data()
        if chunk.isEmpty { break }
        data.append(chunk)
    }
    guard !data.isEmpty, data.count <= limit,
          let source = CGImageSourceCreateWithData(data as CFData, nil),
          let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [String: Any],
          let widthNumber = properties[kCGImagePropertyPixelWidth as String] as? NSNumber,
          let heightNumber = properties[kCGImagePropertyPixelHeight as String] as? NSNumber else {
        throw RecognitionFailure.unavailable
    }
    let width = widthNumber.intValue
    let height = heightNumber.intValue
    guard width > 0, height > 0, width <= 8192, height <= 8192,
          width * height <= 16_000_000 else { throw RecognitionFailure.unavailable }
    let recognition = request()
    try VNImageRequestHandler(data: data, options: [:]).perform([recognition])
    var words: [Word] = []
    var textBytes = 0
    for observation in recognition.results ?? [] {
        guard let candidate = observation.topCandidates(1).first else { continue }
        let text = candidate.string
        // Preserve email/IP punctuation. Word-only tokenizers split sensitive patterns.
        for token in text.split(whereSeparator: { $0.isWhitespace }) {
            let rectangle = (try? candidate.boundingBox(for: token.startIndex..<token.endIndex))?.boundingBox
                ?? observation.boundingBox
            guard rectangle.minX.isFinite, rectangle.minY.isFinite,
                  rectangle.maxX.isFinite, rectangle.maxY.isFinite else {
                throw RecognitionFailure.unavailable
            }
            let left = Int(floor(max(0, min(Double(width), Double(rectangle.minX) * Double(width)))))
            let right = Int(ceil(max(0, min(Double(width), Double(rectangle.maxX) * Double(width)))))
            // Vision's lower-left origin -> our top-left pixel coordinates.
            let top = Int(floor(max(0, min(Double(height), (1 - Double(rectangle.maxY)) * Double(height)))))
            let bottom = Int(ceil(max(0, min(Double(height), (1 - Double(rectangle.minY)) * Double(height)))))
            guard right > left, bottom > top else { continue }
            textBytes += token.utf8.count + 1
            guard textBytes <= 100_000, words.count < 10_000 else { throw RecognitionFailure.unavailable }
            words.append(Word(text: String(token), x: UInt32(left), y: UInt32(top),
                              w: UInt32(right - left), h: UInt32(bottom - top), conf: candidate.confidence))
        }
    }
    let result = Result(width: UInt32(width), height: UInt32(height), words: words)
    let json = try JSONEncoder().encode(result)
    guard json.count <= 4 * 1024 * 1024 else { throw RecognitionFailure.unavailable }
    try FileHandle.standardOutput.write(contentsOf: json)
} catch {
    // Never expose Foundation/Vision descriptions, payloads or selected filenames.
    try? FileHandle.standardError.write(contentsOf: Data("Text recognition unavailable.\n".utf8))
    exit(1)
}
