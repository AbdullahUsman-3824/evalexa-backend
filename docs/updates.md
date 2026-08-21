# APIs — Request & Response

Auth: recruiter session (cookie / JWT). Base URL: existing backend URL.

---

## 1. Job Public View Page

```http
GET /public/jobs/:slug
```

**Response `200`:** `Job`

```json
{
  "id": "316a1174-c1d5-4303-bf01-3050210b7e9e",
  "title": "Full stack developer",
  "slug": "full-stack-developer-at-ibrands",
  "department": "Engineering",
  "description": "full stack developer",
  "jobType": "PART_TIME",
  "experienceLevel": "JUNIOR",
  "educationLevel": "BACHELOR",
  "salaryMin": 35000,
  "salaryMax": 45000,
  "salaryCurrency": "PKR",
  "salaryPeriod": "MONTHLY",
  "location": "Derby, England",
  "workModel": "ONSITE",
  "applicationDeadline": "2026-08-30T00:00:00.000Z",
  "totalOpenings": 1,
  "company": {
    "id": "c9deb56c-97b8-46a0-be09-718c008a2931",
    "name": "iBrands",
    "slug": "ibrands",
    "logo": "https://mvzistpkftgerdtbgspi.storage.supabase.co/storage/v1/object/public/company-logos/c9deb56c-97b8-46a0-be09-718c008a2931/logo-1783098154344-ppl202.png",
    "banner": null,
    "industry": "Technology",
    "size": "SMALL_11_50",
    "type": "AGENCY",
    "website": "http://www.ibrand.co.uk",
    "location": "London, England",
    "description": "company desc"
  },
  "jobSkills": [
    {
      "importance": "REQUIRED",
      "weight": 97,
      "skill": {
        "id": "c788dad5-4a38-4240-b25b-12d928ddca10",
        "name": "next js",
        "category": "frontend"
      }
    }
  ]
}
```

---

## 2. Job Summary

```http
GET /jobs/:id/summary
```

**Response `200`:** `Job`

```json
{
  "id": "316a1174-c1d5-4303-bf01-3050210b7e9e",
  "title": "Full stack developer",
  "openings": 1,
  "applications": 2
}
```

---

## 3. AI Processing Status

```http
GET /processing/jobs/:jobId/status
```

**Response `200`:**

```json
{
  "jobId": "8f3...",
  "jobProcessingId": "abc...",

  "status": "RUNNING",
  "currentTask": "RESUME_ANALYSIS",

  "progress": {
    "total": 42,
    "completed": 38,
    "processing": 2,
    "failed": 2
  },

  "startedAt": "2026-08-16T10:00:00.000Z",
  "completedAt": null,

  "retryCount": 1,
  "lastError": null
}
```

**`status`:** `PENDING` | `RUNNING` | `COMPLETED` | `FAILED` | `CANCELLED` | `SKIPPED`  
**`currentTask`:** `RESUME_PARSE` | `RESUME_ANALYSIS` | `RANKING` | `SHORTLISTING` | `null`

---

## 4. Retry all failed (job)

```http
POST /processing/jobs/:jobId/retry-failed
```

**Request:** path only.

**Response**

```json
{
  "jobId": "uuid",
  "retried": 2,
  "results": [
    {
      "applicationId": "uuid",
      "taskId": "uuid",
      "taskType": "RESUME_PARSE",
      "jobName": "resume-parse"
    }
  ]
}
```

`retried: 0`, `results: []` — kuch retryable nahi (phir bhi success).

---

## 5. Get all applications

```http
GET /application/jobs/:jobId
```

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
| ----------- | ------------------- | -------- | -------------- | -------------------------------------------- |
| `page` | number | No | `1` | Page number |
| `limit` | number | No | `20` | Number of applications per page, max `100` |
| `search` | string | No | — | Searches candidate name or email |
| `status` | `ApplicationStatus` | No | — | Filters applications by status |
| `sortBy` | enum | No | `rankPosition` | `rankPosition`, `matchScore`, or `appliedAt` |
| `sortOrder` | enum | No | `asc` | `asc` or `desc` |

**Example Request:**

```http
GET /application/jobs/8f3c...?
page=1&
limit=20&
status=SHORTLISTED&
sortBy=matchScore&
sortOrder=desc
```

**Response `200`:** `Application[]`

```json
{
  "data": [
    {
      "id": "application-uuid",
      "status": "APPLIED",
      "source": "FORM_FILL",
      "matchScore": 92.5,
      "rankPosition": 3,
      "appliedAt": "2026-08-16T12:30:00.000Z",
      "candidate": {
        "id": "candidate-uuid",
        "fullName": "Ali Khan",
        "email": "ali@example.com"
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3
  }
}
```

