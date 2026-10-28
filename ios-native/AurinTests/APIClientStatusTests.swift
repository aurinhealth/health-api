import XCTest
@testable import Aurin

/// What the app does with each kind of answer: 401 signs out, 426 asks for
/// the update and keeps the write, 5xx and 429 try again, other 4xx drop it,
/// no connection waits. A stand-in server (URLProtocol) answers.
final class APIClientStatusTests: XCTestCase {
    private let api = APIClient(baseURL: URL(string: "https://stub.test")!, protocols: [StubServer.self])
    private let item = OutboxItem(path: "/app/api/fluids", method: "POST", body: Data("{}".utf8), label: "Pití")

    override func tearDown() {
        StubServer.answer = nil
        super.tearDown()
    }

    private func refusal(_ status: Int) async -> Error? {
        StubServer.answer = .status(status)
        do { _ = try await api.sendQueued(item); return nil } catch { return error }
    }

    func testAcceptedWriteReturnsTheAnswer() async throws {
        StubServer.answer = .status(200, body: #"{"id":5}"#)
        let answer = try await api.sendQueued(item)
        XCTAssertEqual(Outbox.entryId(answer), 5)
    }

    func testExpiredSessionSignsOut() async {
        let error = await refusal(401)
        XCTAssertEqual(error as? APIError, .unauthorized)
        StubServer.answer = .status(401)
        do { let _: JSONValue = try await api.get("/app/api/today"); XCTFail("no error") } catch {
            XCTAssertEqual(error as? APIError, .unauthorized)
        }
    }

    func testTooOldAppKeepsTheWrite() async {
        let asked = Flag()
        api.onUpdateRequired = { asked.set() }
        guard case .outdated? = await refusal(426) as? OutboxRefusal else { return XCTFail("not outdated") }
        XCTAssertTrue(asked.value)
    }

    func testServerErrorsTryAgain() async {
        for status in [500, 503, 408, 429] {
            guard case .retry? = await refusal(status) as? OutboxRefusal else { return XCTFail("\(status) not retried") }
        }
    }

    func testRefusedWriteIsDropped() async {
        guard case .rejected? = await refusal(400) as? OutboxRefusal else { return XCTFail("not rejected") }
    }

    func testNoConnectionWaits() async {
        StubServer.answer = .failure(URLError(.notConnectedToInternet))
        do { _ = try await api.sendQueued(item); XCTFail("no error") } catch {
            XCTAssertTrue(Outbox.isNoConnection(error))
        }
    }
}

private final class Flag: @unchecked Sendable {
    private let lock = NSLock()
    private var on = false
    func set() { lock.withLock { on = true } }
    var value: Bool { lock.withLock { on } }
}

/// Answers every request with the status (and body) the test set.
final class StubServer: URLProtocol {
    enum Answer {
        case status(Int, body: String = "{}")
        case failure(URLError)
    }
    // Set by the tests before each request.
    nonisolated(unsafe) static var answer: Answer?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        guard let client else { return }
        switch Self.answer ?? .status(404) {
        case .failure(let error):
            client.urlProtocol(self, didFailWithError: error)
        case .status(let code, let body):
            let response = HTTPURLResponse(url: request.url!, statusCode: code, httpVersion: "HTTP/1.1",
                                           headerFields: ["Content-Type": "application/json"])!
            client.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client.urlProtocol(self, didLoad: Data(body.utf8))
            client.urlProtocolDidFinishLoading(self)
        }
    }
}
