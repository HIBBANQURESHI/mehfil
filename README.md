# Mehfil

*Every Celebration, Beautifully Planned.*

A wedding marketplace for Pakistan, starting in Karachi. Customers find vendors, compare quotations and book. Vendors manage their business. Admins run the marketplace.

| Part | Path | Stack |
|---|---|---|
| API | `apps/api` | NestJS, Prisma, PostgreSQL |
| Website, customer, vendor and admin dashboards | `apps/web` | Next.js |
| Customer app (Android and iOS) | `apps/mobile` | React Native, Expo |
| Shared money maths, validation, theme, state machines | `packages/shared` | TypeScript |

## Run it locally

No Docker or Postgres install is needed.

```bash
npm install
cp apps/api/.env.example apps/api/.env    # then fill in JWT_SECRET and ENCRYPTION_KEY
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env

npm run dev:db                            # terminal 1: local Postgres using DATABASE_URL (skip if you run your own server)

cd apps/api                               # terminal 2: first run only
npx prisma migrate deploy
npm run db:seed                           # cities and categories
npm run db:seed:demo                      # optional: fake vendors and test accounts
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=choose-a-long-one1 npm run admin:create
cd ../..

npm run dev:api                           # terminal 2
npm run dev:web                           # terminal 3: http://localhost:3000
npm run dev:mobile                        # terminal 4: scan the QR code with Expo Go
```

For a real phone, set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` to your computer's network address, for example `http://192.168.1.20:4000`.

OTP codes print in the API terminal during development. With the demo seed, the password for all accounts is `Mehfil12345`: customer `03000000200`, vendor `03000000100`.

Admin sign-in is at `/admin/login`. Two-factor setup happens the first time.

## Tests

```bash
npm test            # money maths, then API end-to-end against a real Postgres
npm run typecheck
```

## How money works

Amounts are integer paisa and rates are basis points, stored in the database. Nothing in the apps hardcodes a price or commission: vendors enter prices, admins set commission per category, and the server calculates every total.

Going live? Read [docs/LAUNCH.md](docs/LAUNCH.md).
