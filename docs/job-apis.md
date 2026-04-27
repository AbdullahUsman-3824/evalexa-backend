# Job APIs

This document describes the current job-related APIs for the Evalexa backend.

## Authentication

All job endpoints require a valid Bearer token.

The authenticated user payload already contains `companyId`, so job APIs read the company directly from the logged-in user context. Do not send `companyId` in the request body.

## Base Route

`/jobs`

## Job Model Summary

A job includes the following data:

- company ownership
- creator
- title and description
- job type
- experience level
- salary range
- location
- work model
- status
- application deadline
- AI configuration
- required/preferred skills

## Create Job

Create a new job for the recruiter’s company.

### `POST /jobs`

### Request Body

```json
{
  "title": "Senior Backend Engineer",
  "description": "Build and maintain core backend services.",
  "jobType": "full-time",
  "experienceLevel": "senior",
  "salaryMin": 300000,
  "salaryMax": 450000,
  "location": "Lahore, Pakistan",
  "workModel": "hybrid",
  "status": "draft",
  "applicationDeadline": "2026-05-30T00:00:00.000Z",
  "skills": [
    {
      "name": "Node.js",
      "category": "Backend",
      "importance": "required",
      "weight": 10
    },
    {
      "name": "PostgreSQL",
      "category": "Database",
      "importance": "preferred",
      "weight": 5
    }
  ],
  "aiConfig": {
    "minMatchScore": 70,
    "autoShortlistThreshold": 80,
    "enableAutoShortlist": true,
    "enableAiInterview": false,
    "aiInterviewThreshold": 85
  }
}
```

### Skill Payload

`skills` is an array of objects used to create or reuse records in the `skills` table.

Each item must include:

- `name` - the skill name used to create or reuse the backend skill record
- `category` - the skill category stored with the skill record
- `importance` - `required` or `preferred`
- `weight` - numeric priority used by the backend

Example:

```json
"skills": [
  {
    "name": "Node.js",
    "category": "Backend",
    "importance": "required",
    "weight": 10
  },
  {
    "name": "PostgreSQL",
    "category": "Database",
    "importance": "preferred",
    "weight": 5
  }
]
```

The backend creates a new skill when the name does not already exist, otherwise it reuses the existing skill record by name.

### Notes

- `status` is optional. If omitted, the job is created as `draft`.
- `skills` is required and must contain at least one skill.
- `aiConfig` is required for the create flow.
- `salaryMin` must be less than or equal to `salaryMax`.

### Example Response

```json
{
  "id": 12,
  "companyId": 4,
  "createdBy": 7,
  "title": "Senior Backend Engineer",
  "description": "Build and maintain core backend services.",
  "jobType": "full-time",
  "experienceLevel": "senior",
  "salaryMin": 300000,
  "salaryMax": 450000,
  "location": "Lahore, Pakistan",
  "workModel": "hybrid",
  "status": "draft",
  "applicationDeadline": "2026-05-30T00:00:00.000Z",
  "company": {
    "id": 4,
    "name": "Evalexa",
    "logo": null,
    "location": "Lahore, Pakistan"
  },
  "creator": {
    "id": 7,
    "fullName": "Recruiter Name",
    "email": "recruiter@example.com"
  },
  "aiConfig": {
    "id": 3,
    "jobId": 12,
    "minMatchScore": 70,
    "autoShortlistThreshold": 80,
    "enableAutoShortlist": true,
    "enableAiInterview": false,
    "aiInterviewThreshold": 85
  },
  "jobSkills": [
    {
      "jobId": 12,
      "skillId": 1,
      "importance": "required",
      "weight": 10,
      "skill": {
        "id": 1,
        "name": "Node.js",
        "category": "Backend"
      }
    }
  ]
}
```

## Get All Jobs for Company

Returns all jobs owned by the authenticated user’s company.

### `GET /jobs`

### Query Parameters

- `search` - optional text search over title, description, and location
- `status` - optional job status filter
- `jobType` - optional job type filter
- `workModel` - optional work model filter
- `sortBy` - optional sort order

### Supported Sort Values

- `newest`
- `deadline`

### Example

`GET /jobs?status=draft&sortBy=newest`

### Notes

- Results are always scoped to the company in the authenticated user data.
- `newest` sorts by `createdAt` descending.
- `deadline` sorts by `applicationDeadline` ascending.

## Get Job by ID

Fetch a single job owned by the authenticated user’s company.

### `GET /jobs/:id`

### Example

`GET /jobs/12`

## Update Job

Update an existing job owned by the authenticated user’s company.

### `PATCH /jobs/:id`

### Request Body

Any of the create fields can be updated.

```json
{
  "status": "open",
  "salaryMin": 320000,
  "salaryMax": 470000,
  "aiConfig": {
    "minMatchScore": 75,
    "autoShortlistThreshold": 85,
    "enableAutoShortlist": true,
    "enableAiInterview": true,
    "aiInterviewThreshold": 90
  },
  "skills": [
    {
      "name": "Node.js",
      "category": "Backend",
      "importance": "required",
      "weight": 10
    }
  ]
}
```

### Notes

- Updating `skills` replaces the existing job skill list.
- Updating `aiConfig` updates the existing job AI config or creates one if needed.
- Job ownership is still enforced through the company in the authenticated user payload.

## Not Implemented Yet

These are planned but not available yet:

- applicant management
- ranking by most applicants

## Error Cases

- `401 Unauthorized` - missing or invalid Bearer token
- `403 Forbidden` - user is not an active recruiter
- `400 Bad Request` - invalid payload, bad salary range, unknown skills, or missing company context
- `404 Not Found` - job not found for the authenticated company
