# Finish family account onboarding

The app is published at https://bbgaming132.github.io/tabby/. The database schema and private-circle authorization are installed. Family account creation is not release-verified yet.

Tabby opens to sign-in for live accounts. The demo is available from the sign-in page.

## Login callback

The exact URL `https://bbgaming132.github.io/tabby/` is saved under Authentication → URL Configuration → Redirect URLs in the shared Supabase project.

Gmail SMTP is enabled, but a live signup test returned an email delivery error. Supabase logged an SMTP 535 authentication rejection. Replace the credential with a fresh Google App Password from the account used as the SMTP username before retesting signup.

## Free sender option

For a tiny family app, a dedicated personal Gmail account can send through Supabase Custom SMTP without a domain purchase or another subscription. This is a compatibility recommendation, not a tested delivery result. Gmail must have 2-Step Verification, and App Passwords must be available for that account.

| Field | Value |
| --- | --- |
| SMTP host | `smtp.gmail.com` |
| SMTP port | `465` for implicit TLS, or `587` for STARTTLS |
| Username | Chosen Gmail sender address |
| Password | Google App Password, entered directly in Supabase |
| From address | Same Gmail sender address |
| From name | Tabby |

Create the App Password directly in Google Account settings and enter it directly into the Supabase dashboard. It must not be placed in chat, this repository, frontend variables, or GitHub Actions. A dedicated sender account limits the scope of that credential. Some account security or organization policies do not permit App Passwords.

If a verified domain and transactional email provider already exist, that provider can be used instead. Provider signup, domain verification, or a new credential remains a separate user setup decision; none has been created or purchased.

## Final release check

1. Save the approved exact redirect and configure the chosen sender securely.
2. Create a real account in Tabby and confirm its email.
3. Test sign-in and password reset returning to the published app.
4. Create a private circle and invite a second account to a specific person.
5. Record an expense and a pending payment; confirm receipt from the recipient's account.
6. Check that a separate circle remains private from the invited account.
7. Set the optional repository Actions variable `VITE_ONBOARDING_READY` to `true` only after onboarding works. Trigger the Pages workflow to remove the setup notice.

Existing app accounts share the Supabase project's authentication service. Use the same verified credentials when appropriate; circle membership remains independent and enforced by Tabby's database rules.

Official references:

- https://supabase.com/docs/guides/auth/auth-smtp
- https://developers.google.com/workspace/gmail/imap/imap-smtp
- https://support.google.com/mail/answer/185833
