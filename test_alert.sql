-- Test Script for Budget Alerts (Slack)
-- Target Account: Muhammad Yogi Indragiri (0619f991-de2d-40a8-8b63-c0be8cb3deb8)

-- 1. Ensure a small budget exists for the account
DELETE FROM budgets WHERE account_id = '0619f991-de2d-40a8-8b63-c0be8cb3deb8';
INSERT INTO budgets (account_id, amount, is_active)
VALUES ('0619f991-de2d-40a8-8b63-c0be8cb3deb8', 10.00, true);

-- 2. Clear recent reports for this account to control the threshold crossing
DELETE FROM cost_reports WHERE account_id = '0619f991-de2d-40a8-8b63-c0be8cb3deb8' AND record_date >= DATE_TRUNC('month', CURRENT_DATE);

-- 3. Insert "Yesterday" report (e.g. $5) - total is $5 (below 100%)
INSERT INTO cost_reports (account_id, amount_usd, record_date, tag_name)
VALUES ('0619f991-de2d-40a8-8b63-c0be8cb3deb8', 5.00, CURRENT_DATE - INTERVAL '1 day', 'Testing');

-- 4. Insert "Today" report (e.g. $10) - total becomes $15 (crosses 100% of $10 budget)
INSERT INTO cost_reports (account_id, amount_usd, record_date, tag_name)
VALUES ('0619f991-de2d-40a8-8b63-c0be8cb3deb8', 10.00, CURRENT_DATE, 'Testing');
