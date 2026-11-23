# ClipLens Firestore Security Specification

## 1. Data Invariants
1. **Default Deny**: All unmatched paths in Firestore are explicitly denied (`allow read, write: if false`).
2. **Verified Authentication**: Standard user write operations require `request.auth != null && request.auth.token.email_verified == true`.
3. **PII Isolation**: User email addresses reside exclusively in `/users/{userId}/private/info` and `/admins/{userId}`, readable only by the owning user or verified admin.
4. **Privilege & Plan Protection**: Normal users cannot self-assign `role: 'admin'`, cannot change `status` from `'suspended'` to `'active'`, and cannot self-upgrade `subscriptionPlan` or `subscriptionStatus`.
5. **Payment Integrity**: `/transactions/{transactionId}`, `/subscriptions/{subscriptionId}`, and `/revenueDaily/{dateKey}` cannot be created, modified, or deleted by regular users via the client SDK.
6. **Temporal Integrity**: `createdAt`, `registeredAt`, `savedAt`, and `updatedAt` timestamps must match `request.time`, and creation timestamps are immutable after creation.
7. **Master Gate & Path Hardening**: Every single-document operation validates `isValidId()` (`^[a-zA-Z0-9_-]+$`, max 128 chars) and every subcollection validates parent ownership.

## 2. Dirty Dozen Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated Profile Create**: Anonymous `create` on `/users/u1`.
2. **Self-Assigned Admin Role**: Authenticated user creates `/users/u1` with `role: "admin"`.
3. **Self-Activated Premium Plan**: Authenticated user creates `/users/u1` with `subscriptionPlan: "annual"` or `subscriptionStatus: "active"`.
4. **Ghost Field Injection (Shadow Update)**: User updates `/users/u1` including `{ displayName: "A", isVerified: true }`.
5. **Plan Escalation Update**: User updates `/users/u1` changing `subscriptionPlan` from `"free"` to `"monthly"`.
6. **Account Un-suspension Self-Update**: Suspended user updates `/users/u1` changing `status` to `"active"`.
7. **Cross-User Saved Video Write**: User `u1` creates `/users/u2/savedVideos/dQw4w9WgXcQ`.
8. **Forged Transaction Create**: Authenticated non-admin creates `/transactions/txn_fake` claiming a Razorpay capture.
9. **Spoofed Admin Email (Unverified)**: User with `token.email == "berasourav5132@gmail.com"` and `token.email_verified == false` tries to create `/admins/{uid}` or write `/appConfig/public`.
10. **PII Blanket Read**: User `u1` calls `get` or `list` on `/users/u2/private/info`.
11. **Fake Revenue Injection**: Non-admin creates `/revenueDaily/2026-11-22` with inflated revenue numbers.
12. **Path ID Poisoning / Backdated Timestamp**: User creates `/users/u1/savedVideos/invalid..id` or passes client-forged `savedAt` timestamp not equal to `request.time`.
