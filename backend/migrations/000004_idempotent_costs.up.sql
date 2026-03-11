-- Migration: Add unique constraint to cost_reports for idempotency
-- 1. Clean up potential duplicates before adding the constraint
-- We keep the one with the highest ID (most recent insert usually)
DELETE FROM cost_reports a USING cost_reports b
WHERE a.id < b.id
AND a.account_id = b.account_id
AND a.record_date = b.record_date
AND a.tag_name = b.tag_name;

-- 2. Add the unique index/constraint
ALTER TABLE cost_reports ADD CONSTRAINT unique_cost_report_entry UNIQUE (account_id, record_date, tag_name);
