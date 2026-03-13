-- Add resource_name column
ALTER TABLE cost_reports ADD COLUMN resource_name TEXT DEFAULT 'unknown';

-- Drop old unique constraint (if exists)
ALTER TABLE cost_reports DROP CONSTRAINT IF EXISTS cost_reports_account_id_record_date_service_name_tag_name_key;

-- Add new unique constraint including resource_name
ALTER TABLE cost_reports ADD CONSTRAINT cost_reports_unique_record 
UNIQUE (account_id, record_date, service_name, resource_name, tag_name);
