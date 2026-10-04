# Application & Shortlist API Reference

Base path: `/application`  
Auth details omitted per request.

---

## Endpoints overview

| Method | Path                          | Description                                      |
| ------ | ----------------------------- | ------------------------------------------------ |
| `GET`  | `/:id`                        | Application detail                               |
| `GET`  | `/jobs/:jobId`                | List applications for a job                      |
| `GET`  | `/jobs/:jobId/shortlisted`    | Shortlisted candidates                           |
| `GET`  | `/jobs/:jobId/rejected`       | Pool (not shortlisted / APPLIED)                 |
| `POST` | `/apply`                      | Candidate apply (multipart + parsed resume data) |
| `POST` | `/jobs/:jobId/bulk`           | Bulk resume import                               |
| `POST` | `/jobs/:jobId/shortlist-top`  | Shortlist top N by rank                          |
| `POST` | `/jobs/:jobId/bulk-shortlist` | Bulk shortlist by IDs                            |
| `POST` | `/:id/shortlist`              | Shortlist one                                    |
| `POST` | `/:id/unshortlist`            | Unshortlist one → APPLIED                        |

---

## 1. Get application

`GET /application/:id`

### Path

| Param | Type | Required |
| ----- | ---- | -------- |
| `id`  | UUID | yes      |

### Response `200`

```json
{
  "application": {
    "id": "uuid",
    "status": "APPLIED | SHORTLISTED | REJECTED | INTERVIEW | ...",
    "source": "FORM_FILL | IMPORT | ...",
    "matchScore": 87.5,
    "rankPosition": 3,
    "isAutoShortlisted": false,
    "appliedAt": "2026-10-04T10:00:00.000Z",
    "updatedAt": "2026-10-04T12:00:00.000Z"
  },
  "job": { "id": "uuid", "title": "string", "slug": "string" },
  "candidate": {
    "id": "uuid",
    "fullName": "string",
    "email": "string | null",
    "phone": "string | null",
    "linkedinUrl": "string | null",
    "portfolioUrl": "string | null",
    "location": "string | null"
  },
  "resume": {
    "id": "uuid",
    "resumeUrl": "string",
    "fileName": "string",
    "description": "string | null",
    "extractedSkills": {},
    "extractedExperience": {},
    "extractedEducation": {},
    "isPrimary": true,
    "uploadedAt": "ISO date"
  },
  "analysis": {
    "skillMatchScore": 0,
    "experienceScore": 0,
    "educationScore": 0,
    "overallScore": 0,
    "matchedSkills": [],
    "missingSkills": [],
    "strengths": [],
    "weaknesses": [],
    "aiSummary": "string",
    "recommendation": "string",
    "analyzedAt": "ISO date"
  },
  "processing": {
    "resumeParse": "PENDING | RUNNING | COMPLETED | FAILED | null",
    "resumeAnalysis": "PENDING | RUNNING | COMPLETED | FAILED | null"
  }
}
```

`analysis` may be `null` if none exists.

### Errors

| Status | When          |
| ------ | ------------- |
| `400`  | Invalid UUID  |
| `403`  | Wrong company |
| `404`  | Not found     |

---

## 2. List applications by job

`GET /application/jobs/:jobId`

### Path

| Param   | Type |
| ------- | ---- |
| `jobId` | UUID |

### Query (`FindJobApplicationsQueryDto`)

| Param       | Type                                          | Default        | Notes                                        |
| ----------- | --------------------------------------------- | -------------- | -------------------------------------------- |
| `page`      | int ≥ 1                                       | `1`            |                                              |
| `limit`     | int 1–100                                     | `20`           |                                              |
| `search`    | string                                        | —              | Candidate name / email                       |
| `status`    | enum or comma list                            | —              | e.g. `SHORTLISTED` or `SHORTLISTED,REJECTED` |
| `sortBy`    | `rankPosition` \| `matchScore` \| `appliedAt` | `rankPosition` |                                              |
| `sortOrder` | `asc` \| `desc`                               | `asc`          |                                              |

### Response `200`

