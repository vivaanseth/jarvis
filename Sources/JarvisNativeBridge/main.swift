import AppKit
import ApplicationServices
import AVFoundation
import Contacts
import CoreGraphics
import EventKit
import Foundation
import PDFKit
import Speech
import UserNotifications
import Vision

struct BridgeRequest: Decodable {
    let id: String
    let method: String
    let params: [String: JSONValue]?
}

enum JSONValue: Codable {
    case string(String), number(Double), bool(Bool), object([String: JSONValue]), array([JSONValue]), null

    init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer()
        if value.decodeNil() { self = .null }
        else if let decoded = try? value.decode(Bool.self) { self = .bool(decoded) }
        else if let decoded = try? value.decode(Double.self) { self = .number(decoded) }
        else if let decoded = try? value.decode(String.self) { self = .string(decoded) }
        else if let decoded = try? value.decode([String: JSONValue].self) { self = .object(decoded) }
        else { self = .array(try value.decode([JSONValue].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var value = encoder.singleValueContainer()
        switch self {
        case .string(let decoded): try value.encode(decoded)
        case .number(let decoded): try value.encode(decoded)
        case .bool(let decoded): try value.encode(decoded)
        case .object(let decoded): try value.encode(decoded)
        case .array(let decoded): try value.encode(decoded)
        case .null: try value.encodeNil()
        }
    }

    var string: String? { if case .string(let value) = self { value } else { nil } }
    var bool: Bool? { if case .bool(let value) = self { value } else { nil } }
}

enum BridgeFailure: LocalizedError {
    case invalid(String), permission(String), unavailable(String)
    var errorDescription: String? {
        switch self {
        case .invalid(let message), .permission(let message), .unavailable(let message): message
        }
    }
}

enum BridgeOutput {
    private static let lock = NSLock()
    static func send(_ value: [String: Any]) {
        guard JSONSerialization.isValidJSONObject(value), let data = try? JSONSerialization.data(withJSONObject: value), let line = String(data: data, encoding: .utf8) else { return }
        lock.lock(); defer { lock.unlock() }
        FileHandle.standardOutput.write(Data((line + "\n").utf8))
    }
    static func event(_ name: String, _ payload: [String: Any]) { send(["event": name, "payload": payload]) }
}

@MainActor
final class SpeechSession: NSObject {
    private let engine = AVAudioEngine()
    private let recognizer = SFSpeechRecognizer(locale: .current)
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var tapInstalled = false
    private let synthesizer = AVSpeechSynthesizer()

    func capabilities() -> [String: Any] {
        ["locale": recognizer?.locale.identifier ?? Locale.current.identifier,
         "available": recognizer?.isAvailable ?? false,
         "onDevice": recognizer?.supportsOnDeviceRecognition ?? false]
    }

    func start(wakeWord: Bool, allowNetwork: Bool) throws -> [String: Any] {
        guard SFSpeechRecognizer.authorizationStatus() == .authorized, AVCaptureDevice.authorizationStatus(for: .audio) == .authorized else { throw BridgeFailure.permission("Microphone and Speech Recognition permissions are required.") }
        guard let recognizer, recognizer.isAvailable else { throw BridgeFailure.unavailable("Apple Speech Recognition is currently unavailable.") }
        let onDevice = recognizer.supportsOnDeviceRecognition
        let language = Locale.current.localizedString(forIdentifier: recognizer.locale.identifier) ?? recognizer.locale.identifier
        guard onDevice || allowNetwork else { throw BridgeFailure.unavailable("Apple does not expose \(language) on-device Speech recognition to Jarvis on this Mac. System Dictation is separate; explicitly allow Apple Speech transcription in Jarvis Connections to use voice input.") }
        stop()
        let recognition = SFSpeechAudioBufferRecognitionRequest(); recognition.requiresOnDeviceRecognition = onDevice; recognition.shouldReportPartialResults = true
        request = recognition
        let input = engine.inputNode; let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else { throw BridgeFailure.unavailable("No usable microphone input is available.") }
        input.installTap(onBus: 0, bufferSize: 1_024, format: format) { buffer, _ in recognition.append(buffer) }; tapInstalled = true
        engine.prepare(); try engine.start()
        task = recognizer.recognitionTask(with: recognition) { result, error in
            if let result {
                let transcript = result.bestTranscription.formattedString
                BridgeOutput.event("speech.transcript", ["text": transcript, "final": result.isFinal, "wakeWord": wakeWord && transcript.localizedCaseInsensitiveContains("jarvis")])
            }
            if let error { BridgeOutput.event("speech.error", ["message": error.localizedDescription]) }
        }
        return ["listening": true, "onDevice": onDevice, "locale": recognizer.locale.identifier]
    }

    func stop() {
        if engine.isRunning { engine.stop() }
        if tapInstalled { engine.inputNode.removeTap(onBus: 0); tapInstalled = false }
        request?.endAudio(); task?.cancel(); request = nil; task = nil
    }

    func speak(_ text: String, rate: Float) {
        if synthesizer.isSpeaking { synthesizer.stopSpeaking(at: .immediate) }
        let utterance = AVSpeechUtterance(string: text); utterance.rate = min(0.65, max(0.25, rate)); synthesizer.speak(utterance)
    }
}

@MainActor
final class AudioCapture: NSObject, AVAudioRecorderDelegate {
    private var recorder: AVAudioRecorder?
    private var fileURL: URL?

    func inputs() -> [[String: String]] {
        AVCaptureDevice.devices(for: .audio).map { ["id": $0.uniqueID, "name": $0.localizedName] }
    }

    func start() throws -> [String: Any] {
        guard AVCaptureDevice.authorizationStatus(for: .audio) == .authorized else { throw BridgeFailure.permission("Microphone permission is required for local transcription.") }
        _ = stop(delete: true)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("jarvis-voice-\(UUID().uuidString).wav")
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatLinearPCM), AVSampleRateKey: 16_000,
            AVNumberOfChannelsKey: 1, AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false
        ]
        let capture = try AVAudioRecorder(url: url, settings: settings)
        capture.delegate = self; capture.isMeteringEnabled = true
        guard capture.prepareToRecord(), capture.record(forDuration: 30) else { throw BridgeFailure.unavailable("The microphone could not start recording.") }
        recorder = capture; fileURL = url
        return ["recording": true, "path": url.path, "maximumSeconds": 30]
    }

