-- Migration to separate service_name and tag_name
ALTER TABLE cost_reports ADD COLUMN service_name VARCHAR(100);

-- Update legacy data: service_name = tag_name, tag_name = 'untagged'
UPDATE cost_reports SET service_name = tag_name, tag_name = 'untagged' WHERE service_name IS NULL;

-- Update constraints
ALTER TABLE cost_reports ALTER COLUMN service_name SET NOT NULL;
ALTER TABLE cost_reports DROP CONSTRAINT IF EXISTS cost_reports_account_id_record_date_tag_name_key;
ALTER TABLE cost_reports ADD CONSTRAINT cost_reports_unique_record UNIQUE (account_id, record_date, service_name, tag_name);
