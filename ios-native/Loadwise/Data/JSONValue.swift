import Foundation

/// Any JSON value. Settings forms read a server object, change a few keys and
/// send the whole object back, so keys the app does not know are kept as they are.
enum JSONValue: Codable, Equatable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([JSONValue].self) { self = .array(a) }
        else { self = .object(try c.decode([String: JSONValue].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .number(let n): try c.encode(n)
        case .string(let s): try c.encode(s)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }

    var string: String? {
        switch self {
        case .string(let s): return s.isEmpty ? nil : s
        case .number(let n): return n.rounded() == n ? String(Int(n)) : String(n)
        default: return nil
        }
    }

    var number: Double? {
        switch self {
        case .number(let n): return n
        case .string(let s): return Double(s.replacingOccurrences(of: ",", with: "."))
        default: return nil
        }
    }

    /// A text field's value: a number when it reads as one, null when empty.
    static func field(_ text: String) -> JSONValue {
        let t = text.trimmingCharacters(in: .whitespaces)
        if t.isEmpty { return .null }
        if let n = Double(t.replacingOccurrences(of: ",", with: ".")) { return .number(n) }
        return .string(t)
    }
}

typealias JSONObject = [String: JSONValue]
