# Backend

## Google OAuth Setup

1. Copy `.env.example` to `.env` and fill in each value:
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from your Google OAuth client.
   - `GOOGLE_CALLBACK_URL` must match the authorized redirect URI you configured in Google (defaults to `http://localhost:3000/auth/google/callback` for local development).
   - `SESSION_SECRET` should be a long random string to sign session cookies.
   - `ADMIN_WHITELIST` is a comma-separated list of Google account email addresses that should have admin access.
2. Start the server with `npm run dev`. Visiting `/admin.html` will redirect you to Google for sign-in.
3. Only users whose email appears in `ADMIN_WHITELIST` will be able to reach the admin panel or call the `/admin/*` APIs.

Helpful endpoints:

- `/auth/status` returns the current authentication state and user info.
- `/auth/logout` clears the session.
