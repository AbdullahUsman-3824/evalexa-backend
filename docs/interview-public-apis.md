# Interview API endpoints — Public

Public (unauthenticated) endpoints of the interview module, ordered as the
candidate's flow from opening an invitation to completing (or recovering) an
interview. Implemented in `src/modules/interview/controllers/public-interview.controller.ts`.

All `:id` path parameters are validated as UUIDs. Rate limits are applied per
endpoint with `@nestjs/throttler`.

---

## 1. Preview an interview invitation

`GET /public/interviews/:id/preview?token=<invitation-token>`

The candidate's entry point: validates the invitation token and returns safe
interview details without sending an OTP or modifying OTP state.

### Response `200`

```json
{
  "success": true,
  "data": {
    "interviewId": "interview-uuid",
    "invitationId": "invitation-uuid",
    "jobTitle": "Senior Software Engineer",
    "companyName": "Example Company",
    "language": "en",
    "status": "PENDING",
    "expiresAt": "2026-11-06T22:31:47.496Z",
    "candidateName": "Jane Doe",
    "requiresOtp": true,
    "alreadyVerified": false,
    "canResume": false
  }
}
```

`canResume` is `true` only when the invitation is verified and the interview
status is `IN_PROGRESS`.

If the token is valid but the invitation has expired, the endpoint returns a
structured response instead of throwing:

```json
{
  "success": false,
  "code": "INVITATION_EXPIRED",
  "message": "This invitation has expired. Please request a new invitation from the recruiter.",
  "data": {
    "interviewId": "interview-uuid",
    "expired": true,
    "canRequestNew": true,
    "jobTitle": "Senior Software Engineer",
    "companyName": "Example Company"
  }
}
```

Invalid tokens and unavailable invitations return an error response.

---

## 2. Request an interview OTP

`POST /public/interviews/:id/request-otp`

Revalidates the invitation token and sends a six-digit OTP to the candidate's
registered email. OTPs are hashed in the database and expire after 10 minutes.
A new OTP cannot be requested more than once per minute while the cooldown is
active.

This endpoint is rate-limited to five requests per minute.

### Request body

```json
{
  "token": "<invitation-token>"
}
```

### Response `200`

```json
{
  "success": true,
  "message": "OTP sent to your email",
  "data": {
    "emailHint": "j***@example.com",
    "expiresInSeconds": 600
  }
}
```

---

## 3. Verify an interview OTP

`POST /public/interviews/:id/verify-otp`

Revalidates the invitation token, verifies the six-digit OTP, and sets an
interview session cookie valid for one hour. Five failed attempts are allowed
for each OTP. On successful verification, the OTP is cleared. The interview
remains `PENDING` until the protected start endpoint is called.

This endpoint is rate-limited to ten requests per minute.

### Request body

```json
{
  "token": "<invitation-token>",
  "otp": "123456"
}
```

### Response `200`

```json
{
  "success": true,
  "message": "OTP verified successfully",
  "data": {
    "expiresIn": 3600,
    "interview": {
      "id": "interview-uuid",
      "status": "PENDING",
      "startedAt": null,
      "language": "en",
      "jobTitle": "Senior Software Engineer",
      "companyName": "Example Company"
    }
  }
}
```

The response sets the `interview_session` cookie. It is always `httpOnly`,
has `Max-Age=3600`, and has `Path=/`. In production it also has
`Secure; SameSite=None`; otherwise it has `SameSite=Lax`.

```text
interview_session=<httpOnly-session-jwt>; Max-Age=3600; Path=/; [Secure;] SameSite=<None|Lax>
```

Interview session tokens contain `type: "interview_session"` and are read by
`InterviewSessionGuard` from the `interview_session` cookie only.
`Authorization` headers are not supported for interview sessions.

---

## 4. Request an invitation extension

`POST /public/interviews/:id/invitation-extension-requests`

Used when the invitation in step 1 has expired. The candidate must provide the
original invitation token and a reason for requesting another invitation. The
token is validated against the stored invitation-token hash and must belong to
the requested interview.

The invitation must have been sent and must be expired. The interview must
still be eligible for an invitation (`PENDING` or `EXPIRED`), and its
application must remain in `INTERVIEW` status. Invalid, unrelated, active, or
revoked invitations are rejected. The endpoint is rate-limited to five
requests per minute.

### Request body

```json
{
  "token": "<original-invitation-token>",
  "reason": "I was unable to complete the interview before the invitation expired."
}
```

`reason` is trimmed, required, and limited to 2,000 characters. Only one
`PENDING` extension request may exist for an interview at a time.

### Response `200`

```json
{
  "success": true,
  "data": {
    "id": "request-uuid",
    "interviewId": "interview-uuid",
    "status": "PENDING",
    "reason": "I was unable to complete the interview before the invitation expired.",
    "requestedAt": "2026-11-03T22:45:00.000Z"
  }
}
```

Concurrent candidate submissions and recruiter decisions are serialized with a
per-interview PostgreSQL advisory transaction lock. This prevents duplicate
pending requests and prevents two recruiters from reviewing or sending for the
same request simultaneously without adding a database constraint.
