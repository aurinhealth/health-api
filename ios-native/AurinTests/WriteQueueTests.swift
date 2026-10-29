import XCTest
@testable import Aurin

/// The one queue for the writes (WriteQueue) and its rule (WriteVerdict):
/// no signal, a server error or too old an app waits, a refusal goes with a
/// note, the writes go out in order. And a sign-in's end (AccountScope): what
/// it started stops, what comes back is dropped. A stand-in server
/// (ScriptedServer) answers each request in turn.
@MainActor
final class WriteQueueTests: XCTestCase {
    private let api = APIClient(baseURL: URL(string: "https://stub.test")!, protocols: [ScriptedServer.self])
    private var queue: WriteQueue!
    private var lost: [Bool] = []

    override func setUp() async throws {
        OutboxStore.clear()
        ScriptedServer.reset()
        queue = WriteQueue(api: api, load: false)
        queue.canSend = { true }
        queue.connection = { [weak self] in self?.lost.append($0) }
    }

    override func tearDown() async throws {
        queue = nil
        ScriptedServer.reset()
        OutboxStore.clear()
    }

    private func drink(_ ml: Int) -> OutboxItem {
        AppModel.drinkItem(ml: ml, kind: "water", date: "2026-10-28")
    }

    func testVerdicts() {
        XCTAssertEqual(WriteVerdict.of(URLError(.notConnectedToInternet)), .waitForSignal)
        XCTAssertEqual(WriteVerdict.of(OutboxRefusal.retry("503")), .retry("503"))
        XCTAssertEqual(WriteVerdict.of(OutboxRefusal.outdated("426")), .waitForUpdate)
        XCTAssertEqual(WriteVerdict.of(OutboxRefusal.rejected("400")), .reject("400"))
        XCTAssertEqual(WriteVerdict.of(APIError.unauthorized), .fail)
        XCTAssertTrue(WriteVerdict.retry("").waits)
        XCTAssertFalse(WriteVerdict.reject("").waits)
    }

