# DH Click & Collect

Multi-tenant click & collect ordering system by DH Website Services.

## Architecture

- **Customer ordering** → `/order/:slug` — public, no login required
- **Restaurant staff dashboard** → `/dashboard/*` — Supabase email + password login
- **DH Admin panel** → `/admin/*` — Microsoft Entra ID (MSAL), @dhwebsiteservices.co.uk only

## Setup

### 1. Clone and install

```bash
cd /Users/david/dh-clickcollect
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in:

```bash
cp .env.example .env.local
```

Required values:
- `VITE_SUPABASE_URL` — from Supabase project settings
- `VITE_SUPABASE_ANON_KEY` — from Supabase project settings
- `VITE_STRIPE_PUBLISHABLE_KEY` — from Stripe dashboard
- `VITE_WORKER_URL` — your deployed Cloudflare Worker URL
- `VITE_MSAL_CLIENT_ID` — Azure App Registration client ID
- `VITE_MSAL_TENANT_ID` — your Azure tenant ID
- `VITE_MSAL_AUTHORITY` — `https://login.microsoftonline.com/{TENANT_ID}`

### 3. Supabase database

Run `supabase-schema.sql` in Supabase SQL Editor (Project → SQL Editor → New query → paste → Run).

### 4. Create first restaurant staff user

In Supabase dashboard → Authentication → Users → Invite user.
Then in SQL Editor:

```sql
-- After the user signs in once, link them to a restaurant:
INSERT INTO restaurant_users (restaurant_id, user_id, role)
VALUES ('YOUR_RESTAURANT_UUID', 'AUTH_USER_UUID', 'manager');
```

### 5. Microsoft Entra ID (for DH Admin)

1. Azure Portal → App registrations → New registration
2. Name: `DH Click & Collect Admin`
3. Redirect URI: `https://order.dhwebsiteservices.co.uk/admin`
4. Also add `http://localhost:5173/admin` for dev
5. Under Authentication → enable Access tokens and ID tokens
6. Copy Application (client) ID → `VITE_MSAL_CLIENT_ID`
7. Copy Directory (tenant) ID → `VITE_MSAL_TENANT_ID`

### 6. Deploy Cloudflare Worker

```bash
npm install -g wrangler
wrangler login
wrangler deploy

# Set secrets:
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put TWILIO_SID
wrangler secret put TWILIO_TOKEN
wrangler secret put TWILIO_PHONE
wrangler secret put RESEND_API_KEY
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

### 7. Stripe webhook

In Stripe dashboard → Developers → Webhooks → Add endpoint:
- URL: `https://your-worker.workers.dev/webhook`
- Events: `payment_intent.succeeded`
- Copy signing secret → `wrangler secret put STRIPE_WEBHOOK_SECRET`

### 8. Build and deploy

```bash
npm run build
# Cloudflare auto-deploys on push to main
git add . && git commit -m "initial build" && git push
```

### 9. Cloudflare Pages DNS

In Cloudflare dashboard → DNS → Add record:
- Type: CNAME
- Name: `order`
- Target: `your-project.pages.dev`

## Dev

```bash
npm run dev
```

## Key patterns

- All Supabase data calls use raw REST helpers (`sbGet`, `sbInsert`, `sbUpdate`) — no Supabase JS `.select()` due to v2.43 `columns=` bug
- Auth token is set globally via `setSessionToken()` after Supabase Auth login
- RLS enforces tenant isolation — staff only see their own restaurant's data
- Admin uses MSAL (Microsoft) — domain-restricted to @dhwebsiteservices.co.uk
- Realtime orders via Supabase websocket channels in LiveOrders and KitchenView
- `check_slot_capacity` Postgres function prevents overbooking
- `generate_order_number` Postgres function creates readable order refs (e.g. `BUR-1104-001`)

## Adding a new restaurant

1. Log in as DH Admin → Restaurants → Add restaurant
2. Create Stripe Connected account for the restaurant and paste `stripe_account_id`
3. In Supabase Auth → Invite the manager's email
4. After first login, run SQL to link user to restaurant
5. Staff can then log in at `/login` and are taken straight to their dashboard
