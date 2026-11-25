# Security Specification — ALX Office Firestore Rules

## 1. Data Invariants

1. **Isolated Owner Hierarchy**: Every synced document under `/users/{userId}/documents/{docId}` requires an existing parent profile `/users/{userId}` and strict equality `ownerId == request.auth.uid == userId`.
2. **Authenticated Owner Identity**: Only authenticated users (`request.auth != null && request.auth.uid == userId`) can read or mutate their own profile and documents.
3. **Immutable Lineage**: `uid`, `id`, `ownerId`, and `createdAt` can never be changed after creation.
4. **Server-Enforced Timestamps**: `createdAt` and `updatedAt` must equal `request.time`.
5. **Strict Payload Boundaries & Native Collections**: Every string, enum, boolean, and list (`slides <= 200`, `comments <= 500`) is bounded; `pdfBase64` and `contentHtml` are capped at `<= 750,000` chars to remain safely under Firestore's 1MB document limit; no ghost/shadow fields allowed.
6. **PII Protection & Non-Listable Users**: `/users/{userId}` forbids `list` queries; `/users/{userId}/documents` `allow list` validates `resource.data.ownerId == request.auth.uid` directly without extra `get()` lookups.
7. **Unique Username Reservations**: `/usernames/{username}` forbids `list` queries and `update` mutations, enforces `!exists(...)` on create, and binds `ownerId == request.auth.uid` with zero PII.

## 2. "Dirty Dozen" Adversarial Payloads

1. **Cross-Tenant Read**: User B attempts `get(/users/userA/documents/doc1)` -> `PERMISSION_DENIED`.
2. **Cross-Tenant Create (Identity Spoofing)**: User B creates `/users/userA/documents/doc1` with `ownerId: userB` or `ownerId: userA` -> `PERMISSION_DENIED`.
3. **Unauthenticated Write**: Unauthenticated client (`request.auth == null`) attempts `setDoc` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection (UserProfile)**: Create/update `/users/{uid}` with extra field `{ isAdmin: true }` -> `PERMISSION_DENIED`.
5. **Shadow Field Injection (CloudDocument)**: Update `/users/{uid}/documents/{docId}` with extra field `{ role: "admin" }` -> `PERMISSION_DENIED`.
6. **Immutable Owner Tampering**: Update `/users/{uid}/documents/{docId}` attempting to alter `ownerId` or `createdAt` -> `PERMISSION_DENIED`.
7. **Client Timestamp Forgery**: Create/update document with `updatedAt` != `request.time` -> `PERMISSION_DENIED`.
8. **ID Poisoning**: Create document with `docId` containing `/`, `.`, `$`, or >128 chars -> `PERMISSION_DENIED`.
9. **Orphan Document Write**: Create `/users/{uid}/documents/{docId}` when parent `/users/{uid}` does not exist -> `PERMISSION_DENIED`.
10. **Oversized String Exhaustion**: Create document with `title` > 200 chars or `contentHtml` > 750,000 chars -> `PERMISSION_DENIED`.
11. **Array Flood / Invalid Type**: Create document with `comments` > 500 items or `comments: ["not-a-map"]` -> `PERMISSION_DENIED`.
12. **Blanket Collection Enumeration**: Signed-in user attempts `list(/users)` -> `PERMISSION_DENIED`.
