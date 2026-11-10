# Launch guide

The software is built and tested. These are the things only you can do, because they need accounts, contracts or legal sign-off.

## Must do before real customers

### 1. Payments (the biggest item)

`PAYMENT_PROVIDER=none` is the production default. Checkout then refuses politely instead of pretending to take money.

1. Get written confirmation from a provider (GoPay, Simpaisa, PKPay+, Safepay) that they support your marketplace model: who holds funds, split settlement, vendor KYC, refunds.
2. Have a Pakistani payments lawyer approve the structure.
3. Add an adapter, about one file. Implement `PaymentProvider` from `apps/api/src/payments/providers.ts`:
   - `createCheckout`: create the hosted payment page, return its URL and the provider's reference.
   - `parseWebhook`: **verify the provider's signature** and return the event.
   - `refund`: call their refund API.
4. Add its name to `PAYMENT_PROVIDER` in `apps/api/src/common/config.ts` and to the factory in `apps/api/src/marketplace/marketplace.module.ts`.
5. Test failed, duplicate and late payments in their sandbox before going live.

Everything around the adapter (idempotency, ledger, commission, settlements, refunds) is already built and tested with the sandbox provider.

**Pilot without a gateway:** the customer pays the vendor directly, and an admin records it on the booking with a reference. Commission then shows as owed by the vendor. Do not collect vendor money in an ordinary Mehfil bank account.

Payouts to vendors are currently bank transfers made by staff and marked paid in the admin panel.

### 2. Accounts and services

| Service | Setting | Note |
|---|---|---|
| SMS for OTP | `SMS_HTTP_URL`, `SMS_API_KEY`, `SMS_SENDER`, `SMS_HTTP_SUCCESS_TEXT` | Required. Works with gateways that send by a simple web request. Confirm with the provider that your sender is approved for OTP on all networks. |
| SMS for a small pilot | `SMS_PROVIDER=textbee`, `TEXTBEE_API_KEY` | An Android phone sends codes from its SIM. Use a spare SIM. The free plan allows 50 messages a day and 300 a month, and textbee can see the codes. Not for public launch. |
| Email (Resend) | `RESEND_API_KEY`, `MAIL_FROM` | Required. Verify your domain in Resend first, and send from that domain. |
| Domain and HTTPS | `WEB_URL`, `API_PUBLIC_URL` | Required. Put nginx or Caddy in front of ports 3000 and 4000. |
| Object storage | `STORAGE_DRIVER=s3` | Recommended. With `local`, back up the uploads volume. |
| Expo | `eas init`, `eas build` | Needed for push notifications and store builds. |
| Google Play | Developer account | One-time fee. |
| Apple | Developer membership | Only when you ship iOS. |

### 3. Legal

- Check the **Mehfil** name with IPO Pakistan and the WIPO Global Brand Database. It is a common word, so also check domains and app-store names.
- Register the company with SECP, get an NTN, open a business bank account.
- Have a lawyer review `/terms`, `/privacy` and `/refund-policy`. They are working drafts. Set `LEGAL_NAME` and `SUPPORT_EMAIL`.

### 4. Business setup, in the admin panel

The dashboard has a launch checklist that tracks these.

1. Set commission on every category. Quotations in a category are refused until it has a rate.
2. Create at least one cancellation policy.
3. Create staff roles and invite your team.
4. Onboard and verify your first vendors. Use their real photos, with permission.

## Deploy

```bash
cp .env.production.example .env.production   # fill in every value
docker compose --env-file .env.production up -d --build
docker compose exec api npm run db:seed
docker compose exec -e ADMIN_EMAIL=you@company.com -e ADMIN_PASSWORD=... api npm run admin:create
```

The API refuses to start in production if a setting is unsafe, such as printing OTPs to logs or using sandbox payments.

**Keep `ENCRYPTION_KEY` safe.** Losing it makes stored IBANs and staff 2FA unreadable.

**Back up Postgres daily** and practise restoring. Set up uptime checks on `/v1/health` and error tracking such as Sentry.

The Docker files were written but could not be run on the build machine, because Docker was not running. Try the deploy on a staging server first.

## Release the Android app

```bash
cd apps/mobile
npx eas login && npx eas init
EXPO_PUBLIC_API_URL=https://api.mehfil.example EXPO_PUBLIC_SITE_URL=https://mehfil.example npx eas build -p android --profile production
```

Set the URLs as EAS environment variables so that every build uses them. Test on real Android phones before submitting; automated checks used a browser build of the app and a production Android bundle, not a device. The store listing needs a privacy policy URL and the data-safety form. In-app account deletion, which Google requires, is under Account settings.

## Before the first real booking, test these yourself

- [ ] Real SMS arrives on Jazz, Telenor, Zong and Ufone numbers
- [ ] One full booking with a small amount of real money, then a refund
- [ ] Sign in to admin with 2FA from a second device
- [ ] Restore a database backup

## Not built yet

Planned for later releases in your product plan: coupons and promotions, referrals, vendor subscriptions, WhatsApp alerts, bundled multi-vendor packages, assisted planning, AI recommendations. Messages refresh every few seconds rather than being instant. Rate limits are per server, so add a shared store such as Redis if you run more than one API instance.
