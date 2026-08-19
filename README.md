# KaamAsaan Admin Dashboard

Separate React, TypeScript, and Vite admin console for the live KaamAsaan Supabase backend.

## Included

- Supabase email/password admin login with `profiles.role = 'admin'` verification.
- Live dashboard counts for users, products, and survey bookings.
- Product CRUD, active-state toggling, validated forms, and `product-images` uploads.
- Brand management, active-state toggling, and `brand-logos` uploads.
- User search, role filtering, and admin role updates.
- Survey booking filtering and status updates.
- Smart-tool result inspection.
- Product compatibility review.

The browser uses the Supabase anon key only. Database RLS remains the enforcement boundary. Never add a Supabase service-role key to this project.

## Environment Setup

1. Copy `.env.example` to `.env`.
2. Open your Supabase project dashboard.
3. Copy **Project URL** and the public **anon** key from **Project Settings → API**.
4. Fill in:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

Restart the development server after editing `.env`.

## Storage Requirement

The dashboard uploads public asset URLs from:

- `product-images`
- `brand-logos`

For V1, configure these buckets as public or add matching Storage RLS policies that let authenticated admins upload assets and let the marketplace read them.

## Run Locally

```bash
npm install
npm run dev
```

Production verification:

```bash
npm run build
npm run preview
```

## Manual Supabase Checks

- Confirm the schema and seed SQL from `../backend-development` are live.
- Confirm your admin Auth user has a matching `public.profiles` record with `role = 'admin'`.
- Confirm `private` is not an API-exposed schema.
- Confirm Storage upload policies allow authenticated admin uploads.

## V1 Scope Notes

- Product deletion is available, but disabling a product is usually preferable for marketplace history.
- Compatibility management is intentionally read-only in V1.
- Installer assignments, orders, payment reconciliation, notification delivery, and audit logs remain future backend phases.
