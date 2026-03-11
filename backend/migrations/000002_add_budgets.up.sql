-- Add Budgets Table
CREATE TABLE budgets (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id   UUID NOT NULL REFERENCES cloud_accounts(id) ON DELETE CASCADE,
    amount       DECIMAL(15, 2) NOT NULL,
    is_active    BOOLEAN DEFAULT true,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add unique constraint to ensure one active budget per account (optional but recommended)
-- CREATE UNIQUE INDEX idx_active_budget_per_account ON budgets (account_id) WHERE is_active = true;
