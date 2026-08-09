Calendar Sync (Google Calendar)

Overview
- Adds ability for students to export upcoming sessions as an .ics file or link their Google Calendar for live event creation.

Setup
1. Configure environment variables (see `.env.example`):
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI` (optional)
   - `CALENDAR_ENCRYPTION_KEY` (must be at least 32 characters)
2. Run the migration to add calendar fields to existing students:

```bash
node scripts/migrate-add-calendar-fields.js
```

3. Start the server:

```bash
npm start
```

How it works
- `GET /api/calendar/ics` returns an .ics file with all upcoming sessions.
- `GET /api/calendar/oauth/google?email=...` begins the Google OAuth flow and on callback stores an encrypted refresh token on the student's record.
- `POST /api/calendar/sync` exchanges the refresh token for an access token and creates events in the user's Google Calendar.
- `POST /api/calendar/disconnect` removes stored tokens for the linked student.

Developer notes
- Refresh tokens are encrypted using AES-256-CBC with the `CALENDAR_ENCRYPTION_KEY`.
- The server uses simple per-student linking via the `email` query param or the `X-Student-Email` header. Ensure the request is performed in a session-authenticated context when used from the client.

Testing
- Run the small unit script for calendar utilities:

```bash
npm test
```

Manual verification checklist
- Download the `.ics` file and import into Google/Apple/Outlook; verify events appear with correct start/end.
- Link Google Calendar via the modal (consent screen). After consenting, use `Sync to Google` to create events and verify they appear in the linked Google Calendar.
- Use `Disconnect` to remove stored token, and confirm re-linking requires consent again.

Security
- Keep `CALENDAR_ENCRYPTION_KEY` secret and rotate if compromised.
- Do not check real client secrets into version control.

*** End of file
