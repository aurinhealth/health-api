import XCTest
@testable import Aurin

/// The profile photo outlasts a sign-out only for its own account (AvatarStore.belongs).
final class AvatarOwnerTests: XCTestCase {
    func testSameAccountById() {
        XCTAssertTrue(AvatarStore.belongs(ownerId: 7, ownerEmail: "old@example.com", id: 7, email: "new@example.com"))
        XCTAssertFalse(AvatarStore.belongs(ownerId: 7, ownerEmail: "a@example.com", id: 8, email: "a@example.com"))
    }

    func testEmailWhenNoId() {
        XCTAssertTrue(AvatarStore.belongs(ownerId: nil, ownerEmail: "A@Example.com", id: 3, email: "a@example.com"))
        XCTAssertFalse(AvatarStore.belongs(ownerId: nil, ownerEmail: "a@example.com", id: nil, email: "b@example.com"))
        XCTAssertFalse(AvatarStore.belongs(ownerId: nil, ownerEmail: nil, id: 3, email: nil))
    }
}
