-- Drop the old transactions table
DROP TABLE IF EXISTS transactions;

-- Create transactions table with updated schema
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,                       -- Stripe PaymentIntent ID (pi_...)
  userId TEXT NOT NULL,
  email TEXT NOT NULL,
  sessionId TEXT NOT NULL UNIQUE,            -- Stripe Checkout Session ID (cs_...)
  productName TEXT NOT NULL,
  amount INTEGER NOT NULL,                   -- store in cents
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending',    -- pending/succeeded/failed
  comments TEXT,
  provisioned BOOLEAN DEFAULT 0,             -- track if provisioning done
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_transactions_userId ON transactions(userId);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_provisioned ON transactions(provisioned);
