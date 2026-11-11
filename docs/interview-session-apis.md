# Interview API endpoints — Candidate Session

The question-by-question interview flow, run by the candidate after verifying
their OTP. Implemented in
`src/modules/interview/controllers/interview-session.controller.ts`.

All endpoints are protected by `InterviewSessionGuard`, which reads only the
`interview_session` cookie issued by `POST /public/interviews/:id/verify-otp`.
`Authorization` headers are not supported for interview sessions. The session
JWT contains `sub` (the interview ID) and `type: "interview_session"`; the
session must belong to the interview in the URL path, otherwise `401` is
returned. Sessions expire after one hour (`Max-Age=3600`).

All `:id` and `:questionId` path parameters are validated as UUIDs
(`ParseUUIDPipe`), so malformed IDs return `400` before any service logic runs.

Interview progression is serialized with a per-interview PostgreSQL advisory
transaction lock (`pg_advisory_xact_lock(hashtext(interviewId))`), so
concurrent requests from the same candidate session cannot double-advance
state.

---

## 1. Start or resume an interview

`POST /interviews/:id/start`

The session must belong to the requested interview. A `PENDING` interview is
changed to `IN_PROGRESS` and receives its `startedAt` timestamp. An already
`IN_PROGRESS` interview is returned unchanged. The first question also moves
to `IN_PROGRESS`.

If the interview has no questions yet, `400` is returned
("Interview has no questions").

### Response `200`

```json
{
  "success": true,
  "data": {
    "interview": {
      "id": "interview-uuid",
      "status": "IN_PROGRESS",
      "startedAt": "2026-11-03T22:40:00.000Z",
      "language": "en",
      "jobTitle": "Senior Software Engineer",
      "companyName": "Example Company"
    }
  }
}
```

### Errors

| Status | Condition                                                                        |
| ------ | -------------------------------------------------------------------------------- |
| `401`  | Session missing, invalid, expired, or belongs to a different interview           |
| `400`  | Interview no longer available (not `PENDING`/`IN_PROGRESS`), or has no questions |
| `404`  | Interview not found                                                              |

---

## 2. Get the next question

`GET /interviews/:id/questions/next`

Marks the next `PENDING` question as `SENT` and returns it. Only two questions
may be outstanding at a time; the previous question must be submitted first.

### Behavior

- Interview must be `IN_PROGRESS`. If it is `COMPLETED`, a structured "no
  question" response with `isCompleted: true` is returned instead of an error.
  Any other status returns `400`.
