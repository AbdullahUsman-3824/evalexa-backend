# Hiring APIs

All endpoints require JWT authentication and recruiter access. The recruiter
must belong to the company that owns the application or job.

## Hire a candidate

```http
POST /application/:id/hire
```

Request body:

```json
{
  "sendEmail": true
}
```

`sendEmail` is optional and defaults to `false`. Applications can be hired
only from `INTERVIEW` or `OFFER` status. The application is updated to
`HIRED` and `hiredAt` is set to the current time before an optional email is
sent. Email delivery failures do not roll back the hire.

## List hired candidates

```http
GET /application/hired?jobId=<optional>&page=1&limit=20
```

The response includes candidate contact details, job details, match score,
application date, hiring date, and pagination:

```json
{
  "success": true,
  "data": [
    {
      "applicationId": "...",
      "status": "HIRED",
      "hiredAt": "2026-11-15T12:00:00.000Z",
      "appliedAt": "2026-11-01T12:00:00.000Z",
      "job": {
        "id": "...",
        "title": "Backend Engineer"
      },
      "candidate": {
        "id": "...",
        "fullName": "Jane Doe",
        "email": "jane@example.com",
        "phone": "..."
      }
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