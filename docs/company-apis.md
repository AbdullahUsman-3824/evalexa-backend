# Company APIs

Base path: `/companies`

All endpoints require authentication (`JwtAuthGuard`) and a recruiter role (`RecruiterRoleGuard`). Pass the JWT as a `Bearer` token in the `Authorization` header.

---

## 1. Create Company

`POST /companies`

Creates a company owned by the authenticated recruiter. A recruiter can own only one company; attempting to create a second returns a conflict error.

**Content-Type:** `multipart/form-data`

### Form Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | Yes | 2–150 chars |
| `industry` | string | Yes | max 100 chars |
| `location` | string | Yes | max 255 chars |
| `description` | string | No | free text |
| `size` | enum | No | `STARTUP_1_10`, `SMALL_11_50`, `MEDIUM_51_200`, `LARGE_201_500`, `ENTERPRISE_500_PLUS` |
| `foundedYear` | integer | No | ≤ current year |
| `type` | enum | No | `STARTUP`, `AGENCY`, `ENTERPRISE`, `NON_PROFIT`, `GOVERNMENT` |
| `website` | string (URL) | No | |
| `email` | string (email) | No | |
| `logo` | file | No | image, max 5MB, 1 file |
| `banner` | file | No | image, max 5MB, 1 file |
| `verificationDocuments` | file[] | No | max 5 files, 5MB each |

### Example (curl)

```bash
curl -X POST https://api.example.com/companies \
  -H "Authorization: Bearer <token>" \
  -F "name=Evalexa" \
  -F "industry=Software" \
  -F "location=Okara, Punjab, PK" \
  -F "description=AI-powered recruitment platform" \
  -F "size=SMALL_11_50" \
  -F "logo=@./logo.png" \
  -F "verificationDocuments=@./reg-cert.pdf"
```

### Success Response — `201 Created`

```json
{
  "id": "c1a2b3c4-...",
  "name": "Evalexa",
  "slug": "evalexa",
  "logo": "https://<project>.supabase.co/storage/v1/object/public/company-logos/c1a2b3c4/logo-...png",
  "banner": null,
  "industry": "Software",
  "size": "SMALL_11_50",
  "foundedYear": null,
  "type": null,
  "website": null,
  "location": "Okara, Punjab, PK",
  "description": "AI-powered recruitment platform",
  "email": null,
  "verificationDocuments": ["c1a2b3c4/verification-...pdf"],
  "verificationStatus": "PENDING",
  "subscriptionPlan": "FREE",
  "isActive": true,
  "createdBy": "u1...",
  "createdAt": "2026-06-30T10:00:00.000Z",
  "updatedAt": "2026-06-30T10:00:00.000Z"
}
```

> Note: `verificationDocuments` contains internal storage paths, not public URLs (private bucket). Use the [signed URLs endpoint](#3-get-verification-document-urls) to access them.

### Errors

| Status | Reason |
|---|---|
| `409 Conflict` | Recruiter already owns a company |
| `400 Bad Request` | Validation failure or file upload failure |

---

## 2. List My Companies

`GET /companies`

Returns all companies created by the authenticated recruiter (currently a recruiter owns at most one, but the endpoint returns an array).

### Success Response — `200 OK`

```json
[
  {
    "id": "c1a2b3c4-...",
    "name": "Evalexa",
    "slug": "evalexa",
    "...": "..."
  }
]
```

---

## 3. Get Company by ID

`GET /companies/:id`

Returns full company details, restricted to the owning recruiter.

### Success Response — `200 OK`

Same shape as the [create response](#success-response--201-created).

### Errors

| Status | Reason |
|---|---|
| `404 Not Found` | Company doesn't exist or doesn't belong to this recruiter |

---

## 3. Get Verification Document URLs

`GET /companies/:id/verification-documents`

Generates short-lived **signed URLs** for the company's uploaded verification documents (stored in a private bucket). URLs expire after 5 minutes (default) — call this endpoint fresh each time you need access; don't cache the URLs.

### Success Response — `200 OK`

```json
[
  "https://<project>.supabase.co/storage/v1/object/sign/company-verification-docs/c1a2b3c4/verification-...pdf?token=...",
  "..."
]
```

Returns `[]` if no documents have been uploaded.

### Errors

| Status | Reason |
|---|---|
| `404 Not Found` | Company doesn't exist or doesn't belong to this recruiter |
| `400 Bad Request` | Failed to generate signed URLs |

---

## 4. Update Company

`PATCH /companies/:id`

Partial update. Only send the fields you want to change.

**Content-Type:** `multipart/form-data`

### Form Fields

Same fields as [Create](#form-fields), all optional. Behavior notes:

- Uploading a new `logo` or `banner` **replaces** the existing file (old file deleted from storage after the DB update succeeds).
- Uploading `verificationDocuments` **appends** to the existing list (does not replace previously submitted documents).
- If `name` changes, the `slug` is regenerated automatically.

### Example (curl)

```bash
curl -X PATCH https://api.example.com/companies/c1a2b3c4-... \
  -H "Authorization: Bearer <token>" \
  -F "description=Updated company description" \
  -F "banner=@./new-banner.png"
```

### Success Response — `200 OK`

Same shape as the [create response](#success-response--201-created), reflecting updated values.

### Errors

| Status | Reason |
|---|---|
| `404 Not Found` | Company doesn't exist or doesn't belong to this recruiter |
| `400 Bad Request` | Validation failure or file upload failure |

---

## 5. Delete Company

`DELETE /companies/:id`

Deletes the company, detaches it from all member users (`companyId` set to `null`), and removes all associated files from storage (logo, banner, verification documents).

### Success Response — `200 OK`

Returns the deleted company's data (pre-deletion snapshot).

### Errors

| Status | Reason |
|---|---|
| `404 Not Found` | Company doesn't exist or doesn't belong to this recruiter |

---

## Public Endpoints

These are exposed separately (not under `/companies`, no auth required) for candidate-facing discovery — listed here for context since they share the same underlying data.

### List Public Companies

`GET /public/companies`

Query params: `search`, `industry`, `sort` (`NAME_ASC`, `NAME_DESC`, `NEWEST`, `JOBS_HIGH`, `JOBS_LOW`), `page`, `limit`.

Returns paginated companies with `openJobsCount` per company. Excludes sensitive fields (`email`, `verificationDocuments`, `createdBy`, `foundedYear`, `website` is included, `description` included).

### Get Public Company by Slug

`GET /public/companies/:slug`

Returns a single company's public profile plus `openJobsCount`.

---

## Enum Reference

**CompanySize**
`STARTUP_1_10` · `SMALL_11_50` · `MEDIUM_51_200` · `LARGE_201_500` · `ENTERPRISE_500_PLUS`

**CompanyType**
`STARTUP` · `AGENCY` · `ENTERPRISE` · `NON_PROFIT` · `GOVERNMENT`

**VerificationStatus**
`PENDING` · `VERIFIED` · `REJECTED`

**SubscriptionPlan**
`FREE` · `BASIC` · `PRO` · `ENTERPRISE`

---

## Storage Notes

| Asset | Bucket | Visibility | Stored as |
|---|---|---|---|
| Logo | `company-logos` | Public | full public URL |
| Banner | `company-banners` | Public | full public URL |
| Verification documents | `company-verification-docs` | Private | storage path (resolved via signed URL endpoint) |

File limits: 5MB per file, max 5 files for `verificationDocuments`, 1 file each for `logo`/`banner`.