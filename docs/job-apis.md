# Job APIs

This document describes the current job-related APIs for the Evalexa backend.

## Authentication

All job endpoints require a valid Bearer token.

The authenticated user payload already contains `companyId`, so job APIs read the company directly from the logged-in user context. Do not send `companyId` in the request body.

The backend also requires the authenticated user to be an active recruiter. If the token is valid but the account is not an active recruiter, the request is rejected with `403 Forbidden`.

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
  "title": "Senior MERN Stack Developer",

  "location": "Lahore, Pakistan",

  // full-time | part-time | contract
  "jobType": "full-time",

  // remote | hybrid | onsite
  "workModel": "hybrid",

  "description": "We are looking for an experienced MERN Stack Developer to join our engineering team. The ideal candidate should have strong experience with React, Next.js, NestJS, MongoDB, and TypeScript.",

  "department": "Development",

  "applicationDeadline": "2026-08-31",

  // junior | mid | senior | lead
  "experienceLevel": "senior",

  // high_school | bachelor | master | phd | any
  "educationLevel": "bachelor",

  "salary": {
    "min": 250000,
    "max": 400000,
    "currency": "PKR",

    // monthly | yearly
    "period": "monthly"
  },

  // open | closed | draft
  "status": "open",

  "skills": [
    {
      "skillId": "6f08b6f5-3cb4-47fc-bc3e-0c0dd3d6c8a1",

      // required | preferred
      "importance": "required",

      "weight": 40
    }
  ],

  "responsibilities": "Design, develop, and maintain scalable web applications. Collaborate with cross-functional teams. Review code, mentor junior developers, and participate in architecture decisions.",

  "aiConfig": {
    "enableAutoShortlist": true,

    "enableAiInterview": true,

    "resumeSelectionCount": 20,

    "interviewSelectionCount": 5
  }
}
```

### Skill Payload

`skills` is an array of existing skill references. The backend validates each `skillId` against the `skills` table and creates the job-skill links from those ids.

Each item must include:

- `skillId` - the id of an existing skill record
- `importance` - `required` or `preferred`
- `weight` - numeric priority used by the backend

Example:

```json
"skills": [
  {
    "skillId": "11111111-1111-1111-1111-111111111111",
    "importance": "required",
    "weight": 10
  },
  {
    "skillId": "22222222-2222-2222-2222-222222222222",
    "importance": "preferred",
    "weight": 5
  }
]
```

Use `GET /skills` to fetch the available skill ids before creating or updating a job.

### Notes

- `status` is optional. If omitted, the job is created as `draft`.
- `educationLevel` is optional. If omitted, the backend stores `any`.
- `skills` is required and must contain at least one skill.
- `aiConfig` is required for the create flow.
- `salaryMin` must be less than or equal to `salaryMax`.

### Example Response

```json
{
  "id": "55555555-5555-5555-5555-555555555555",
  "companyId": "44444444-4444-4444-4444-444444444444",
  "createdBy": "77777777-7777-7777-7777-777777777777",
  "title": "Senior Backend Engineer",
  "slug": "senior-backend-engineer-at-evalexa",
  "department": "Engineering",
  "description": "Build and maintain core backend services.",
  "responsibilities": "Write, review, and maintain backend services.",
  "jobType": "full-time",
  "experienceLevel": "senior",
  "educationLevel": "bachelor",
  "salaryMin": 300000,
  "salaryMax": 450000,
  "salaryCurrency": "PKR",
  "salaryPeriod": "monthly",
  "location": "Lahore, Pakistan",
  "workModel": "hybrid",
  "status": "draft",
  "applicationDeadline": "2026-05-30T00:00:00.000Z",
  "createdAt": "2026-05-30T00:00:00.000Z",
  "updatedAt": "2026-05-30T00:00:00.000Z",
  "company": {
    "id": "44444444-4444-4444-4444-444444444444",
    "name": "Evalexa",
    "logo": null,
    "location": "Lahore, Pakistan"
  },
  "creator": {
    "id": "77777777-7777-7777-7777-777777777777",
    "fullName": "Recruiter Name",
    "email": "recruiter@example.com"
  },
  "aiConfig": {
    "id": "33333333-3333-3333-3333-333333333333",
    "jobId": "55555555-5555-5555-5555-555555555555",
    "enableAutoShortlist": true,
    "resumeSelectionCount": 20,
    "enableAiInterview": false,
    "interviewSelectionCount": 5,
    "createdAt": "2026-05-30T00:00:00.000Z",
    "updatedAt": "2026-05-30T00:00:00.000Z"
  },
  "jobSkills": [
    {
      "jobId": "55555555-5555-5555-5555-555555555555",
      "skillId": "11111111-1111-1111-1111-111111111111",
      "importance": "required",
      "weight": 10,
      "skill": {
        "id": "11111111-1111-1111-1111-111111111111",
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
- `status` - optional job status filter using `open`, `closed`, or `draft`
- `jobType` - optional job type filter using `full-time`, `part-time`, or `contract`
- `workModel` - optional work model filter using `remote`, `hybrid`, or `onsite`
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
- `search` matches title, description, and location only.

## Get Job Titles

Returns the job id and title list for the authenticated user’s company.

### `GET /jobs/titles`

### Notes

- Results are scoped to the authenticated user’s company.
- Results are ordered by `createdAt` descending.

### Example Response

```json
[
  {
    "id": "55555555-5555-5555-5555-555555555555",
    "title": "Senior Backend Engineer"
  }
]
```

## Get Job by ID

Fetch a single job owned by the authenticated user’s company.

### `GET /jobs/:id`

### Example

`GET /jobs/55555555-5555-5555-5555-555555555555`

## Update Job

Update an existing job owned by the authenticated user’s company.

### `PATCH /jobs/:id`

### Request Body

Any of the create fields can be updated.

```json
{
  "status": "open",
  "salary": {
    "min": 320000,
    "max": 470000,
    "currency": "PKR",
    "period": "monthly"
  },
  "aiConfig": {
    "enableAutoShortlist": true,
    "resumeSelectionCount": 20,
    "enableAiInterview": true,
    "interviewSelectionCount": 5
  },
  "skills": [
    {
      "skillId": "11111111-1111-1111-1111-111111111111",
      "importance": "required",
      "weight": 10
    }
  ]
}
```

### Notes

- Updating `skills` replaces the existing job skill list.
- Updating `aiConfig` merges with the existing job AI config. If the job already has AI config, partial updates are allowed.
- If you send `aiConfig` for a job without existing config, all four fields are required.
- Job ownership is still enforced through the company in the authenticated user payload.

### Update Field Details

- All create-job fields are accepted in update requests.
- `salary` is optional and can include any subset of `min`, `max`, `currency`, and `period`.
- `skills` is optional; when present it fully replaces the current job-skill assignments.
- `aiConfig` is optional; when present it is merged with the existing config.

## Not Implemented Yet

These are planned but not available yet:

- applicant management
- ranking by most applicants

## Error Cases

- `401 Unauthorized` - missing or invalid Bearer token
- `403 Forbidden` - user is not an active recruiter
- `400 Bad Request` - invalid payload, bad salary range, invalid enum values, unknown skill ids, or missing company context
- `404 Not Found` - job not found for the authenticated company

## Skills APIs

This document also includes the skill management APIs exposed by the backend.

## Base Route

`/skills`

## Skill Model Summary

A skill includes:

- `id`
- `name`
- `category`

The backend normalizes `name` and `category` by trimming whitespace and converting them to lowercase on create and update.

The unique constraint is on normalized `name`, so duplicates are rejected after trimming and lowercasing.

## Create Skill

Create a new skill record.

### `POST /skills`

### Request Body

```json
{
  "name": "Node.js",
  "category": "Backend"
}
```

### Notes

- `name` is required and must be at most 150 characters.
- `category` is required and must be at most 100 characters.
- If a skill with the same normalized name already exists, the request returns a conflict error.
- The stored values are lowercase after normalization.

### Example Response

```json
{
  "id": "skill-uuid",
  "name": "node.js",
  "category": "backend"
}
```

## List Skills

Returns all skills matching the optional filters.

### `GET /skills`

### Query Parameters

- `category` - optional category filter using case-insensitive contains matching
- `search` - optional skill name search using case-insensitive contains matching

### Example

`GET /skills?category=backend&search=node`

### Example Response

```json
[
  {
    "id": "skill-uuid",
    "name": "node.js",
    "category": "backend"
  }
]
```

## List Skill Categories

Returns distinct skill categories in ascending order.

### `GET /skills/categories`

### Example Response

```json
["backend", "database", "devops"]
```

## Get Skill by ID

Fetch a single skill by id.

### `GET /skills/:id`

### Example

`GET /skills/skill-uuid`

## Update Skill

Update an existing skill.

### `PATCH /skills/:id`

### Request Body

Any subset of the create fields can be updated.

```json
{
  "name": "NestJS",
  "category": "Backend"
}
```

### Notes

- Partial updates are allowed.
- Updated values are normalized the same way as create requests.
- A conflict is returned if the updated name collides with another existing skill.
- The unique check uses the normalized lowercase name.

### Example Response

```json
{
  "id": "skill-uuid",
  "name": "nestjs",
  "category": "backend"
}
```

## Delete Skill

Delete a skill by id.

### `DELETE /skills/:id`

### Example

`DELETE /skills/skill-uuid`

## Skill Errors

- `400 Bad Request` - invalid skill payload or query parameters
- `404 Not Found` - skill not found
- `409 Conflict` - skill name already exists
