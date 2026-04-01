# Phase 2 Setup: D1 & Provisioning Dashboard

This document covers the setup for D1 database integration and the provisioning team dashboard.

## Overview

**What's been implemented:**
- D1 database schema for storing transactions
- Stripe webhook handler for capturing completed payments
- Provisioning dashboard for team to manage transactions
- Transaction status and comments tracking

---

## Setup Steps

### 1. Create D1 Database

Create a new D1 database for storing transactions:

```bash
cd /Volumes/SSD1/code/commons/learning/my-app/worker
wrangler d1 create myapp-db
```

This will output something like:
```
✨ Successfully created DB 'myapp-db'
Account ID: xxx
Database ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**Copy the Database ID** and update `worker/wrangler.jsonc`:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "myapp-db",
    "database_id": "YOUR_DB_ID"  // <- Paste your ID here
  }
]
```

### 2. Apply Migrations

Create the transactions table:

```bash
wrangler d1 migrations apply myapp-db
```

This runs the SQL migration in `worker/migrations/0001_create_transactions.sql` which creates:
- `transactions` table with columns: id, userId, email, sessionId, productName, amount, status, comments, createdAt, updatedAt
- Indexes on userId and status for faster queries

### 3. Update Provisioning Team Emails

Edit `worker/src/index.ts` line 7 and add your team's email addresses:

```typescript
const PROVISIONING_TEAM_EMAILS = [
  "your-email@company.com",
  "team-member@company.com",
  // Add more emails as needed
];
```

Only users with these emails can access the provisioning dashboard.

### 4. Set Stripe Webhook Secret

Add your Stripe webhook signing secret as a Cloudflare Worker secret:

```bash
cd /Volumes/SSD1/code/commons/learning/my-app/worker
wrangler secret put STRIPE_WEBHOOK_SECRET
```

You'll be prompted to enter the secret. Get this from:
- Stripe Dashboard → Developers → Webhooks → [Find your endpoint] → Signing secret

### 5. Deploy Worker

Deploy the updated worker code:

```bash
wrangler deploy
```

### 6. Configure Stripe Webhook

Add a webhook endpoint in Stripe to send payment events to your worker:

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/)
2. Navigate to **Developers** → **Webhooks**
3. Click **Add endpoint**
4. Endpoint URL: `https://worker.senew2208.workers.dev/webhook`
5. Events to send:
   - Select **Events from our API** 
   - Search for and select: `checkout.session.completed`
6. Click **Add endpoint**
7. Copy the **Signing secret** (starts with `whsec_`)
8. Run `wrangler secret put STRIPE_WEBHOOK_SECRET` and paste the secret

---

## API Endpoints

### Public Endpoints

#### GET `/checkout-session?session_id={sessionId}`
Verify a Stripe checkout session status.

**Response:**
```json
{
  "status": "complete",
  "payment_status": "paid"
}
```

#### POST `/webhook`
Receives Stripe webhook events. Automatically stores transactions in D1.

**Triggered by:** Stripe when `checkout.session.completed` fires

---

### Authenticated Endpoints (Require Clerk JWT)

#### POST `/`
Create a Stripe checkout session.

**Request:**
```json
{
  "priceId": "price_xxx"
}
```

**Response:**
```json
{
  "url": "https://checkout.stripe.com/pay/..."
}
```

#### GET `/`
Get user info and their transactions.

**Response:**
```json
{
  "message": "Authenticated 🚀",
  "userId": "user_xxx",
  "email": "user@example.com",
  "transactions": [
    {
      "id": "txn_...",
      "email": "user@example.com",
      "productName": "Premium Product",
      "amount": 100,
      "status": "completed",
      "comments": "Processed",
      "createdAt": "2026-04-01T...",
      "updatedAt": "2026-04-01T..."
    }
  ]
}
```

---

### Provisioning Team Endpoints (Require Clerk JWT + Email Allowlist)

#### GET `/provisioning/transactions`
Fetch all transactions in the system.

