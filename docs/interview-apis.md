'jobs/:jobId/finalize-shortlist'

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
