-- Updated Test Script for Budget Alerts (Slack)
-- Target Account: Muhammad Yogi Indragiri (0619f991-de2d-40a8-8b63-c0be8cb3deb8)

-- 1. Switch account to MOCK mode to bypass real AWS API calls
UPDATE cloud_accounts 
SET aws_ssm_path = 'TEST_MOCK_123', is_active = true 
WHERE id = '0619f991-de2d-40a8-8b63-c0be8cb3deb8';

-- 2. Ensure a small budget exists ($100)
DELETE FROM budgets WHERE account_id = '0619f991-de2d-40a8-8b63-c0be8cb3deb8';
INSERT INTO budgets (account_id, amount, is_active)
VALUES ('0619f991-de2d-40a8-8b63-c0be8cb3deb8', 100.00, true);

-- 3. Clear reports for this month for this account
DELETE FROM cost_reports WHERE account_id = '0619f991-de2d-40a8-8b63-c0be8cb3deb8' AND record_date >= DATE_TRUNC('month', CURRENT_DATE);

-- 4. Note: The mock fetcher will add ~$150.75 for "yesterday".
-- Total will become $150.75.
-- Yesterday total (relative to fetch) will be 0.
-- Thresholds 50 ($50), 80 ($80), 100 ($100) will all be crossed.