    func stop(delete: Bool = false) -> [String: Any] {
        recorder?.stop(); recorder = nil
        guard let url = fileURL else { return ["recording": false] }
        fileURL = nil
        if delete { try? FileManager.default.removeItem(at: url); return ["recording": false] }
        let bytes = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.intValue ?? 0
        return ["recording": false, "path": url.path, "bytes": bytes]
    }
}

@MainActor
final class NativeBridge {
    private let events = EKEventStore()
    private let contacts = CNContactStore()
    private let speech = SpeechSession()
    private let audio = AudioCapture()
    private let formatter = ISO8601DateFormatter()

    func handle(_ request: BridgeRequest) async throws -> Any {
        let params = request.params ?? [:]
        switch request.method {
        case "ping": return ["version": 2, "platform": "macOS", "onDeviceSpeech": SFSpeechRecognizer(locale: .current)?.supportsOnDeviceRecognition ?? false]
        case "speech.capabilities": return speech.capabilities()
        case "permissions.status": return permissionStatus()
        case "permissions.request": try await requestPermission(required(params, "kind")); return permissionStatus()
        case "permissions.requestVoice":
            try await requestPermission("microphone")
            try await requestPermission("speech")
            return permissionStatus()
        case "calendar.upcoming": return try await upcoming(days: Int(params["days"]?.string ?? "7") ?? 7)
        case "calendar.create": try await createEvent(title: required(params, "title"), start: required(params, "start"), end: params["end"]?.string); return ["saved": true]
        case "reminders.create": try await createReminder(title: required(params, "title"), due: params["due"]?.string); return ["saved": true]
        case "contacts.search": return try await searchContacts(required(params, "query"))
        case "speech.start": return try speech.start(wakeWord: params["wakeWord"]?.bool ?? false, allowNetwork: params["allowNetwork"]?.bool ?? false)
        case "speech.stop": speech.stop(); return ["listening": false]
        case "speech.speak": speech.speak(try required(params, "text"), rate: Float(params["rate"]?.string ?? "0.48") ?? 0.48); return ["speaking": true]
        case "audio.inputs": return audio.inputs()
        case "audio.record.start": return try audio.start()
        case "audio.record.stop": return audio.stop()
        case "audio.record.cancel": return audio.stop(delete: true)
        case "document.extractPDF": return try extractPDF(try required(params, "path"))
        case "document.ocrImage": return try recognizeImage(try required(params, "path"))
        case "screen.ocr": return try await captureOCR()
        case "window.action": try windowAction(required(params, "action")); return ["completed": true]
        default: throw BridgeFailure.invalid("Unsupported native method: \(request.method)")
        }
    }

    private func required(_ params: [String: JSONValue], _ key: String) throws -> String {
        guard let value = params[key]?.string, !value.isEmpty else { throw BridgeFailure.invalid("Missing \(key).") }; return value
    }

