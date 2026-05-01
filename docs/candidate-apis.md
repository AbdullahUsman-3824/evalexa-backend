# Candidate APIs

This document describes the current candidate-related APIs for the Evalexa backend.

## Authentication

Candidate endpoints **do not require authentication**. The candidate module manages candidates as standalone entities independent of user login context.

## Base Route

`/candidate`

## Candidate Model Summary

A candidate includes the following data:

- full name (required)
- email (optional)
- phone (optional)
- LinkedIn URL (optional)
- portfolio URL (optional)
- location (optional)
- source (how the candidate was added: `job_page`, `bulk_upload`, or `manual_entry`)
- resume count (number of resumes associated)
- application count (number of applications submitted)
- timestamps (createdAt, updatedAt)

## Create Candidate

Create a new candidate or return existing candidate by email.

### `POST /candidate`

### Request Body

```json
{
  "fullName": "Alice Johnson",
  "email": "alice.johnson@example.com",
  "phone": "+92-300-1234567",
  "linkedinUrl": "https://linkedin.com/in/alicejohnson",
  "portfolioUrl": "https://alicejohnson.dev",
  "location": "Lahore, Pakistan",
  "source": "job_page"
}
```

### Field Details

- `fullName` - required, 2-255 characters
- `email` - optional, valid email format, max 255 characters
- `phone` - optional, max 50 characters
- `linkedinUrl` - optional, valid URL, max 255 characters
- `portfolioUrl` - optional, valid URL, max 255 characters
- `location` - optional, max 255 characters
- `source` - optional, one of: `job_page`, `bulk_upload`, `manual_entry` (defaults to `job_page`)

### Example Response

```json
{
  "id": 1,
  "fullName": "Alice Johnson",
  "email": "alice.johnson@example.com",
  "phone": "+92-300-1234567",
  "linkedinUrl": "https://linkedin.com/in/alicejohnson",
  "portfolioUrl": "https://alicejohnson.dev",
  "location": "Lahore, Pakistan",
  "source": "JOB_PAGE",
  "createdAt": "2026-05-02T10:30:00.000Z",
  "updatedAt": "2026-05-02T10:30:00.000Z"
}
```

### Notes

- If a candidate with the same **normalized email** already exists, the existing record is returned.
- Email is normalized (trimmed and lowercased) before uniqueness check.
- Only candidate fields are stored and returned; resume and application data are managed separately.

## Search Candidate by Email

Find a candidate by email address.

### `GET /candidate/search?email=alice.johnson@example.com`

### Query Parameters

- `email` - optional email to search for

### Example Response

```json
{
  "id": 1,
  "fullName": "Alice Johnson",
  "email": "alice.johnson@example.com",
  "phone": "+92-300-1234567",
  "linkedinUrl": "https://linkedin.com/in/alicejohnson",
  "portfolioUrl": "https://alicejohnson.dev",
  "location": "Lahore, Pakistan",
  "source": "JOB_PAGE",
  "createdAt": "2026-05-02T10:30:00.000Z",
  "updatedAt": "2026-05-02T10:30:00.000Z"
}
```

### Notes

- If `email` is missing or empty, returns `null`.
- Email is normalized (trimmed and lowercased) before search.
- Does not return nested resume or application data.

## Get Candidate Profile

Fetch a candidate's profile including counts of associated resumes and applications.

### `GET /candidate/:id/profile`

### Path Parameters

- `id` - candidate ID (integer)

### Example

`GET /candidate/1/profile`

### Example Response

```json
{
  "id": 1,
  "fullName": "Alice Johnson",
  "email": "alice.johnson@example.com",
  "phone": "+92-300-1234567",
  "linkedinUrl": "https://linkedin.com/in/alicejohnson",
  "portfolioUrl": "https://alicejohnson.dev",
  "location": "Lahore, Pakistan",
  "source": "JOB_PAGE",
  "createdAt": "2026-05-02T10:30:00.000Z",
  "updatedAt": "2026-05-02T10:30:00.000Z",
  "_count": {
    "resumes": 2,
    "applications": 3
  }
}
```

### Notes

- `_count` contains counts of resumes and applications associated with the candidate.
- Individual resume/application details are **not** included; use separate Resume/Application APIs for full data.
- Throws `404 Not Found` if candidate does not exist.

## Update Candidate

Update an existing candidate's information.

### `PATCH /candidate/:id`

### Path Parameters

- `id` - candidate ID (integer)

### Request Body

Any field from the create payload can be updated:

```json
{
  "fullName": "Alice Johnson Updated",
  "email": "alice.newemail@example.com",
  "phone": "+92-300-9876543",
  "location": "Karachi, Pakistan",
  "source": "bulk_upload"
}
```

### Example Response

```json
{
  "id": 1,
  "fullName": "Alice Johnson Updated",
  "email": "alice.newemail@example.com",
  "phone": "+92-300-9876543",
  "linkedinUrl": "https://linkedin.com/in/alicejohnson",
  "portfolioUrl": "https://alicejohnson.dev",
  "location": "Karachi, Pakistan",
  "source": "BULK_UPLOAD",
  "createdAt": "2026-05-02T10:30:00.000Z",
  "updatedAt": "2026-05-02T11:45:00.000Z"
}
```

### Notes

- All candidate fields are optional in the update request.
- Email is normalized before update.
- Only explicit candidate fields are persisted; nested resume/application data is ignored.
- Throws `404 Not Found` if candidate does not exist.

## Error Cases

- `400 Bad Request` - invalid payload (e.g., invalid email format, invalid URL, string too long)
- `404 Not Found` - candidate not found (for GET profile or PATCH)
- `422 Unprocessable Entity` - validation error during create/update

## Testing with cURL

### Create a candidate

```bash
curl -X POST http://localhost:3000/candidate \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Bob Smith",
    "email": "bob.smith@example.com",
    "phone": "+92-300-5555555",
    "linkedinUrl": "https://linkedin.com/in/bobsmith",
    "portfolioUrl": "https://bobsmith.dev",
    "location": "Karachi",
    "source": "manual_entry"
  }'
```

### Search by email

```bash
curl http://localhost:3000/candidate/search?email=bob.smith@example.com
```

### Get candidate profile

```bash
curl http://localhost:3000/candidate/1/profile
```

### Update candidate

```bash
curl -X PATCH http://localhost:3000/candidate/1 \
  -H "Content-Type: application/json" \
  -d '{
    "location": "Islamabad",
    "phone": "+92-300-9999999"
  }'
```

## Future APIs

These are planned but not yet implemented:

- Batch candidate import with validation
- Candidate soft delete / archive
- Candidate tagging and segmentation
- Bulk email updates
