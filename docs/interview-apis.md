# Interview API endpoints — Recruiter

Recruiter endpoints of the interview module, ordered as the functional flow of
managing interviews. Implemented in
`src/modules/interview/controllers/interview.controller.ts`.

All endpoints are guarded by `JwtAuthGuard` and `RecruiterRoleGuard`; the
authenticated recruiter must belong to a company (`400` otherwise). All `:id`
parameters are validated as UUIDs.

---

## 1. Get interview applications

`GET /interviews/applications`

Returns that company's applications whose status is `INTERVIEW`, ordered by
most recently updated. An interview record is created with `language: "en"`
when an application does not already have one.

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

---

## 1b. Get interview results

`GET /interviews/results`

Returns interviews for the recruiter's company whose status is `IN_PROGRESS` or
`COMPLETED` (candidate has started or finished answering). No interview records
are created. Response is shaped for a results table — not a raw DB dump.

### Response `200`

```json
{
  "success": true,
  "data": [
    {
      "interviewId": "interview-uuid",
      "applicationId": "application-uuid",
      "jobId": "job-uuid",
      "candidateName": "Jane Doe",
      "candidateEmail": "jane@example.com",
      "jobTitle": "Senior Software Engineer",
      "status": "COMPLETED",
      "startedAt": "2026-11-10T10:00:00.000Z",
      "submittedAt": "2026-11-10T10:45:00.000Z",
      "completedAt": "2026-11-10T11:05:00.000Z",
      "timeTakenSeconds": 2700,
      "processingStatus": "ready",
      "processingLabel": "Results ready",
      "transcriptionStatus": "COMPLETED",
      "evaluationStatus": "COMPLETED",
      "scores": {
        "overallScore": 42,
        "overallMaxScore": 50,
        "overallPercentage": 84
      },
      "feedback": null,
      "recommendation": "RECOMMENDED",
      "evaluatedAt": "2026-11-10T11:05:00.000Z"
    }
  ]
}
```

### Field notes

| Field                                    | Meaning                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| `status`                                 | `IN_PROGRESS` (candidate still answering) or `COMPLETED` (all answers submitted)         |
| `submittedAt`                            | When the candidate submitted the last answer                                             |
| `completedAt`                            | When transcription + evaluation finished (null while pipeline is running)                |
| `timeTakenSeconds`                       | `submittedAt - startedAt` in seconds, or null if either is missing                       |
| `processingStatus`                       | `candidate_in_progress` / `transcribing` / `evaluating` / `ready` / `partial` / `failed` |
| `scores` / `feedback` / `recommendation` | Populated only when evaluation is `COMPLETED` or `PARTIALLY_COMPLETED`; otherwise `null` |

While the candidate is still answering, or after submit while AI work is
running, use `processingStatus` / `processingLabel` in the UI instead of
expecting scores.

---

## 2. Send an interview invitation

`POST /interviews/:id/invitations/send`

Sends the selected candidate an interview invitation containing a link. The
invitation expires three days after it is sent. The token is stored as a hash,
and a new token is generated only when the previous invitation has expired or
no invitation exists.

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

---

## 3. List invitation extension requests

`GET /interviews/invitation-extension-requests`

Only requests for interviews associated with that recruiter's company are
returned.

Use `status=PENDING`, `status=APPROVED`, or `status=REJECTED` to filter
results. Without a status, all requests are returned. Results are ordered
newest first and support `page` (default `1`) and `limit` (default `20`,
maximum `100`).

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

---

## 4. Approve an invitation extension request

`POST /interviews/:interviewId/invitation-extension-requests/:requestId/approve`

The request must belong to the specified interview and to an interview owned
by the recruiter's company. Only `PENDING` requests can be approved.

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

---

## 5. Reject an invitation extension request

`POST /interviews/:interviewId/invitation-extension-requests/:requestId/reject`

The same company-ownership, interview-ownership, and `PENDING` status checks
used by approval apply here. Rejecting a request does not modify the interview
or its invitation.

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
