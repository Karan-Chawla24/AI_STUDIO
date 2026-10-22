# F04 — Email verification and password recovery

Date: 2026-10-22. Owner selected local email previews for this milestone. No real email has been sent and no provider credentials are needed for this test.

## Owner test

1. Run the app on the origin in `studio/.env.local` (currently `http://localhost:3001`). Sign in to a test account. An unverified account displays a verification banner.
2. Open `/verify-email`, enter the account email, and request a link.
3. From `studio/`, run `npm run email:preview` using Node 24. This local command shows the last five preview messages. Open the verification link for your account and choose **Confirm email address**.
4. Open the studio. The verification banner should disappear. Already-verified addresses receive the generic acknowledgement but no new verification message.
5. Open `/forgot-password`, request a reset for the same account, and run `npm run email:preview` again. Open the reset link, enter matching passwords of 12–128 characters, and submit.
6. Existing sessions should be signed out. Sign in with the new password; the old password should fail. Reusing the consumed link should fail. Wait 60 seconds between requests to the same send endpoint.

Preview JSON files live in `studio/.local/emails/`, outside `public/`, and are ignored by Git. They contain private account links: do not share or commit them. The preview command deliberately displays these secrets only when explicitly invoked locally. Preview files are not automatically pruned; remove expired files when finished. Refreshing a confirmation page clears its in-memory token; reopen the original email link to continue.

## Configuration and delivery

`EMAIL_DELIVERY=preview` enables filesystem delivery only for a loopback APP_ORIGIN and is rejected on Vercel. The owner’s existing Atlas URI and auth secret remain unchanged. Test automation uses temporary databases, not Atlas accounts.

An `EmailSender` adapter also supports `EMAIL_DELIVERY=resend` with `RESEND_API_KEY` and a verified `EMAIL_FROM`. It uses a fixed HTTPS destination, a ten-second timeout and a content-derived idempotency key. Live Resend delivery/domain verification remain untested and are a release prerequisite. The adapter sends plain-text messages and never logs message bodies, credentials or tokens. There is no email inbox HTTP endpoint and no automatic email on sign-up/sign-in; verification is explicitly requested from the banner or account screen. General product email notifications remain outside V1.

## API contract additions

All mutations require same-origin JSON, reject extra fields and query parameters, cap requests at 16 KiB, and return private/no-store responses. No caller-controlled redirect URL is accepted. Native Better Auth errors retain their existing envelope; these are not `/api/v1` endpoints.

| Route | Body | Result / limit |
| --- | --- | --- |
| POST `/api/auth/send-verification-email` | `{email}` | Generic `{status:true,message}`; one request/minute/IP |
| POST `/api/auth/request-password-reset` | `{email}` | Same generic acknowledgement for missing/existing accounts; one request/minute/IP |
| POST `/api/auth/verify-email` | `{token}` | `{status:true,user:null}` on success; invalid/expired/replayed links fail; ten/minute/IP |
| POST `/api/auth/reset-password` | `{token,newPassword}` | `{status:true}`; five/minute/IP; no automatic sign-in |

The application deliberately bridges verification POST to the pinned library's internal GET handler. Public GET verification and reset callback endpoints remain blocked. Emails use URL fragments, so tokens are absent from the initial HTTP request. The browser removes the fragment and waits for explicit submission; email link scanners cannot consume links by fetching pages. A global no-referrer policy prevents referral leakage. Reset/verification pages do not contain analytics or remote fonts.

Email send acknowledgements strip session cookies before library dispatch and normalize provider errors to the same generic response. A minimum 600 ms response floor reduces simple timing differences; this does not guarantee constant-time delivery with a remote provider. Rate limiting is persisted in MongoDB. Local requests share a loopback bucket; Vercel uses its platform-controlled IP header. Other proxy deployments need reviewed trusted-IP handling. This is an IP cooldown, not a global per-recipient abuse-control system.

## Persistence, transitions and recovery

Better Auth 1.7.12 remains pinned. No collection/index/validator changes: existing F03 `verification` records and indexes are used through the library's internal adapter. The exported adapter schema and migration checksum remain compatible; no new migration is required.

- Verification JWTs expire after 60 minutes. Because native verification JWTs are otherwise replayable until expiry, the send hook registers a SHA-256 token fingerprint as `email-confirm:<hash>` using the adapter's verification store. The confirmation hook atomically consumes this marker, checks expiry and ACTIVE profile lifecycle, then lets Better Auth validate and verify the email. Replay is rejected. A failure after marker consumption requires a new link; verification is not claimed to be one transaction with this marker. The emailVerified profile projection updates after success; native auth remains authoritative.
- Password-reset tokens expire after 15 minutes. The library atomically consumes the reset token, revokes all user sessions and updates the credential hash inside its MongoDB transaction. Other users' sessions remain valid. Passwords are neither logged nor trimmed. Each issued reset link is independently single-use; requesting another does not revoke earlier unexpired links.
- Unverified users may still sign in and access the studio, matching the draft-access contract. Generation, approval, social connection and publication remain unimplemented; those owning features must enforce trusted `user.emailVerified` server-side.
- Expiry is enforced when links are used. Do not add ad hoc TTL indexes to the pinned adapter schema. Retention cleanup remains an operational-hardening follow-up.
- Delivery failure does not roll back a registered account. The UI permits another request after the cooldown. Provider-error responses are generic to avoid exposing registration status; production delivery monitoring is still required.

## Verification

Automated email tests cover local-only preview configuration, authoritative verification and replay rejection, generic recovery/provider-error responses, password length, reset replay, revocation of multiple sessions, isolation from another user, expired links, cooldowns, origin checks and redirect/identity injection. Existing F02/F03 tests are rerun alongside them. Browser evidence and final check results are recorded in `PROJECT_STATUS.md`.

Reference: [Better Auth email](https://better-auth.com/docs/concepts/email), [Better Auth options](https://better-auth.com/docs/reference/options), [Resend idempotency](https://resend.com/changelog/idempotency-keys). Runtime behavior was checked against installed 1.7.12 source, including transactional reset and adapter verification consumption.

Stop after this milestone for owner testing before F05 project creation.
