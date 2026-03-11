-- Migration: Add unique constraint to aws_ssm_path
-- 1. Handle existing duplicates for TEST_MOCK_123 by making them unique
UPDATE cloud_accounts 
SET aws_ssm_path = 'TEST_MOCK_' || provider || '_' || id
WHERE aws_ssm_path = 'TEST_MOCK_123';

-- 2. Clean up any other potential duplicates (keep the most recent one)
DELETE FROM cloud_accounts a USING cloud_accounts b
WHERE a.id != b.id
AND a.aws_ssm_path = b.aws_ssm_path
AND a.id > b.id; -- keep smaller uuid for consistency

-- 3. Add the unique constraint
ALTER TABLE cloud_accounts ADD CONSTRAINT unique_aws_ssm_path UNIQUE (aws_ssm_path);
