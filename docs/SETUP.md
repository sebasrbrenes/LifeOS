# Setup

## 1. Supabase project

Local Supabase (`supabase start`) needs Docker. Without Docker, use a free
hosted project:

1. Create a project at <https://supabase.com/dashboard>. Keep separate
   projects for development and production.
2. **Project Settings → API**: copy the project URL and the `anon` /
   publishable key.
3. **Authentication → URL Configuration**:
   - Site URL: `http://localhost:3000` (production: your Vercel URL).
   - Redirect URLs: add `http://localhost:3000/auth/confirm` (and the
     production equivalent).
4. **Authentication → Providers → Email**: keep email enabled. Email
   confirmation can stay on (recommended); the app handles the link.
5. **Authentication → Policies / Password**: set minimum length to **8**
   (the app enforces 8 too), and enable **leaked password protection**
   (HaveIBeenPwned check) if your plan offers it — it's a paid feature, so
   on the free plan the security advisor warning is expected (ADR-027).

The checked-in `supabase/config.toml` mirrors these settings for local
development with the Supabase CLI.

## 1b. Database schema (migrations)

The Supabase CLI is a dev dependency (`npx supabase …`). One-time setup:

```bash
npx supabase login                       # opens the browser
npx supabase link --project-ref <ref>    # ref = subdomain of the project URL
```

Workflow for a schema change:

```bash
npx supabase migration new <snake_case_name>   # write SQL in the new file
npm run test:db -- --pending   # dry run: apply pending migrations + run DB
                               # tests in a transaction, then roll back
npx supabase db push           # apply for real
npm run test:db                # re-run DB tests on the applied schema
npm run db:types               # regenerate src/lib/supabase/database.types.ts
npx supabase db advisors --linked --type all   # security/performance lint
```

Never edit a migration that has been pushed; add a new one. `test:db` runs
`supabase/tests/*.test.sql` against the **linked** project, always inside a
rolled-back transaction — link a development project, never production.

## 2. Environment variables

```bash
cp .env.example .env.local
```

| Variable                        | Exposed to browser | Purpose                                  |
| ------------------------------- | ------------------ | ---------------------------------------- |
| `NEXT_PUBLIC_APP_URL`           | yes                | Base URL used in auth email links        |
| `NEXT_PUBLIC_SUPABASE_URL`      | yes                | Supabase project URL                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes                | Anon/publishable key — RLS protects data |

Server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, OAuth secrets,
`TOKEN_ENCRYPTION_KEY`) are introduced in the phase that needs them and must
never use the `NEXT_PUBLIC_` prefix. `.env*` files are git-ignored except
`.env.example`.

Validation: `src/lib/env/` validates with Zod. `src/instrumentation.ts` runs
it when the server boots, so a bad config fails fast with the list of
offending keys (values are never printed).

## 3. Auth emails

Sign-up confirmation and password recovery links land on `/auth/confirm`,
which accepts both forms Supabase can send:

- Default templates (`{{ .ConfirmationURL }}`) → PKCE `?code=…`.
- Custom templates → `?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`.

The `next` parameter is sanitized (same-origin paths only).

Supabase's built-in email sender is heavily rate-limited (a few emails per
hour). Configure custom SMTP before real use.

## 4. Run

```bash
npm run dev
```

## End-to-end tests

```bash
npm run test:e2e                              # bundled Chromium
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e    # or a locally installed browser
```

Signed-out flows run against placeholder Supabase values and never touch the
network. Two specs need a real **development** project (values from
`.env.local`):

- `e2e/real-supabase.spec.ts` — real auth round-trips that need no account
  and send no email: `E2E_USE_REAL_SUPABASE=1 npm run test:e2e`.
- `e2e/authenticated.spec.ts` — the signed-in journey. Create a user in the
  Supabase dashboard (Authentication → Users → Add user, "Auto confirm
  user"), then:

```bash
E2E_USE_REAL_SUPABASE=1 E2E_USER_EMAIL=… E2E_USER_PASSWORD=… npm run test:e2e
```

Never use production credentials for tests.

## Test users and integration tests

Signed-in E2E and the RLS integration tests use two dedicated users in the
**development** project (ADR-022), with credentials in `.env.local`:

```bash
E2E_USER_EMAIL=e2e-a@lifeos.test
E2E_USER_PASSWORD=…
E2E_OTHER_USER_EMAIL=e2e-b@lifeos.test
E2E_OTHER_USER_PASSWORD=…
```

```bash
npm run test:integration                                    # RLS via the Data API
E2E_USE_REAL_SUPABASE=1 PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```

Real-data specs run serially and reset user A's metrics, goal and weights.

## Integrations

All optional: without these variables every provider shows "Sin
configurar" and CSV import still works. Put them in `.env.local` (and in
the hosting provider's environment), never in git.

1. **Service-role key** — Supabase → Settings → API → `service_role` →
   `SUPABASE_SERVICE_ROLE_KEY`. Server-only; only the integrations server
   layer may import the client that uses it (enforced by ESLint).
2. **Token encryption key** — `TOKEN_ENCRYPTION_KEY`, 32 random bytes in
   base64 (command in `.env.example`). Losing it means reconnecting every
   integration; changing it invalidates stored tokens.
3. **Strava** — https://www.strava.com/settings/api → create an app.
   _Authorization Callback Domain_: `localhost` for development (your
   domain in production). Copy _Client ID_ and _Client Secret_ into
   `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET`. Scope requested:
   `activity:read_all` (read your activities, including private ones; you
   can untick private access on Strava's consent screen).
4. **Google Calendar** — Google Cloud Console → new project → enable
   _Google Calendar API_ → OAuth consent screen (External, add yourself as
   a test user; scope `.../auth/calendar.events.readonly`) → Credentials →
   _OAuth client ID_ (Web application) with redirect URI
   `http://localhost:3000/integrations/google_calendar/callback` (and the
   production one). Copy into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
5. **Scheduled sync** — `CRON_SECRET` (≥ 32 chars). `vercel.json` runs
   `/api/cron/sync` daily (the Vercel Hobby limit); "Sincronizar ahora"
   covers the rest.

Restart `npm run dev` after changing variables. Then: Integraciones →
Conectar → on each metric, _Origen de los datos_ → choose what feeds it.

## Known limitations

- `npm audit` reports high-severity advisories in `braces`/`fast-glob`
  through dev-only tooling (`eslint-config-next`, the `shadcn` CLI).
  `npm audit --omit=dev` is clean. `npm audit fix --force` would downgrade
  Next — don't.
- If Playwright's browser download times out, use `PLAYWRIGHT_CHANNEL`.
