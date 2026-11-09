## Interview API endpoints

The endpoints below are provided by the interview module. Interview IDs and
application IDs are UUIDs.

## Get interview applications

`GET /interviews/applications`

Recruiter endpoint. Requires the authenticated recruiter to belong to a
company. Returns that company's applications whose status is `INTERVIEW`,
ordered by most recently updated. An interview record is created with
`language: "en"` when an application does not already have one.

### Response `200`

```json
{
  "success": true,
  "data": [
    {
      "id": "application-uuid",
      "interviewId": "interview-uuid",
      "jobId": "job-uuid",
      "candidateName": "Jane Doe",
      "candidateEmail": "jane@example.com",
      "jobTitle": "Senior Software Engineer",
      "invitationDeliveryStatus": null
    }
  ]
}
```

`invitationDeliveryStatus` is `null` until an invitation exists. Once an
invitation expires, its status is updated to `EXPIRED`.

## Send an interview invitation

`POST /interviews/:id/invitations/send`

Recruiter endpoint. Sends the selected candidate an interview invitation
containing a link. The invitation expires three days after it is sent. The
token is stored as a hash, and a new token is generated only when the previous
invitation has expired or no invitation exists.

The link uses `CLIENT_URL` as its frontend base URL, or
`http://localhost:3000` when `CLIENT_URL` is not set. A trailing slash in
`CLIENT_URL` is removed.

### Response `200`

```json
{
  "success": true,
  "message": "Interview invitation sent to candidate.",
  "data": {
    "id": "invitation-uuid",
    "deliveryStatus": "SENT",
    "expiresAt": "2026-11-06T22:31:47.496Z",
    "sentAt": "2026-11-03T22:31:47.496Z"
  }
}
```

An invitation cannot be resent while it is still valid. The endpoint returns
an error if the interview is not owned by the recruiter's company, the
application is not in `INTERVIEW` status, or the candidate has no email
address.

## Request an invitation extension

`POST /public/interviews/:id/invitation-extension-requests`

Public endpoint. The candidate must provide the original invitation token and
a reason for requesting another invitation. The token is validated against the
stored invitation-token hash and must belong to the requested interview.

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

## List invitation extension requests

`GET /interviews/invitation-extension-requests`

Recruiter endpoint. Requires an authenticated recruiter belonging to a
company. Only requests for interviews associated with that recruiter's company
are returned.

Use `status=PENDING`, `status=APPROVED`, or `status=REJECTED` to filter results.
Without a status, all requests are returned. Results are ordered newest first
and support `page` (default `1`) and `limit` (default `20`, maximum `100`).

### Response `200`