    private func permissionStatus() -> [String: String] {
        func speechState(_ value: SFSpeechRecognizerAuthorizationStatus) -> String { value == .authorized ? "authorized" : value == .denied || value == .restricted ? "denied" : "notRequested" }
        func audioState(_ value: AVAuthorizationStatus) -> String { value == .authorized ? "authorized" : value == .denied || value == .restricted ? "denied" : "notRequested" }
        func eventState(_ value: EKAuthorizationStatus) -> String {
            if #available(macOS 14, *), value == .fullAccess || value == .writeOnly { return "authorized" }
            return value == .authorized ? "authorized" : value == .denied || value == .restricted ? "denied" : "notRequested"
        }
        return ["accessibility": AXIsProcessTrusted() ? "authorized" : "notRequested", "screen": CGPreflightScreenCaptureAccess() ? "authorized" : "notRequested", "microphone": audioState(AVCaptureDevice.authorizationStatus(for: .audio)), "speech": speechState(SFSpeechRecognizer.authorizationStatus()), "calendar": eventState(EKEventStore.authorizationStatus(for: .event)), "reminders": eventState(EKEventStore.authorizationStatus(for: .reminder)), "contacts": CNContactStore.authorizationStatus(for: .contacts) == .authorized ? "authorized" : "notRequested"]
    }

