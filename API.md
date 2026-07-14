# API.md - Spurti REST API Documentation

## Table of Contents
1. [Authentication Mechanism](#1-authentication-mechanism)
2. [Public & Student Endpoints](#2-public--student-endpoints)
   - [2.1 GET /api/config](#21-get-apiconfig)
   - [2.2 GET /api/me](#22-get-apime)
   - [2.3 GET /api/leaderboard](#23-get-apileaderboard)
   - [2.4 GET /api/search](#24-get-apisearch)
   - [2.5 POST /api/confirm](#25-post-apiconfirm)
   - [2.6 POST /api/ping](#26-post-apiping)
3. [Survey Triangulation Endpoints](#3-survey-triangulation-endpoints)
   - [3.1 GET /api/survey/status](#31-get-apisurveystatus)
   - [3.2 POST /api/survey/webhook](#32-post-apisurveywebhook)
4. [Admin Endpoints](#4-admin-endpoints)
   - [4.1 GET /api/admin/stats](#41-get-apiadminstats)
   - [4.2 GET /api/admin/students-by-status](#42-get-apiadminstudents-by-status)
   - [4.3 GET /api/admin/attendance](#43-get-apiadminattendance)
   - [4.4 GET /api/admin/analytics](#44-get-apiadminanalytics)

---

## 1. Authentication Mechanism

Spurti implements a secure, **cookie-based authentication passthrough** using Samagama's internal user directory. 

```
┌──────────┐          GET /api/me          ┌──────────┐
│  Client  ├──────────────────────────────>│  Spurti  │
│  Browser │                               │  Server  │
└────▲─────┘                               └────┬─────┘
     │                                          │ Cookie Forwarding
     │               JSON User profile          │ (chatengine_token)
     │            (200 OK or 401 Unauth)        ▼
     └─────────────────────────────────────┌──────────┐
                                           │ Samagama │
                                           │  Server  │
                                           └──────────┘
```

1. The client browser accesses `/spurti` and sends API requests to `/api/me`.
2. The browser automatically appends the `chatengine_token` cookie (if logged into Samagama).
3. The Express server extracts the `chatengine_token` cookie and sends a request to Samagama's authentication endpoint (`SAMAGAMA_AUTH_URL` or `http://127.0.0.1:5001/api/auth/me`).
4. If Samagama returns `200 OK` with the user profile, Spurti matches the `email` or `alternateEmail` against its `Student` collection and authorizes access.
5. If Samagama returns a `401 Unauthorized` or fails to connect, Spurti returns `{ authenticated: false }` to the client.

---

## 2. Public & Student Endpoints

### 2.1 GET /api/config
Fetches active portal configurations and survey metadata.

- **Request**: `GET /api/config`
- **Response**: `200 OK`
```json
{
  "allowStudentSearch": true,
  "survey": {
    "enabled": true,
    "formUrl": "https://docs.google.com/forms/d/e/1FAIpQLS.../viewform",
    "emailEntryId": "entry.1234567890",
    "enforcement": "hard",
    "deadline": "2026-07-15T23:59:59+05:30"
  },
  "poll2": {
    "enabled": false,
    "formUrl": "",
    "emailEntryId": "",
    "enforcement": "soft",
    "deadline": ""
  }
}
```

---

### 2.2 GET /api/me
Fetches the profile, transactions, attendance ledger, and group leaderboard of the logged-in student.

- **Headers**: Requires a valid `Cookie: chatengine_token=<token_value>`
- **Request**: `GET /api/me`
- **Response (Success)**: `200 OK`
```json
{
  "authenticated": true,
  "profile": {
    "student": {
      "_id": "603d7c5fbb4e2d4e78a6de30",
      "name": "Lakshya Aran",
      "email": "lakshya.aran@example.com",
      "alternateEmail": "lakshya.alt@example.com",
      "internshipStartDate": "2026-05-15T00:00:00.000Z",
      "status": "active",
      "totalSp": 790,
      "rank": 1,
      "cohortSize": 3062,
      "highestSpEver": 790,
      "level": 7,
      "trophyLeague": "Gold II",
      "legendBadgeUnlocked": false,
      "leaderboardGroup": "2026-05-01_to_2026-05-15",
      "leaderboardGroupLabel": "2026-05-01 to 2026-05-15",
      "surveyCompleted": true,
      "poll2Completed": false
    },
    "transactions": [
      {
        "_id": "603d7c5fbb4e2d4e78a6de31",
        "email": "lakshya.aran@example.com",
        "category": "initial",
        "sessionLabel": "",
        "deltaValue": 100,
        "appliedDelta": 100,
        "balanceAfter": 100,
        "reason": "Initial base credits applied",
        "dateTime": "2026-05-15T09:00:00.000Z"
      },
      {
        "_id": "603d7c5fbb4e2d4e78a6de32",
        "email": "lakshya.aran@example.com",
        "category": "attendance",
        "sessionLabel": "Day 1 (15 May)",
        "deltaValue": 10,
        "appliedDelta": 10,
        "balanceAfter": 110,
        "reason": "Attended 100% of session - earned +10 SP",
        "dateTime": "2026-05-15T09:05:00.000Z"
      }
    ],
    "polls": [],
    "attendance": [],
    "cohort": {
      "averageSp": 652,
      "top10Cutoff": 769,
      "top50Cutoff": 743,
      "pointsToTop50": 0,
      "pointsToNextRank": 0
    },
    "leaderboard": [],
    "groupLeaderboard": []
  }
}
```

---

### 2.3 GET /api/leaderboard
Returns the leaderboard ranked by SP points in descending order.

- **Query Parameters**:
  - `leaderboardType`: `overall` or `my_onboarding_group`
  - `group`: e.g. `2026-05-16_to_2026-05-31`
- **Request**: `GET /api/leaderboard?leaderboardType=my_onboarding_group&group=2026-05-16_to_2026-05-31`
- **Response**: `200 OK`
```json
[
  {
    "rank": 1,
    "name": "Lakshya Aran",
    "maskedEmail": "la****an@example.com",
    "totalSp": 790,
    "level": 7,
    "trophyLeague": "Gold II"
  }
]
```

---

### 2.4 GET /api/search
Searches students by name or email. Returns masked emails for privacy.

- **Query Parameters**:
  - `q`: Search term (minimum 2 characters)
- **Request**: `GET /api/search?q=Lakshya`
- **Response (Partial Matches)**: `200 OK`
```json
{
  "exact": false,
  "matches": [
    {
      "_id": "603d7c5fbb4e2d4e78a6de30",
      "name": "Lakshya Aran",
      "maskedEmail": "la****an@example.com",
      "maskedAlternateEmail": "",
      "status": "active",
      "totalSp": 790
    }
  ]
}
```

---

### 2.5 POST /api/confirm
Verifies identity during search by checking if the student knows their registered full email.

- **Request**: `POST /api/confirm`
```json
{
  "studentId": "603d7c5fbb4e2d4e78a6de30",
  "email": "lakshya.aran@example.com"
}
```
- **Response (Success)**: `200 OK` (returns full `studentPayload`)
- **Response (Failure)**: `403 Forbidden`
```json
{ "error": "Email did not match this record" }
```

---

### 2.6 POST /api/ping
Telemetry heartbeat endpoint. Records user activity and populates the active user map.

- **Request**: `POST /api/ping`
```json
{
  "email": "student@example.com",
  "name": "Student Name",
  "page": "record"
}
```
- **Response**: `200 OK`
```json
{ "ok": true }
```

---

### 2.7 POST /api/goals
Saves or updates the student's learning goal commitment and self-reflection strategy for the current calendar week.

- **Headers**: Requires a valid `Cookie: chatengine_token=<token_value>`
- **Request**: `POST /api/goals`
```json
{
  "targetLeague": "Gold I",
  "focusArea": "both",
  "reflection": "I will attend all sessions and actively solve polls to avoid debits."
}
```
- **Response (Success)**: `200 OK` (returns the updated student profile)
```json
{
  "success": true,
  "profile": {
    "student": {
      "_id": "603d7c5fbb4e2d4e78a6de30",
      "name": "Lakshya Aran",
      "email": "lakshya.aran@example.com",
      "weeklyGoals": [
        {
          "weekLabel": "2026-W27",
          "targetLeague": "Gold I",
          "focusArea": "both",
          "reflection": "I will attend all sessions and actively solve polls to avoid debits.",
          "createdAt": "2026-07-05T14:00:00.000Z"
        }
      ]
    }
  }
}
```

---

## 3. Survey Triangulation Endpoints

### 3.1 GET /api/survey/status
Checks if the current logged-in student has submitted the mandatory survey pop-up.

- **Request**: `GET /api/survey/status`
- **Response**: `200 OK`
```json
{ "completed": true }
```

---

### 3.2 POST /api/survey/webhook
Authenticates form responses forwarded by Google Forms Apps Script.

- **Request**: `POST /api/survey/webhook`
```json
{
  "secret": "your_webhook_shared_secret",
  "email": "student@example.com"
}
```
- **Response**: `200 OK`
```json
{
  "ok": true,
  "email": "student@example.com"
}
```

---

## 4. Admin Endpoints

All admin endpoints require headers `X-Admin-Email` and `X-Admin-Token` to match environment variables.

### 4.1 GET /api/admin/stats
Fetches count aggregates for dashboard display.

- **Request**: `GET /api/admin/stats`
- **Response**: `200 OK`
```json
{
  "yetToOnboard": 12,
  "activeStudents": 3062,
  "excusedStudents": 570,
  "sessions": [],
  "transactions": 50700
}
```

---

### 4.2 GET /api/admin/students-by-status
Retrieves a list of students filtered by lifecycle state.

- **Query Parameters**:
  - `status`: `yet to onboard`, `active`, or `excused`
  - `limit`: max results count (default 200)
- **Request**: `GET /api/admin/students-by-status?status=excused`
- **Response**: `200 OK`
```json
[
  {
    "_id": "603d7c5fbb4e2d4e78a6de99",
    "name": "Excused Learner",
    "email": "excused@example.com",
    "totalSp": 100,
    "internshipStartDate": "2026-05-15T00:00:00.000Z"
  }
]
```

---

### 4.3 GET /api/admin/attendance
Generates the tabular attendance matrix mapping students to their attended minutes across all sessions.

- **Request**: `GET /api/admin/attendance`
- **Response**: `200 OK`
```json
{
  "sessions": [
    { "label": "Day 1 (15 May)", "totalMinutes": 120 }
  ],
  "students": [
    {
      "_id": "603d7c5fbb4e2d4e78a6de30",
      "name": "Lakshya Aran",
      "email": "lakshya.aran@example.com",
      "totalSp": 790,
      "cells": {
        "Day 1 (15 May)": {
          "minutes": 115,
          "totalMinutes": 120,
          "qualified": true,
          "percentage": 95.8
        }
      }
    }
  ]
}
```

---

### 4.4 GET /api/admin/analytics
Compiles metrics and telemetry trends. Used to generate the admin control graphs:

- **Active now**: Count of pings in the last 60 seconds (`liveViewers` in-memory map).
- **Unique Users Today / Weekly / Monthly**: Queries `SessionEvent` collections filtered by time buckets.
- **Admin Alerts**: Aggregates debits to list students falling behind.
  - *Low SP*: Count of students with `totalSp < 100`.
  - *Inactive today*: Users without a page event recorded today.
  - *Top Drops*: Aggregates the sum of negative transaction deltas to identify the 10 students who lost the most SP this week.
- **Attendance Quality**: Compiles the percentage of positive (`qualified: true`) records in `AttendanceRecord`.
- **SP Distribution (Bands)**: Counts students whose current `totalSp` falls into brackets: `<100`, `100–149`, `150–199`, and `200+`.
- **SP by Category**: Sums deltas grouped by `category` (`initial`, `attendance`, `poll`, `manual`).
- **Attendance by Session**: Lists per-session metrics (`qualified`, `notQualified`, `avgMinutes`).
- **Request**: `GET /api/admin/analytics`
- **Response**: `200 OK` (returns analytics details payload)