```json
{
  "data": [
    {
      "id": "uuid",
      "status": "APPLIED",
      "source": "FORM_FILL",
      "matchScore": 90,
      "rankPosition": 1,
      "appliedAt": "ISO date",
      "candidate": {
        "id": "uuid",
        "fullName": "string",
        "email": "string | null"
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

### Errors

| Status | When                              |
| ------ | --------------------------------- |
| `400`  | Missing company / invalid `jobId` |
| `404`  | Job not found / not owned         |

---

## 3. List shortlisted

`GET /application/jobs/:jobId/shortlisted`

### Query (`ShortlistListQueryDto`)

| Param    | Type                                                     | Default       | Notes                                             |
| -------- | -------------------------------------------------------- | ------------- | ------------------------------------------------- |
| `page`   | int ≥ 1                                                  | `1`           |                                                   |
| `limit`  | int 1–100                                                | `20`          |                                                   |
| `sortBy` | `match_score` \| `name` \| `source` \| `rejected_source` | `match_score` | `rejected_source` ignored for shortlisted         |
| `order`  | `asc` \| `desc`                                          | `asc`         |                                                   |
| `search` | string                                                   | —             | Not applied in current shortlisted implementation |

### Response `200`

```json
{
  "success": true,
  "data": {
    "job": {
      "id": "uuid",
      "title": "string",
      "company": "string | null",
      "department": "string | null",
      "applicantsCount": 120
    },
    "candidates": [
      {
        "applicationId": "uuid",
        "candidateId": "uuid",
        "name": "string",
        "initials": "JD",
        "role": null,
        "matchScore": 88,
        "skills": ["TypeScript"],
        "experience": null,
        "avatarUrl": null,
        "source": "ai_shortlisted | manually_shortlisted",
        "shortlistedAt": "ISO date",
        "overriddenAt": null
      }
    ],
    "stats": {
      "totalShortlisted": 10,
      "aiSelected": 7,
      "manuallyAdded": 3,
      "totalRejected": 50,
      "isFinalized": false,
      "finalizedAt": null
    },
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 10,
      "totalPages": 1
    }
  }
}
```

---

## 4. List pool (not shortlisted)

`GET /application/jobs/:jobId/rejected`

**Note:** Returns applications with status **`APPLIED`** (pool not shortlisted), not `REJECTED`.

### Query

Same as `ShortlistListQueryDto`. `search` filters candidate name/email. Sort: `match_score` or `name`.

### Response `200`

```json
{
  "success": true,
  "data": {
    "candidates": [
      {
        "applicationId": "uuid",
        "candidateId": "uuid",
        "name": "string",
        "initials": "JD",
        "role": null,
        "matchScore": 72,
        "skills": [],
        "experience": null,
        "avatarUrl": null,
        "rejectedSource": "not_shortlisted",
        "rejectedAt": "ISO date"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "totalPages": 3
    }
  }
}
```

---

## 5. Apply (public)

`POST /application/apply`  
`Content-Type: multipart/form-data`

### Body

| Field  | Type          | Required                          |
| ------ | ------------- | --------------------------------- |
| `file` | file          | yes — PDF / DOC / DOCX, max 10 MB |
| `data` | string (JSON) | yes — see schema below            |

### `data` JSON (`ApplyWithParsedDto`)

```json
{
  "jobId": "uuid",
  "companyId": "uuid",
  "personal": {
    "firstName": "string",
    "lastName": "string",
    "email": "string (optional, email)",
    "phone": "string (optional)",
    "headline": "string (optional)",
    "address": "string (optional)"
  },
  "education": [
    {
      "school": "string",
      "fieldOfStudy": "string (optional)",
      "degree": "string (optional)",
      "startDate": "string (optional)",
      "endDate": "string (optional)"
    }
  ],
  "experience": [
    {
      "title": "string",
      "company": "string (optional)",
      "industry": "string (optional)",
      "summary": "string (optional)",
      "startDate": "string (optional)",
      "endDate": "string (optional)",
      "isCurrent": true
    }
  ],
  "skills": [{ "name": "string", "category": "string (optional)" }]
}
```

### Response `201`

```json
{
  "applicationId": "uuid",
  "candidateId": "uuid",
  "resumeId": "uuid",
  "resumeUrl": "string",
  "status": "APPLIED"
}
```

### Errors

| Status | When                                                |
| ------ | --------------------------------------------------- |
| `400`  | Missing file/data, bad JSON, validation, wrong MIME |
| `404`  | Job or company not found                            |
| `409`  | Already applied to this job                         |
| `500`  | Unexpected failure (uploaded file cleaned up)       |

---

## 6. Bulk import resumes

`POST /application/jobs/:jobId/bulk`  
`Content-Type: multipart/form-data`  
Response: `202 Accepted`

### Body

| Field   | Type   | Required                                        |
| ------- | ------ | ----------------------------------------------- |
| `files` | file[] | yes — max 100 files, each ≤ 10 MB, PDF/DOC/DOCX |

### Response `202`

```json
{
  "jobId": "uuid",
  "companyId": "uuid",
  "accepted": 3,
  "rejected": 1,
  "applications": [
    {
      "applicationId": "uuid",
      "candidateId": "uuid",
      "resumeId": "uuid",
      "fileName": "resume.pdf"
    }
  ],
  "errors": [{ "fileName": "bad.pdf", "reason": "string" }]
}
```

---

## 7. Shortlist top N

`POST /application/jobs/:jobId/shortlist-top`

### Body (`ShortlistTopDto`)

```json
{ "count": 10 }
```

| Field   | Type | Rules |
| ------- | ---- | ----- |
| `count` | int  | 1–500 |

### Response `200` (`ShortlistTopResult`)

```json
{
  "jobId": "uuid",
  "requested": 10,
  "shortlisted": 8,
  "applicationIds": ["uuid", "..."],
  "skippedReason": "RANKING_NOT_READY | NO_QUALIFIED_APPLICATIONS"
}
```

`skippedReason` only when nothing was shortlisted for that reason (manual path typically omits ranking-ready skip).

Only **APPLIED** rows are updated → **SHORTLISTED**, ordered by `rankPosition` asc, then `matchScore` desc, then `appliedAt` asc. Job must belong to recruiter’s company.

---

## 8. Bulk shortlist by IDs

`POST /application/jobs/:jobId/bulk-shortlist`

### Body (`BulkShortlistDto`)

```json
{
  "applicationIds": ["uuid", "uuid"]
}
```

| Field            | Rules                        |
| ---------------- | ---------------------------- |
| `applicationIds` | 1–50 UUIDs, unique preferred |

### Response `200` (`BulkShortlistResult`)

```json
{
  "shortlistedCount": 5,
  "failedCount": 1,
  "failedIds": ["uuid"],
  "message": "5 of 6 candidates shortlisted. 1 failed."
}
```

- Eligible: **APPLIED** only
- Already **SHORTLISTED**: counted as success (idempotent)
- Missing / wrong job / other status → `failedIds`

---

## 9. Shortlist one

`POST /application/:id/shortlist`

### Response `200`

```json
{
  "success": true,
  "message": "Candidate shortlisted successfully."
}
```

or idempotent:

```json
{
  "success": true,
  "message": "Candidate is already shortlisted."
}
```

### Errors

| Status | When                                 |
| ------ | ------------------------------------ |
| `400`  | Invalid status transition / bad UUID |
| `403`  | Not owned                            |
| `404`  | Not found                            |

---

## 10. Unshortlist one

`POST /application/:id/unshortlist`

Sets status **SHORTLISTED → APPLIED**. `isAutoShortlisted` is **not** cleared.

### Response `200`

```json
{
  "success": true,
  "message": "Candidate unshortlisted successfully."
}
```

### Errors

| Status | When                      |
| ------ | ------------------------- |
| `400`  | Not currently SHORTLISTED |
| `403`  | Not owned                 |
| `404`  | Not found                 |

---

## Status transitions (this module)

| Action                            | From          | To            |
| --------------------------------- | ------------- | ------------- |
| Apply / bulk import               | —             | `APPLIED`     |
| Shortlist (single / bulk / top-N) | `APPLIED`     | `SHORTLISTED` |
| Unshortlist                       | `SHORTLISTED` | `APPLIED`     |

`REJECTED` / `INTERVIEW` are used elsewhere (e.g. finalize in `ApplicationService`) and are **not** exposed on the controller routes above.

---

## Common file rules

| Rule                  | Value                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| MIME                  | `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| Max size              | 10 MB per file                                                                                                     |
| Bulk import max files | 100                                                                                                                |

---
