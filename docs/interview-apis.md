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