```json
{
  "success": true,
  "data": [
    {
      "id": "request-uuid",
      "interviewId": "interview-uuid",
      "candidateName": "Jane Doe",
      "candidateEmail": "jane@example.com",
      "jobTitle": "Senior Software Engineer",
      "reason": "I was unable to complete the interview before the invitation expired.",
      "status": "PENDING",
      "requestedAt": "2026-11-03T22:45:00.000Z",
      "reviewedAt": null,
      "reviewer": null,
      "decisionNote": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

## Approve an invitation extension request

`POST /interviews/:interviewId/invitation-extension-requests/:requestId/approve`

Recruiter endpoint. The request must belong to the specified interview and to
an interview owned by the recruiter's company. Only `PENDING` requests can be
approved.

Approval calls the same `InterviewService.sendInvitation` method used by
`POST /interviews/:id/invitations/send`. It therefore generates and hashes a
new token, invalidates the previous token, resets invitation state, sends the
email, and updates delivery status. The request is marked `APPROVED` only
after invitation delivery succeeds.

### Request body

```json
{
  "decisionNote": "Approved. Candidate can proceed with the interview."
}
```

`decisionNote` is optional, trimmed, and limited to 2,000 characters.

### Response `200`

```json
{
  "success": true,
  "data": {
    "id": "request-uuid",
    "interviewId": "interview-uuid",
    "candidateName": "Jane Doe",
    "candidateEmail": "jane@example.com",
    "jobTitle": "Senior Software Engineer",
    "reason": "I was unable to complete the interview before the invitation expired.",
    "status": "APPROVED",
    "requestedAt": "2026-11-03T22:45:00.000Z",
    "reviewedAt": "2026-11-03T22:50:00.000Z",
    "reviewer": {
      "id": "recruiter-uuid",
      "fullName": "Recruiter Name",
      "email": "recruiter@example.com"
    },
    "decisionNote": "Approved. Candidate can proceed with the interview.",
    "invitation": {
      "id": "invitation-uuid",
      "deliveryStatus": "SENT",
      "expiresAt": "2026-11-06T22:50:00.000Z",
      "sentAt": "2026-11-03T22:50:00.000Z",
      "isResend": true
    }
  }
}
```

If sending fails, the request remains `PENDING` and the error is propagated.
Already reviewed requests cannot be approved.

## Reject an invitation extension request

`POST /interviews/:interviewId/invitation-extension-requests/:requestId/reject`

Recruiter endpoint. The same company-ownership, interview-ownership, and
`PENDING` status checks used by approval apply here. Rejecting a request does
not modify the interview or its invitation.

### Request body

```json
{
  "decisionNote": "The candidate did not provide a valid reason."
}
```

The body may be empty. If supplied, `decisionNote` is trimmed and limited to
2,000 characters.

### Response `200`

```json
{
  "success": true,
  "data": {
    "id": "request-uuid",
    "interviewId": "interview-uuid",
    "candidateName": "Jane Doe",
    "candidateEmail": "jane@example.com",
    "jobTitle": "Senior Software Engineer",
    "reason": "I was unable to complete the interview before the invitation expired.",
    "status": "REJECTED",
    "requestedAt": "2026-11-03T22:45:00.000Z",
    "reviewedAt": "2026-11-03T22:50:00.000Z",
    "reviewer": {
      "id": "recruiter-uuid",
      "fullName": "Recruiter Name",
      "email": "recruiter@example.com"
    },
    "decisionNote": "The candidate did not provide a valid reason."
  }
}
```

Concurrent candidate submissions and recruiter decisions are serialized with a
per-interview PostgreSQL advisory transaction lock. This prevents duplicate
pending requests and prevents two recruiters from reviewing or sending for the
same request simultaneously without adding a database constraint.

## Preview an interview invitation

`GET /public/interviews/:id/preview?token=<invitation-token>`

Public endpoint. Validates the invitation token and returns safe interview
details without sending an OTP or modifying OTP state.

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

## Request an interview OTP

`POST /public/interviews/:id/request-otp`

Public endpoint. Revalidates the invitation token and sends a six-digit OTP to
the candidate's registered email. OTPs are hashed in the database and expire
after 10 minutes. A new OTP cannot be requested more than once per minute
while the cooldown is active.

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

## Verify an interview OTP

`POST /public/interviews/:id/verify-otp`

Public endpoint. Revalidates the invitation token, verifies the six-digit OTP,
and sets an interview session cookie valid for one hour. Five failed attempts
are allowed for each OTP. On successful verification, the OTP is cleared.
The interview remains `PENDING` until the protected start endpoint is called.

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

## Start or resume an interview

`POST /interviews/:id/start`

Protected by `InterviewSessionGuard`, which reads only the
`interview_session` cookie. The session must belong to the requested
interview. A `PENDING` interview is changed to `IN_PROGRESS` and receives its
`startedAt` timestamp. An already `IN_PROGRESS` interview is returned
unchanged.

### Response `200`

```json
{
  "success": true,
  "data": {
    "interview": {
      "id": "interview-uuid",
      "status": "IN_PROGRESS",
      "startedAt": "2026-11-03T22:40:00.000Z",
      "language": "en",
      "jobTitle": "Senior Software Engineer",
      "companyName": "Example Company"
    }
  }
}
```