**Nullable:** `matchScore`, `rankPosition`, analysis fields jab process pending ho.  
**`source`:** `FORM_FILL` | `RESUME_UPLOAD` | `REFERRAL` | `IMPORT` | `API`  
**`status`:** `APPLIED` | `SHORTLISTED` | `INTERVIEW` | `OFFER` | `HIRED` | `REJECTED` | `WITHDRAWN`

---

## 6. Bulk upload resumes

```http
POST /application/job/:jobId/bulk
Content-Type: multipart/form-data
```

**Request**

| Field   | Type   | Rules                                                          |
| ------- | ------ | -------------------------------------------------------------- |
| `files` | File[] | Field name **`files`**. Max 100. Each ≤ 10MB. PDF / DOC / DOCX |

Example (JS):

```ts
const form = new FormData();
files.forEach((f) => form.append('files', f));
// POST form — do not set Content-Type manually
```

**Response `202 Accepted`**

```json
{
  "jobId": "uuid",
  "companyId": "uuid",
  "accepted": 2,
  "rejected": 1,
  "applications": [
    {
      "applicationId": "uuid",
      "candidateId": "uuid",
      "resumeId": "uuid",
      "fileName": "ali.pdf"
    }
  ],
  "errors": [
    {
      "fileName": "bad.txt",
      "reason": "Only PDF, DOC, and DOCX files are allowed"
    }
  ]
}
```

**Errors:** `400` no files / no companyId · `404` job not found · `401`/`403` auth

---

**404** — is job ki processing row abhi nahi bani.

Poll jab tak `status` `RUNNING` / `PENDING` ho; `COMPLETED` / `FAILED` par band + applications list refresh.

---

## 7. Get single application detail

```http
GET /application/:id
```

**Auth:** Recruiter (JWT). Verifies `application.companyId === recruiter.companyId` — returns `403` otherwise.

**Response `200`:**

```json
{
  "application": {
    "id": "application-uuid",
    "status": "SHORTLISTED",
    "source": "FORM_FILL",
    "matchScore": 92.5,
    "rankPosition": 3,
    "isAutoShortlisted": true,
    "appliedAt": "2026-08-16T12:30:00.000Z",
    "updatedAt": "2026-08-16T12:35:00.000Z"
  },
  "job": {
    "id": "job-uuid",
    "title": "Senior Nurse",
    "slug": "senior-nurse"
  },
  "candidate": {
    "id": "candidate-uuid",
    "fullName": "Ali Khan",
    "email": "ali@example.com",
    "phone": "+92...",
    "linkedinUrl": "...",
    "portfolioUrl": "...",
    "location": "Lahore"
  },
  "resume": {
    "id": "resume-uuid",
    "resumeUrl": "...",
    "fileName": "ali-khan-resume.pdf",
    "description": "...",
    "extractedSkills": [],
    "extractedExperience": 5,
    "extractedEducation": "BS Nursing",
    "isPrimary": true,
    "uploadedAt": "2026-08-16T12:20:00.000Z"
  },
  "analysis": {
    "skillMatchScore": 94,
    "experienceScore": 90,
    "educationScore": 88,
    "overallScore": 92,
    "matchedSkills": [],
    "missingSkills": [],
    "strengths": [],
    "weaknesses": [],
    "aiSummary": "...",
    "recommendation": "STRONG_MATCH",
    "analyzedAt": "2026-08-16T12:40:00.000Z"
  },
  "processing": {
    "resumeParse": "COMPLETED",
    "resumeAnalysis": "COMPLETED"
  }
}
```

**Nullable:** `analysis` is `null` if AI analysis hasn't run yet. `processing` values are `null` if that task hasn't been created.  
**`recommendation`:** `STRONG_MATCH` | `GOOD_MATCH` | `AVERAGE_MATCH` | `WEAK_MATCH`  
**`processing` statuses:** `PENDING` | `RUNNING` | `COMPLETED` | `FAILED` | `CANCELLED` | `SKIPPED`  
**Errors:** `400` invalid UUID · `403` application belongs to a different company · `404` not found · `401` unauthenticated

---

## 8. Retry one application

```http
POST /processing/applications/:applicationId/retry
```

**Request:** path only. No body.

**Response**

```json
{
  "applicationId": "uuid",
  "jobId": "uuid",
  "jobProcessingId": "uuid",
  "taskId": "uuid",
  "taskType": "RESUME_PARSE",
  "jobName": "resume-parse"
}
```

`taskType` / `jobName`: parse **ya** analysis (jo last fail/stuck tha).

**404** — koi retryable parse/analysis task nahi.

---
