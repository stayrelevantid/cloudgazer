-- Add unique constraint to ensure one budget per account
-- 1. Remove duplicates if they exist (keep the most recently updated one)
DELETE FROM budgets a USING budgets b
WHERE a.updated_at < b.updated_at
AND a.account_id = b.account_id;

-- 2. Add Unique Constraint
ALTER TABLE budgets ADD CONSTRAINT unique_account_budget UNIQUE (account_id);
