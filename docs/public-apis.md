# Public APIs

This document describes the public-facing APIs exposed by the Evalexa backend.

## Authentication

Public endpoints do not require authentication.

## Base Routes

- `/public/jobs`
- `/public/companies`

## Public Data Rules

Only public-safe data is exposed.

- Jobs are limited to `OPEN` postings that have not expired.
- Companies are returned without internal recruiter/admin fields.
- Job detail responses include company and skill information needed by public clients.
- Application endpoints reuse the existing resume and application pipeline.

## Common Pagination Shape

Paginated endpoints return this structure:

```json
{
  "items": [],
  "pagination": {
    "page": 1,
    "limit": 12,
    "totalItems": 0,
    "totalPages": 0,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

## Public Jobs

### 1) List Public Jobs

### `GET /public/jobs`

Returns only open, non-expired jobs.

### Query Parameters

- `page` - optional page number, default `1`
- `limit` - optional page size, default `12`, max `50`
- `search` - optional search over title, description, location, company, and skills
- `location` - optional location filter
- `employmentType` - optional job type filter: `FULL_TIME`, `PART_TIME`, `CONTRACT`
- `experienceLevel` - optional filter: `JUNIOR`, `MID`, `SENIOR`, `LEAD`
- `company` - optional company name or slug filter
- `skills` - optional comma-separated skill names
- `sort` - optional sort order: `newest`, `oldest`, `deadline`, `salary-high`, `salary-low`

### Example

`GET /public/jobs?search=backend&employmentType=FULL_TIME&sort=newest`

### Example Response

```json
{
  "items": [
    {
      "id": "job-uuid",
      "title": "Senior Backend Engineer",
      "slug": "senior-backend-engineer-at-evalexa",
      "description": "Build and maintain core backend services.",
      "jobType": "FULL_TIME",
      "experienceLevel": "SENIOR",
      "salaryMin": 300000,
      "salaryMax": 450000,
      "location": "Lahore, Pakistan",
      "workModel": "HYBRID",
      "status": "OPEN",
      "applicationDeadline": "2026-05-30T00:00:00.000Z",
      "createdAt": "2026-05-09T10:00:00.000Z",
      "updatedAt": "2026-05-09T10:00:00.000Z",
      "company": {
        "id": "company-uuid",
        "name": "Evalexa",
        "slug": "evalexa",
        "logo": null,
        "industry": "Software",
        "companySize": "51-200",
        "website": "https://evalexa.com",
        "location": "Lahore, Pakistan",
        "description": "Product company focused on recruitment tech.",
        "createdAt": "2026-05-01T00:00:00.000Z",
        "updatedAt": "2026-05-09T10:00:00.000Z"
      },
      "jobSkills": [
        {
          "importance": "REQUIRED",
          "weight": 10,
          "skill": {
            "id": "skill-uuid",
            "name": "Node.js",
            "category": "Backend"
          }
        }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 12,
    "totalItems": 1,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

### 2) Featured Jobs

### `GET /public/jobs/featured`

Returns a small curated set of open jobs ordered by recency.

### Example

`GET /public/jobs/featured`

### 3) Job Details

### `GET /public/jobs/:jobSlug`

Finds a job by slug and returns public-safe job data.

### Notes

- The slug must be valid and URL-safe.
- Jobs that are not open or have expired are not exposed.

### Example

`GET /public/jobs/senior-backend-engineer-at-evalexa`

### 4) Similar Jobs

### `GET /public/jobs/:jobSlug/similar`

Returns jobs with related skills, experience level, job type, or work model.

### Example

`GET /public/jobs/senior-backend-engineer-at-evalexa/similar`

### 5) Apply to a Job

### `POST /public/jobs/:jobSlug/apply`

Submits a public application using `multipart/form-data`.

### Content Type

`multipart/form-data`

### Form Fields

- `firstName` - required
- `lastName` - required
- `email` - optional
- `phone` - optional
- `linkedinUrl` - optional
- `portfolioUrl` - optional
- `coverLetter` - optional
- `resumeFile` - required file upload

### File Rules

- Allowed types: `PDF`, `DOC`, `DOCX`
- Max size: `10 MB`

### Example Request

```bash
curl -X POST http://localhost:3000/public/jobs/senior-backend-engineer-at-evalexa/apply \
  -F "firstName=Alice" \
  -F "lastName=Johnson" \
  -F "email=alice@example.com" \
  -F "phone=+92-300-1234567" \
  -F "resumeFile=@./resume.pdf"
```

### Example Response

```json
{
  "applicationId": "application-uuid",
  "candidateId": "candidate-uuid",
  "resumeId": "resume-uuid",
  "status": "APPLIED"
}
```

## Public Companies

### 1) List Public Companies

### `GET /public/companies`

Returns public companies with open job counts.

### Query Parameters

- `page` - optional page number, default `1`
- `limit` - optional page size, default `12`, max `50`
- `search` - optional search over company name, slug, location, and description
- `industry` - optional industry filter
- `sort` - optional sort order: `newest`, `name-asc`, `name-desc`, `jobs-high`, `jobs-low`

### Example

`GET /public/companies?search=evalexa&sort=name-asc`

### Example Response

```json
{
  "items": [
    {
      "id": "company-uuid",
      "name": "Evalexa",
      "slug": "evalexa",
      "logo": null,
      "industry": "Software",
      "companySize": "51-200",
      "website": "https://evalexa.com",
      "location": "Lahore, Pakistan",
      "description": "Product company focused on recruitment tech.",
      "createdAt": "2026-05-01T00:00:00.000Z",
      "updatedAt": "2026-05-09T10:00:00.000Z",
      "openJobsCount": 5
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 12,
    "totalItems": 1,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

### 2) Company Details

### `GET /public/companies/:companySlug`

Returns public-safe company data with an open jobs count.

### Example

`GET /public/companies/evalexa`

### 3) Company Jobs

### `GET /public/companies/:companySlug/jobs`

Returns open jobs for a specific public company.

### Query Parameters

Uses the same query parameters as `GET /public/jobs`.

### Example

`GET /public/companies/evalexa/jobs?sort=deadline&limit=10`

## Error Cases

- `400 Bad Request` - invalid payload, invalid slug, invalid file type, invalid pagination, or malformed query params
- `404 Not Found` - job or company not found
- `409 Conflict` - duplicate application submission
- `410 Gone` - job posting has expired

## Implementation Notes

- Public jobs and company reads reuse the existing domain services.
- The application endpoint calls the existing resume parsing and application flow.
- No recruiter/admin fields are exposed from the public routes.
