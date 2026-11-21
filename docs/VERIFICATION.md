# Verification status

Recorded November 21, 2026. This document distinguishes implementation checks from live account onboarding. A passing build or demo does not prove family signup is ready.

## Completed checks

| Layer | Observed result | Scope |
| --- | --- | --- |
| Ledger tests | 16 tests passed | Integer cents, parsing, equal-split remainders, balances, pending/void exclusions, recurring dates, and CSV handling |
| React/provider integration | 11 tests passed | Actual app/provider behavior in a DOM test environment; authentication transport is stubbed |
| Combined automated suite | 27 of 27 passed | Ledger and app/provider tests together |
| Production build | Passed | TypeScript checking and Vite production compilation |
| Dependency audit | Zero reported vulnerabilities | After upgrading Vite to pinned version 6.4.6; this is a point-in-time audit |
| SQL security tests | Passed against the installed live schema | Transactional test fixtures rolled back; zero test fixtures left afterward |
| Desktop browser | Expense creation observed | A $10.01 expense split equally among four people saved correctly; the other three shares total $7.50 |
| Narrow browser / zoom | Published app tested at 340 CSS px and 400% zoom | No horizontal overflow; expense dialog remained within viewport; visible text inputs/selects were at least 16px; an $11.11 expense saved correctly |
| GitHub Pages | Build and deployment succeeded | [Published app](https://bbgaming132.github.io/tabby/); initial workflow run 44912032428 passed build and deploy |

The live security checks include circle isolation, denied anonymous access and direct writes, invitation acceptance/replay restrictions, sender/recipient payment permissions, validated splits, and recurring-post deduplication. The recurring uniqueness rule was corrected and retested. Test transactions were rolled back after verification.

## Installation state

The additive Tabby database schema is installed in the existing free `jarvis-kitchen` Supabase project. Tabby uses separate prefixed tables and dedicated helpers; it shares that project’s authentication service and resource limits. No new paid subscription was purchased.

The GitHub source repository is [BBGaming132/tabby](https://github.com/BBGaming132/tabby). Its Pages workflow runs the tests and production build before deployment. The workflow contains this installation’s public client configuration, with optional repository-variable overrides. Public client configuration does not grant access around database authorization.

Source publication and GitHub Pages deployment were verified. The published app loaded successfully over HTTPS. Anonymous REST requests to Tabby ledger and member tables returned HTTP 401 as intended.

## Remaining live release checks

- Narrow responsive layout and browser zoom were checked in Chromium. Actual iPhone Safari keyboard, safe-area, installation, and device behavior still need a physical-device smoke test.
- Real family signup and email confirmation have not been verified. The current authentication configuration requires confirmed users (`mailer_autoconfirm` is false); do not disable that protection to bypass delivery problems.
- Dashboard inspection confirmed custom SMTP is disabled. A sender must be configured for family confirmation and recovery emails; the default service is restricted to project-team recipients.
- Dashboard inspection confirmed no authentication redirect URLs are configured and the default Site URL is localhost. The exact Tabby URL is prepared in the Add URL dialog but is not saved, pending confirmation of the new authentication destination. Confirmation and recovery links still need an end-to-end check.
- Invite acceptance and payment confirmation need a final smoke test with separate real accounts after email delivery is working.

## Deliberately unavailable

Bank-account linking, automatic transaction import, automatic repayment detection, money transfers, and background email/SMS/push reminders are not implemented. Recurring reminders appear in the app. [Bank connection planning](BANK-CONNECTIONS.md) describes the researched integration and release requirements without representing it as a working feature.

See [email setup](EMAIL-SETUP.md) for the remaining configuration and free sender option.

## Reproduce

```sh
npm ci
npm test
npm run build
npm audit
```

Use Node.js 22.6 or newer. Database security checks require the installed schema and should run transactionally with rollback. Inspect the provided security-test script before running it against a project, and keep unrelated application data out of the test fixtures.