**Response:**
```json
[
  {
    "id": "txn_...",
    "userId": "user_xxx",
    "email": "customer@example.com",
    "sessionId": "cs_...",
    "productName": "Premium Product",
    "amount": 100,
    "status": "completed",
    "comments": "Sent to provisioning",
    "createdAt": "2026-04-01T...",
    "updatedAt": "2026-04-01T..."
  }
]
```

#### PUT `/provisioning/transactions`
Update a transaction's status and comments.

**Request:**
```json
{
  "id": "txn_...",
  "status": "provisioned",
  "comments": "Account setup complete"
}
```

**Response:**
```json
{
  "success": true
}
```

**Valid statuses:** `completed`, `processing`, `provisioned`, `failed`

---

## Frontend

### Provisioning Dashboard (`/provisioning`)

- **Access:** Only users in `PROVISIONING_TEAM_EMAILS`
- **Features:**
  - View all transactions in a table
  - Click "Edit" to change status and comments
  - Inline editing with Save/Cancel buttons
  - Auto-redirects non-provisioning users to home

### User Transactions (`/`)

Users can see their own transaction history in the API response when clicking "Test Auth".

---

## Testing

### Test Payment Flow

1. Go to `http://localhost:5173/` (or your frontend URL)
2. Sign up/Sign in with Clerk
3. Click the "Subscribe" button on the product card
4. Use Stripe test card: `4242 4242 4242 4242` (any future date, any CVC)
5. Complete checkout
6. You should be redirected to `/success`

### Test Webhook Locally (Optional)

Use Stripe CLI to forward webhooks to your local worker:

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Authenticate
stripe login

# Forward webhooks to your local worker
stripe listen --forward-to localhost:8787/webhook

# In another terminal, trigger a test event
stripe trigger checkout.session.completed
```

### Test Provisioning Dashboard

1. Update `PROVISIONING_TEAM_EMAILS` in `worker/src/index.ts` with your email
2. Go to `http://localhost:5173/provisioning`
3. Sign in with Clerk (use an email in the allowlist)
4. You should see a table of all transactions
5. Click "Edit" to change status and comments, then "Save"

---

## Database Schema

```sql
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  email TEXT NOT NULL,
  sessionId TEXT NOT NULL UNIQUE,
  productName TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  comments TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE INDEX idx_transactions_userId ON transactions(userId);
CREATE INDEX idx_transactions_status ON transactions(status);
```

---

## Environment Variables & Secrets

### Cloudflare Worker Secrets

```bash
# Set via wrangler secret put
STRIPE_SECRET_KEY        # Stripe secret API key
STRIPE_WEBHOOK_SECRET    # Stripe webhook signing secret
CLERK_SECRET_KEY         # Clerk secret key
FRONTEND_URL             # e.g., https://my-app-eha.pages.dev
```

### Frontend Environment Variables (`.env`)

```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

---

## Troubleshooting

### Webhook Not Triggering

1. Verify webhook secret is set correctly: `wrangler secret list`
2. Check Stripe Dashboard → Developers → Webhooks → [Your endpoint] → Logs
3. Ensure endpoint URL matches exactly

### Database Queries Failing

1. Verify database_id is correct in `wrangler.jsonc`
2. Check migrations were applied: `wrangler d1 info myapp-db`
3. Test with: `wrangler d1 execute myapp-db --command "SELECT * FROM transactions"`

### Provisioning Dashboard Not Loading

1. Check your email is in `PROVISIONING_TEAM_EMAILS`
2. Verify Clerk token is valid: Check browser DevTools → Network → Check Authorization header
3. Check worker logs: `wrangler tail`

---

## Next Steps

- [ ] Implement Resend email confirmations (Phase 3)
- [ ] Add transaction export (CSV/PDF)
- [ ] Add filters/search to provisioning dashboard
- [ ] Send notifications to provisioning team via email/Slack on new payments
- [ ] Refactor worker code into separate modules
