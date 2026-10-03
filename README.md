# Email Scheduler (Cloudflare Pages + D1 + mail.cloudebase.top)

Browser → Pages Function (`/api/*`) → **mail.cloudebase.top** (your Brevo gateway).  
The project API key exists only as a Cloudflare secret.

Everything below is done in the **GitHub website and Cloudflare dashboard**. No Wrangler or terminal is needed.

## Repository layout

```
public/                    Frontend (static files, build output directory)
functions/api/[[path]].js  Pages Function: routes every /api/* request to the shared code
worker/src/index.js        All backend logic (API + cron job), a single self-contained file
schema.sql                 D1 database tables and default settings
```

Why two deployments? Cloudflare Pages cannot run cron triggers, and scheduled emails need a job every minute. So:

1. **Pages project** = website + API (from GitHub)
2. **Small cron Worker** = runs every minute, sends due emails (code pasted in the dashboard)

Both use the **same D1 database**.

---

## Email gateway used

This project is configured for your **app-transactional** project on mail.cloudebase.top:

| Field | Value |
|---|---|
| Project | `app-transactional` |
| API key | `YOUR_EMAIL_API_KEY` |
| From email | `notifications@cloudebase.top` |
| From name | `Cloudebase App` |
| Endpoint | `https://mail.cloudebase.top` |

You can switch to another project key (e.g. website-contact / noreply@cloudebase.top) by changing the secrets below.

---

## Step 1: Push to GitHub

Upload this whole folder to a new GitHub repository (GitHub web: **Add file → Upload files**, or `git push`).  
Keep the folder structure exactly as above (`public/`, `functions/`, `worker/` at the repository root).

## Step 2: Create the D1 database

1. Cloudflare dashboard → **Storage & Databases → D1 SQL database → Create database**. Name: `email_gateway`.
2. Open the database → **Console** tab.
3. Paste the full contents of `schema.sql` and run it.  
   - If the console rejects the multi-statement paste, run it in pieces (each `CREATE TABLE` / `CREATE INDEX`, then the final `INSERT`).
4. Check the **Tables** tab: you should see 12 tables, and `system_settings` should have 12 rows.

## Step 3: Create the Pages project

1. **Workers & Pages → Create → Pages → Connect to Git** → choose your repository.
2. Build settings:
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: `public`
3. Save and Deploy. (The first deploy will load, but login will not work until Step 4.)

## Step 4: Bindings, variables and secrets (Pages project)

Pages project → **Settings**. Set these for **Production** (and Preview if you use it).

**Bindings → Add → D1 database**

| Variable name | Value |
|---|---|
| `DB` | `email_gateway` |

**Variables and Secrets**

| Name | Type | Value |
|---|---|---|
| `EMAIL_API_KEY` | **Secret** | `YOUR_EMAIL_API_KEY` |
| `SESSION_SECRET` | **Secret** | any long random string (32+ characters) |
| `EMAIL_API_URL` | Text | `https://mail.cloudebase.top` |
| `EMAIL_FROM_EMAIL` | Text | `notifications@cloudebase.top` |
| `EMAIL_FROM_NAME` | Text | `Cloudebase App` |
| `ADMIN_EMAIL` | Text | your email, e.g. `you@example.com` (this address becomes ADMIN when it registers) |
| `DEV_MODE` | Text | `0` |

Then go to **Deployments → Retry deployment** (or push a commit) so the new settings take effect.

## Step 5: Create the cron Worker (sends scheduled emails)

1. **Workers & Pages → Create → Create Worker**. Name: `email-cron`. Click **Deploy** (hello-world code is fine for now).
2. Click **Edit code**, delete everything, paste the full contents of `worker/src/index.js`, then **Deploy**.
3. Worker → **Settings → Bindings → Add → D1 database**: variable `DB` → `email_gateway` (same database).
4. Worker → **Settings → Variables and Secrets** (same values as Step 4):
   - `EMAIL_API_KEY` (Secret), `SESSION_SECRET` (Secret)
   - `EMAIL_API_URL`, `EMAIL_FROM_EMAIL`, `EMAIL_FROM_NAME`
   - plus **`CRON_ONLY` = `1`** (this stops the cron Worker from exposing the API on its own URL)
5. Worker → **Settings → Trigger Events → Cron Triggers → Add** → `* * * * *` (every minute).

> Whenever you change `worker/src/index.js` in GitHub, the Pages project redeploys automatically, but you must **re-paste the file into the `email-cron` Worker** (Edit code → paste → Deploy).

## Step 6: Custom domain

Pages project → **Custom domains → Set up a domain** → e.g. `email.cloudebase.top`.

## Step 7: First login

1. Open the site → **Sign up** with the email you put in `ADMIN_EMAIL`.
2. You receive the OTP by email, then set your name and password. This account is the administrator.
3. Open **More → Settings** to adjust limits (the active-schedule limit starts at 5).

---

## Testing without sending real emails

Set `DEV_MODE` = `1` on the Pages project: OTPs are written to the function logs (Pages → **Deployments → Functions → Real-time logs**) instead of being sent. Set it back to `0` for production.

## Troubleshooting

| Symptom | Check |
|---|---|
| Every API call returns "Something went wrong" | D1 binding named exactly `DB` is added to the Pages project, and `schema.sql` was run |
| Registration says email could not be sent | `EMAIL_API_KEY`, `EMAIL_FROM_EMAIL`; verify the project key is allowed to send from that address |
| Scheduled emails never go out | Cron trigger exists on `email-cron`; Worker has the `DB` binding and email secrets; check its **Logs** |
| "Missing or invalid project API key" | Wrong `EMAIL_API_KEY` or key not passed as `Authorization: Bearer ...` |
| Login works but admin menu missing | Register with the exact email set in `ADMIN_EMAIL` |

## Features

- Email OTP registration & password reset
- Send single emails
- Schedule one-time emails / reminders
- Birthday & anniversary yearly greetings
- Personal contacts, with import from vCard (.vcf) or CSV
- Message templates with `{name}`, `{sender}`, `{year}`, `{email}`
- Configurable per-user limits (admin)
- Contact search, multi-select and bulk email (campaigns) for every user; type-ahead and a contact picker on email fields
- Audit-friendly email history
- PWA-ready frontend