- `409 Conflict` if two or more questions already have status `SENT`
  ("Wait for the previous question to be submitted before requesting the next
  question").
- A 5-second cooldown applies after the most recent `sentAt` timestamp; calls
  inside the cooldown return `409` with the remaining seconds
  ("Please retry in N seconds").
- If there are no further `PENDING` questions, `question` is `null`.
- If the interview has no `IN_PROGRESS` question, progression is invalid and
  `400` is returned.

### Response `200` — question available

```json
{
  "success": true,
  "data": {
    "interviewId": "interview-uuid",
    "question": {
      "id": "question-uuid",
      "order": 3,
      "category": "CONCEPTUAL",
      "questionText": "Explain the difference between..."
    },
    "isCompleted": false
  }
}
```

### Response `200` — no more questions

```json
{
  "success": true,
  "data": {
    "interviewId": "interview-uuid",
    "question": null,
    "isCompleted": true
  }
}
```

### Errors

| Status | Condition                                                                |
| ------ | ------------------------------------------------------------------------ |
| `401`  | Session missing, invalid, expired, or belongs to a different interview   |
| `400`  | Interview not `IN_PROGRESS` (unless `COMPLETED`), or invalid progression |
| `409`  | Two `SENT` questions outstanding, or 5-second send cooldown still active |
| `404`  | Interview not found                                                      |

---

## 3. Generate a recording upload URL

`POST /interviews/:id/questions/:questionId/recording/upload-url`

Returns a short-lived signed Supabase upload URL for the candidate's answer
recording. The candidate uploads the recording directly to storage, then calls
the submit-answer endpoint with the resulting `storageKey`.

### Behavior

- Interview must be `IN_PROGRESS` (`404` if not found, `400` otherwise).
- The question must belong to the interview (`404`) and currently have status
  `IN_PROGRESS` (`409 Conflict` otherwise).
- The storage path is `{interviewId}/{questionId}/{random-uuid}.audio`.

### Response `200`

```json
{
  "success": true,
  "data": {
    "uploadUrl": "https://<supabase>/storage/v1/object/upload/sign/interviews/...",
    "storagePath": "interviews/<interviewId>/<questionId>/<uuid>.audio",
    "token": "<supabase-upload-token>"
  }
}
```

### Errors

| Status | Condition                                                                  |
| ------ | -------------------------------------------------------------------------- |
| `401`  | Session missing, invalid, expired, or belongs to a different interview     |
| `400`  | Interview not `IN_PROGRESS`                                                |
| `404`  | Interview or question not found (or question belongs to another interview) |
| `409`  | Question is not currently `IN_PROGRESS`                                    |

---

## 4. Submit an answer

`POST /interviews/:id/questions/:questionId/answer`

Confirms the recording for a question was uploaded and records the answer.
Submitting the last question completes the interview.

### Request body

```json
{
  "durationSeconds": 42,
  "storageKey": "<interviewId>/<questionId>/<uuid>.audio",
  "mimeType": "audio/webm",
  "sizeBytes": 1048576
}
```

| Field             | Type    | Rules                                                                                                                     |
| ----------------- | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| `durationSeconds` | integer | `>= 0`, required                                                                                                          |
| `storageKey`      | string  | Required, non-empty. Must start with `{interviewId}/{questionId}/`, have a non-empty remainder, and must not contain `..` |
| `mimeType`        | string  | Must be one of the supported MIME types (see below)                                                                       |
| `sizeBytes`       | integer | `>= 1`, required                                                                                                          |

Supported MIME types (`SUPPORTED_MIME_TYPES` in
`src/common/fastapi/contracts/transcription.contract.ts`):
`audio/webm`, `video/webm`, `audio/wav`, `audio/mpeg`, `audio/mp3`,
`audio/mp4`, `video/mp4`, `audio/ogg`, `audio/flac`, `audio/x-wav`,
`audio/x-m4a`.

### Behavior

- The storage key is validated against the expected path prefix before anything
  else; invalid keys return `400` ("Recording storage key is invalid").
- The uploaded file's existence is verified in Supabase before the answer is
  recorded; a missing file returns `400`
  ("Uploaded recording was not found: `<storageKey>`").
- If an answer already exists for the question, the request is idempotent and
  returns `200` with `submitted: true` (no duplicate answer is created).
- The question must be `IN_PROGRESS` (`409` otherwise).
- Answers must be submitted in question order: any earlier question that is not
  `ANSWERED` causes `409` ("Answers must be submitted in question order"). If a
  later question is `SENT` but has not been issued as `IN_PROGRESS`, `409`
  ("The next question has not been issued") is returned.
- On success the question becomes `ANSWERED` and the next `SENT` question
  becomes `IN_PROGRESS`. If there is no next question and none pending, the
  interview is marked `COMPLETED` with `submittedAt` and `completedAt` set.
- A recording row is created with type `AUDIO` or `VIDEO` (based on the MIME
  type prefix), `uploadStatus: UPLOADED`, and the supplied size and duration.
- Transcription and evaluation are **not** triggered by this endpoint; they run
  separately via the transcription and evaluation services.

### Response `200`

```json
{
  "success": true,
  "data": {
    "interviewId": "interview-uuid",
    "questionId": "question-uuid",
    "answerId": "answer-uuid",
    "submitted": true,
    "isCompleted": false
  }
}
```

`isCompleted` is `true` when this was the final question and the interview
status changed to `COMPLETED`.

### Errors

| Status | Condition                                                                                                      |
| ------ | -------------------------------------------------------------------------------------------------------------- |
| `401`  | Session missing, invalid, expired, or belongs to a different interview                                         |
| `400`  | Invalid storage key, unsupported MIME type, DTO validation failure, or uploaded recording not found in storage |
| `404`  | Interview or question not found (or question belongs to another interview)                                     |
| `409`  | Question not `IN_PROGRESS`, out-of-order submission, or next question not issued                               |
