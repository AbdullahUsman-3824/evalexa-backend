## Get interview applications

`GET /interviews/applications`

Returns every application owned by the recruiter’s company whose status is
`INTERVIEW`. An interview record is created for an application when one does
not already exist. Newly created records use `language: "en"`; Prisma defaults
all interview statuses to `PENDING` and optional fields to `null`.

### Response `200`

```json
{
  "success": true,
  "data": [
    {
      "id": "UUID",
      "candidateName": "Jane Doe",
      "candidateEmail": "jane@example.com",
      "jobTitle": "Senior Software Engineer",
      "invitationDeliveryStatus": null
    }
  ]
}
```

`invitationDeliveryStatus` is `null` until an invitation exists for the
interview.

## Send an interview invitation

`POST /interviews/:id/invitations/send`

Sends the selected candidate an interview invitation containing an interview
link. The invitation expires three days after it is sent. The token is stored
as a hash, and a new token is generated when the invitation is resent.

Set `INTERVIEW_BASE_URL` to the frontend interview URL base. If it is not set,
the link defaults to `http://localhost:3000/interviews`.

### Response `200`

```json
{
  "success": true,
  "message": "Interview invitation sent to candidate@example.com.",
  "data": {
    "id": "uuid",
    "deliveryStatus": "SENT",
    "expiresAt": "2026-11-03T22:31:47.496Z",
    "sentAt": "2026-10-31T22:31:47.496Z"
  }
}
```

## Preview an interview invitation

`GET /public/interviews/:id/preview?token=<invitation-token>`

Public endpoint. Validates the invitation token and returns safe interview
details without sending an OTP or modifying OTP state.

### Response `200`

```json
{
  "success": true,
  "data": {
    "valid": true,
    "interview": {
      "id": "uuid",
      "jobTitle": "Senior Software Engineer",
      "companyName": "Example Company",
      "language": "en",
      "status": "PENDING",
      "expiresAt": "2026-11-03T22:31:47.496Z",
      "candidateName": "Jane Doe"
    },
    "requiresOtp": true,
    "alreadyVerified": false,
    "canResume": false
  }
}
```

The invitation token is never returned by the API. Invalid, expired, or
unavailable invitations return an error response.

## Request an interview OTP

`POST /public/interviews/:id/request-otp`

Public endpoint. Sends a six-digit OTP to the candidate’s email after
revalidating the invitation token. OTPs are hashed in the database, expire
after 10 minutes, and may not be requested more than once per minute while
the current OTP is active.

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

Public endpoint. Verifies the OTP and sets a one-hour, httpOnly
`interview_session` cookie. A maximum of five failed attempts is allowed for
each OTP. On successful verification, the OTP is cleared. The interview
remains `PENDING` until the protected start endpoint is called.

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
    "expires_in": 3600,
    "interview": {
      "id": "uuid",
      "status": "PENDING",
      "startedAt": null,
      "language": "en",
      "jobTitle": "Senior Software Engineer",
      "companyName": "Example Company"
    }
  }
}
```

The response sets the following cookie:

```text
interview_session=<httpOnly-session-jwt>; Max-Age=3600; Path=/; Secure; SameSite=None
```

Interview session tokens contain `type: "interview_session"` and are
validated by `InterviewSessionGuard` from the `interview_session` cookie only.
Bearer or `Authorization` headers are not supported for interview sessions.
## Start or resume an interview

`POST /interviews/:id/start`

Protected by `InterviewSessionGuard`. The guard reads only the
`interview_session` cookie. The session must belong to the requested interview
and its invitation must have a non-null `verifiedAt`. A `PENDING` interview is
changed to `IN_PROGRESS` and receives its `startedAt` timestamp. An already
`IN_PROGRESS` interview is returned unchanged.

### Response `200`

```json
{
  "success": true,
  "data": {
    "interview": {
      "id": "uuid",
      "status": "IN_PROGRESS",
      "startedAt": "2026-10-31T22:40:00.000Z",
      "language": "en",
      "jobTitle": "Senior Software Engineer",
      "companyName": "Example Company"
    }
  }
}
```
