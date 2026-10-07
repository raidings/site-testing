# American Air Flow — Vercel deployment

Repository target: https://github.com/raidings/site-testing

## Required Vercel environment variables

- `RESEND_API_KEY`
- `CONTACT_TO_EMAIL=contact@american-airflow.com`
- `CONTACT_FROM_EMAIL=American Air Flow Website <website@american-airflow.com>`

Set all three for Production and Preview.

## Local test

Install Vercel CLI and run:

```bash
npm i -g vercel@latest
vercel dev
```

For local email testing, create `.env.local` with the variables above. Never commit it.

## Production

Import the GitHub repo into Vercel and leave Framework Preset as `Other`. No build command is required. Root directory is `./`.