    private func requestPermission(_ kind: String) async throws {
        switch kind {
        case "accessibility": _ = AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary)
        case "screen": _ = CGRequestScreenCaptureAccess()
        case "microphone": _ = await AVCaptureDevice.requestAccess(for: .audio)
        case "speech": await withCheckedContinuation { continuation in SFSpeechRecognizer.requestAuthorization { _ in continuation.resume() } }
        case "calendar": _ = try await calendarAccess()
        case "reminders": _ = try await reminderAccess()
        case "contacts": _ = try await contacts.requestAccess(for: .contacts)
        case "notifications": _ = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
        default: throw BridgeFailure.invalid("Unknown permission: \(kind)")
        }
    }

    private func calendarAccess() async throws -> Bool {
        if #available(macOS 14, *) { return try await events.requestFullAccessToEvents() }
        return await withCheckedContinuation { continuation in events.requestAccess(to: .event) { granted, _ in continuation.resume(returning: granted) } }
    }
    private func reminderAccess() async throws -> Bool {
        if #available(macOS 14, *) { return try await events.requestFullAccessToReminders() }
        return await withCheckedContinuation { continuation in events.requestAccess(to: .reminder) { granted, _ in continuation.resume(returning: granted) } }
    }

    private func createEvent(title: String, start: String, end: String?) async throws {
        guard try await calendarAccess() else { throw BridgeFailure.permission("Calendar permission was denied.") }
        guard let startDate = formatter.date(from: start), let calendar = events.defaultCalendarForNewEvents else { throw BridgeFailure.invalid("A valid start and writable calendar are required.") }
        let event = EKEvent(eventStore: events); event.title = title; event.startDate = startDate; event.endDate = end.flatMap(formatter.date) ?? startDate.addingTimeInterval(3_600); event.calendar = calendar
        try events.save(event, span: .thisEvent, commit: true)
    }

    private func createReminder(title: String, due: String?) async throws {
        guard try await reminderAccess() else { throw BridgeFailure.permission("Reminders permission was denied.") }
        guard let calendar = events.defaultCalendarForNewReminders() else { throw BridgeFailure.unavailable("No writable reminders list is available.") }
        let reminder = EKReminder(eventStore: events); reminder.title = title; reminder.calendar = calendar
        if let due, let date = formatter.date(from: due) { reminder.dueDateComponents = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date) }
        try events.save(reminder, commit: true)
    }

    private func upcoming(days: Int) async throws -> [[String: String]] {
        guard try await calendarAccess() else { throw BridgeFailure.permission("Calendar permission was denied.") }
        let start = Date(); let end = Calendar.current.date(byAdding: .day, value: min(31, max(1, days)), to: start)!
        return events.events(matching: events.predicateForEvents(withStart: start, end: end, calendars: nil)).sorted { $0.startDate < $1.startDate }.prefix(50).map { ["id": $0.eventIdentifier ?? "", "title": $0.title ?? "Untitled event", "start": formatter.string(from: $0.startDate), "end": formatter.string(from: $0.endDate), "calendar": $0.calendar.title] }
    }

    private func searchContacts(_ query: String) async throws -> [[String: Any]] {
        guard try await contacts.requestAccess(for: .contacts) else { throw BridgeFailure.permission("Contacts permission was denied.") }
        let keys: [CNKeyDescriptor] = [CNContactIdentifierKey as CNKeyDescriptor, CNContactGivenNameKey as CNKeyDescriptor, CNContactFamilyNameKey as CNKeyDescriptor, CNContactEmailAddressesKey as CNKeyDescriptor, CNContactPhoneNumbersKey as CNKeyDescriptor]
        let request = CNContactFetchRequest(keysToFetch: keys); var results: [[String: Any]] = []
        try contacts.enumerateContacts(with: request) { contact, stop in
            let name = "\(contact.givenName) \(contact.familyName)".trimmingCharacters(in: .whitespaces)
            let values = [name] + contact.emailAddresses.map { $0.value as String } + contact.phoneNumbers.map { $0.value.stringValue }
            if values.contains(where: { $0.localizedCaseInsensitiveContains(query) }) { results.append(["id": contact.identifier, "name": name, "emails": contact.emailAddresses.map { $0.value as String }, "phones": contact.phoneNumbers.map { $0.value.stringValue }]); if results.count >= 20 { stop.pointee = true } }
        }
        return results
    }

    private func captureOCR() async throws -> [String: Any] {
        guard CGPreflightScreenCaptureAccess() || CGRequestScreenCaptureAccess() else { throw BridgeFailure.permission("Screen Recording permission was denied.") }
        guard let image = CGWindowListCreateImage(.infinite, .optionOnScreenOnly, kCGNullWindowID, [.bestResolution, .boundsIgnoreFraming]) else { throw BridgeFailure.unavailable("The current screen could not be captured.") }
        let request = VNRecognizeTextRequest(); request.recognitionLevel = .accurate; request.usesLanguageCorrection = true
        try VNImageRequestHandler(cgImage: image).perform([request])
        let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
        return ["text": lines.joined(separator: "\n"), "lineCount": lines.count]
    }

    private func extractPDF(_ path: String) throws -> [String: Any] {
        let url = URL(fileURLWithPath: path)
        guard url.pathExtension.lowercased() == "pdf", let document = PDFDocument(url: url) else { throw BridgeFailure.invalid("The PDF could not be opened.") }
        if document.isEncrypted && document.isLocked { throw BridgeFailure.invalid("Encrypted PDFs are not supported.") }
        var pages: [String] = []
        for index in 0..<min(document.pageCount, 250) {
            let text = document.page(at: index)?.string?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if !text.isEmpty { pages.append("[Page \(index + 1)]\n\(text)") }
        }
        return ["text": pages.joined(separator: "\n\n"), "pageCount": document.pageCount]
    }

    private func recognizeImage(_ path: String) throws -> [String: Any] {
        let url = URL(fileURLWithPath: path)
        guard FileManager.default.fileExists(atPath: url.path) else { throw BridgeFailure.invalid("The image does not exist.") }
        let request = VNRecognizeTextRequest(); request.recognitionLevel = .accurate; request.usesLanguageCorrection = true
        try VNImageRequestHandler(url: url).perform([request])
        let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
        return ["text": lines.joined(separator: "\n"), "lineCount": lines.count]
    }

    private func windowAction(_ action: String) throws {
        guard AXIsProcessTrusted() else { throw BridgeFailure.permission("Accessibility permission is required for window control.") }
        let system = AXUIElementCreateSystemWide(); var focused: CFTypeRef?
        guard AXUIElementCopyAttributeValue(system, kAXFocusedWindowAttribute as CFString, &focused) == .success, let window = focused else { throw BridgeFailure.unavailable("No focused window is available.") }
        let element = window as! AXUIElement
        switch action {
        case "minimize": AXUIElementSetAttributeValue(element, kAXMinimizedAttribute as CFString, kCFBooleanTrue)
        case "maximize":
            var button: CFTypeRef?
            if AXUIElementCopyAttributeValue(element, kAXZoomButtonAttribute as CFString, &button) == .success, let button { AXUIElementPerformAction(button as! AXUIElement, kAXPressAction as CFString) }
            else { AXUIElementPerformAction(element, kAXRaiseAction as CFString) }
        case "close":
            var button: CFTypeRef?
            guard AXUIElementCopyAttributeValue(element, kAXCloseButtonAttribute as CFString, &button) == .success, let button else { throw BridgeFailure.unavailable("The focused window has no close control.") }
            AXUIElementPerformAction(button as! AXUIElement, kAXPressAction as CFString)
        default: throw BridgeFailure.invalid("Unsupported window action.")
        }
    }
}

@main
struct JarvisNativeBridgeMain {
    static func main() async {
        let bridge = NativeBridge()
        while let line = readLine() {
            guard let data = line.data(using: .utf8) else { continue }
            do {
                let request = try JSONDecoder().decode(BridgeRequest.self, from: data)
                let result = try await bridge.handle(request)
                BridgeOutput.send(["id": request.id, "ok": true, "result": result])
            } catch {
                let id = (try? JSONDecoder().decode(BridgeRequest.self, from: data).id) ?? "unknown"
                BridgeOutput.send(["id": id, "ok": false, "error": error.localizedDescription])
            }
        }
    }
}