    func testWaitingWritesGoOutInOrder() async {
        queue.enqueue(drink(100))
        queue.enqueue(drink(200))
        queue.enqueue(drink(300))
        ScriptedServer.script = [.status(200, body: #"{"entry":{"id":1}}"#), .status(200), .status(200)]
        let went = await queue.send()
        XCTAssertTrue(went)
        XCTAssertTrue(queue.items.isEmpty)
        XCTAssertEqual(ScriptedServer.bodies.compactMap { $0["ml"] as? Double }, [100, 200, 300])
        XCTAssertEqual(lost, [false])
    }

    func testServerErrorKeepsTheWriteThenGivesUp() async {
        queue.enqueue(drink(250))
        for round in 1..<WriteVerdict.retries {
            ScriptedServer.script = [.status(503)]
            await queue.send()
            XCTAssertEqual(queue.items.first?.failures, round)
            XCTAssertNil(queue.note)
        }
        ScriptedServer.script = [.status(503)]
        await queue.send()
        XCTAssertTrue(queue.items.isEmpty)
        XCTAssertNotNil(queue.note)
    }

    func testRefusedWriteGoesWithANoteAndTheRestGoesOn() async {
        queue.enqueue(drink(100))
        queue.enqueue(drink(200))
        ScriptedServer.script = [.status(400, body: #"{"message":"Špatně"}"#), .status(200)]
        await queue.send()
        XCTAssertTrue(queue.items.isEmpty)
        XCTAssertEqual(ScriptedServer.bodies.count, 2)
        XCTAssertTrue(queue.note?.contains("Špatně") == true)
    }

    func testNoSignalStopsTheRoundAndKeepsTheRest() async {
        queue.enqueue(drink(100))
        queue.enqueue(drink(200))
        ScriptedServer.script = [.failure(URLError(.notConnectedToInternet))]
        let went = await queue.send()
        XCTAssertFalse(went)
        XCTAssertEqual(queue.items.count, 2)
        XCTAssertEqual(lost, [true])
    }

    func testTooOldAppWaitsWithoutCountingAFailure() async {
        queue.enqueue(drink(100))
        ScriptedServer.script = [.status(426)]
        await queue.send()
        XCTAssertEqual(queue.items.count, 1)
        XCTAssertEqual(queue.items.first?.failures, 0)
    }

    func testDeliverWaitsOnServerErrorAndThrowsARefusal() async throws {
        ScriptedServer.script = [.status(503)]
        let went = try await queue.deliver(drink(100))
        XCTAssertFalse(went)
        XCTAssertEqual(queue.items.count, 1)
        ScriptedServer.script = [.status(422)]
        do {
            try await queue.deliver(drink(200))
            XCTFail("no refusal")
        } catch {
            guard case .rejected? = error as? OutboxRefusal else { return XCTFail("not rejected") }
        }
        XCTAssertEqual(queue.items.count, 1)
    }

    func testNothingGoesOutWhileItMayNot() async {
        queue.canSend = { false }
        queue.enqueue(drink(100))
        let went = await queue.send()
        XCTAssertFalse(went)
        XCTAssertTrue(ScriptedServer.bodies.isEmpty)
        XCTAssertEqual(queue.items.count, 1)
    }

    func testSignOutOfTheAccountDropsTheWrites() {
        queue.enqueue(drink(100))
        queue.note = "Neuloženo"
        queue.clear()
        XCTAssertTrue(queue.items.isEmpty)
        XCTAssertNil(queue.note)
        XCTAssertTrue(OutboxStore.load().isEmpty)
    }

    // MARK: - The screens

    func testSentWriteStaysDrawnUntilTheNextLoad() throws {
        let screen = PatchedScreen<FoodSnapshot>(patch: OutboxPatch.food)
        let food = Data("""
        {"date":"2026-10-28","kcal":0,"target":2500,"macros":{"carbs":{"eaten":0,"target":300},"protein":{"eaten":0,"target":150},"fat":{"eaten":0,"target":80}},
         "meals":[],"water":{"ml":0,"target":2500,"entries":0,"drunkMl":0,"drinks":[]}}
        """.utf8)
        let value = try JSONDecoder().decode(FoodSnapshot.self, from: food)
        screen.show(value, data: food)
        let id = UUID()
        screen.settle(id, OutboxOverlay(kind: .drink, date: "2026-10-28", id: 5, ml: 300, drink: "water"))
        screen.apply([])
        XCTAssertEqual(screen.value?.water.drunkMl, 300)
        // A load asked before the write went out does not have it yet: it stays drawn.
        screen.show(value, data: food, settled: [])
        screen.apply([])
        XCTAssertEqual(screen.value?.water.drunkMl, 300)
        // The load asked after it has it: it leaves.
        screen.show(value, data: food, settled: [id])
        screen.apply([])
        XCTAssertEqual(screen.value?.water.drunkMl, 0)
    }

    // MARK: - The sign-in

    func testEndedSignInCancelsItsWork() async {
        let scope = AccountScope()
        let started = expectation(description: "started")
        let task = scope.task {
            started.fulfill()
            try? await Task.sleep(for: .seconds(30))
        }
        await fulfillment(of: [started], timeout: 5)
        scope.end()
        await task.value
        XCTAssertTrue(task.isCancelled)
        XCTAssertTrue(scope.task {}.isCancelled)
    }

    func testAnswerFromBeforeSignOutIsDropped() {
        let model = AppModel(api: api, demo: true)
        let asked = model.scope
        XCTAssertTrue(model.stillSignedIn(asked))
        model.signOut(expired: true)
        XCTAssertFalse(model.stillSignedIn(asked))
        XCTAssertTrue(asked.ended)
        XCTAssertNil(model.today)
        XCTAssertNil(model.food)
        XCTAssertTrue(model.calendar.isEmpty)
    }
}

/// Answers the requests in turn from the script and keeps their JSON bodies.
final class ScriptedServer: URLProtocol {
    // Set by the tests before each request, read by the loading thread.
    nonisolated(unsafe) static var script: [StubServer.Answer] = []
    nonisolated(unsafe) static var bodies: [[String: Any]] = []
    private static let lock = NSLock()

    static func reset() {
        lock.withLock { script = []; bodies = [] }
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        guard let client else { return }
        let body = request.httpBody ?? request.httpBodyStream.map(Self.read) ?? Data()
        let answer: StubServer.Answer = Self.lock.withLock {
            if let json = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] { Self.bodies.append(json) }
            return Self.script.isEmpty ? .status(404) : Self.script.removeFirst()
        }
        switch answer {
        case .failure(let error):
            client.urlProtocol(self, didFailWithError: error)
        case .status(let code, let text):
            let response = HTTPURLResponse(url: request.url!, statusCode: code, httpVersion: "HTTP/1.1",
                                           headerFields: ["Content-Type": "application/json"])!
            client.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client.urlProtocol(self, didLoad: Data(text.utf8))
            client.urlProtocolDidFinishLoading(self)
        }
    }

    /// URLSession hands a URLProtocol the body as a stream.
    private static func read(_ stream: InputStream) -> Data {
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            guard count > 0 else { break }
            data.append(buffer, count: count)
        }
        return data
    }
}
