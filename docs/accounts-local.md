# Accounts: testing on your computer

Sign up, log in, forgot password and the admin panel, running on your computer only.
Nothing here is live: the work is on the `feature/accounts` branch, which is not pushed.

## Start it

```bash
cd devtools-hub
git checkout feature/accounts
cp -n .dev.vars.example .dev.vars        # local settings (only the first time)
npm run build
npx wrangler d1 migrations apply devtools24-accounts --local   # creates the local database (only the first time)
npx wrangler dev --port 8788
```

Then open http://localhost:8788.

## Try it

| What | Where |
|---|---|
| Create an account | http://localhost:8788/signup |
| Log in | http://localhost:8788/login |
| Forgot password | http://localhost:8788/forgot-password |
| Your account (details, confirm email, change password, log out) | http://localhost:8788/account |
| Admin panel | http://localhost:8788/admin |

- **Become admin:** sign up with `admin@devtools24.test`. Emails listed in `ADMIN_EMAILS`
  in `.dev.vars` become admins.
- **Emails:** no email service is connected yet, so emails are not sent. Open
  **Admin panel → Emails** to read them and click their links (confirm email, reset password).
- **CAPTCHA:** the pink "testing only" box is Cloudflare's test key, which always passes.
- **Start over:** `npx wrangler d1 execute devtools24-accounts --local --command "DELETE FROM users"`

## Automatic tests

```bash
npm run build
npx playwright test -c playwright.accounts.config.ts
```

## Before going live (not done yet)

1. Create the real D1 database in Cloudflare and put its id in `wrangler.jsonc`.
2. Run the migrations with `--remote`.
3. Add the secrets in Cloudflare: `TURNSTILE_SECRET`, `ADMIN_EMAILS`, `RESEND_API_KEY`, `MAIL_FROM`.
4. Put the real Turnstile site key in `src/app/core/app-config.ts` (`ACCOUNTS.turnstileSiteKey`).
5. Update the Privacy policy and Terms for accounts.
