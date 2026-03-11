-- Migration: Change Daily Alert to Weekly Alert
-- 1. Rename column
ALTER TABLE alert_configs RENAME COLUMN daily_threshold TO weekly_threshold;

-- 2. Adjust default values (optional, e.g. multiply existing by 7 if we wanted to preserve rough parity, but let's just keep as is)
-- UPDATE alert_configs SET weekly_threshold = weekly_threshold * 7;
