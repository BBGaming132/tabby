# Tabby

Little tabs. Close people.

A phone-first shared IOU tracker for family, partners, and friends. Keep expenses, recurring estimates, and confirmed repayments together in private circles. Tabby records money owed and repaid; it does not transfer money.

## Features

- Separate circles for family, a couple, or a group of friends.
- People, individual balances, and a shared activity history.
- Expenses with equal or custom shares, vendors, categories, dates, and notes.
- Repayments that stay pending until the recipient confirms receipt.
- Monthly recurring bill forecasts that become debts only after review and posting.
- Expiring, single-use invitations for people added to a circle.
- Authenticated shared accounts backed by Supabase and row-level access controls.
- Search, CSV export, and a fictional browser-local demo.
- Responsive desktop and phone layouts, with accessible controls and no disabled browser zoom.

Read the [user guide](docs/PRODUCT.md) for examples and privacy details. Read [bank connection planning](docs/BANK-CONNECTIONS.md) for the researched Plaid option. Bank import and background notifications are not enabled.

## Run locally

Requires Node.js 22.6 or newer and npm. Node.js 22 is used by the deployment workflow.

```sh
npm ci
cp .env.example .env
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env` for live accounts. These are public client configuration, not a service-role key. Without backend configuration, use the clearly labeled demo.

```sh
npm test
npm run build
```

The production build is written to `dist/`. Keep `package-lock.json` committed so builds use the tested dependency versions.

## Backend

The backend installation script is in [backend/schema.sql](backend/schema.sql). For this installation, the additive Tabby schema is installed in the existing free `jarvis-kitchen` Supabase project. It uses `tabby_` tables and dedicated private helper functions. Existing applications keep their tables; Tabby shares the project’s authentication service and resource allowances. To deploy independently, review and install the schema in your own Supabase project and replace the public build configuration.

Live signup requires Supabase email delivery configured for your family’s addresses. The default Supabase email service is intended for testing and may restrict recipients; configure a supported custom SMTP provider before relying on family self-signup, confirmation, or password recovery. Add the deployed app URL to the allowed authentication redirects. Do not disable confirmation to work around delivery failures.

Only verified, authenticated circle members can read that circle's ledger. Writes go through checked database functions. Circle membership comes from the database, not editable profile metadata. Circle owners manage people and invitations. Invitations claim a specific unclaimed person, expire after seven days, and cannot be replayed. Only a SHA-256 digest of each random invitation secret is stored. Payment confirmation belongs to the recipient. All money values are integer USD cents.

Every circle member can see all data in that circle. Create separate circles for relationships that should remain private from each other. A public frontend repository must contain no actual ledger records, bank credentials, invitation tokens, or service-role keys.

## Publish on GitHub Pages

GitHub Pages hosts the compiled frontend; Supabase handles authentication and private data. The build uses relative asset paths so a repository subpath works.

1. Create a GitHub repository and push the source.
2. In repository settings, choose GitHub Actions as the Pages source.
3. The [Pages workflow](.github/workflows/pages.yml) already includes this installation’s public Supabase URL and publishable key. No repository variables are required for this installation. To use a different backend, optionally override `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` under Settings → Secrets and variables → Actions → Variables. Never use a service-role or secret key.
4. Run the Pages deployment workflow and verify its deployment URL.
5. Configure the deployed URL in Supabase's authentication URL settings for supported confirmation and recovery redirects. Keep redirects limited to URLs you control.
6. Test sign-up, email confirmation, invitation acceptance, password recovery, and payment confirmation with separate real accounts before sharing the app with the family. Email delivery and deployed authentication redirects remain unverified for this installation; do not assume family signup is ready.

GitHub Pages cannot run secret-bearing server endpoints or bank webhooks. Keep those on a separate backend if bank import is added later. This is a personal, noncommercial tracker; review [GitHub Pages usage limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) before changing its scope.

## Free backend choices

Supabase Free allows two active free projects across organizations where you are an owner/admin. If both slots are in use, a third independent project requires a different setup or a paid plan. Reusing a carefully isolated namespace in an existing project can avoid another subscription, while sharing its authentication and resource limits.

Supabase Pro starts at $25/month and includes compute credit for the first Micro project; extra Micro projects start around $10/month each. Three Micro projects are approximately $45/month, not $25 for unlimited projects. Firebase Spark and Neon Free are alternatives, but migrating this implementation requires adapting authentication, storage access, and authorization; changing a URL alone will not switch providers.

- [Supabase pricing](https://supabase.com/pricing)
- [Supabase billing FAQ](https://supabase.com/docs/guides/platform/billing-faq)
- [Firebase pricing](https://firebase.google.com/pricing)
- [Neon pricing](https://neon.com/pricing)

Prices and free allowances should be rechecked before creating resources. No subscription purchase is required to run the local demo.

## Data and operational limits

This release supports USD and whole cents. Recurring reminders are visible in the app when opened; no scheduled email, SMS, or push job runs. CSV is an export, not an automatic backup. Use the database provider's backup/export tools for operational recovery. Free backend projects can have inactivity and quota limits.

Do not treat a successful frontend build as proof that live accounts are configured. See [verification status](docs/VERIFICATION.md) for the tested layers and remaining release checks. Deployment and account verification status are separate from demo and automated test results.
