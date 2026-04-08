-- Migration: Cleanup redundant data and fill gaps
-- 1. Remove redundant records where a more specific resource_name exists
-- We keep the one where resource_name is NOT 'unknown' or NOT equal to service_name if a better one exists
DELETE FROM cost_reports a USING cost_reports b
WHERE a.id != b.id
AND a.account_id = b.account_id
AND a.record_date = b.record_date
AND a.service_name = b.service_name
AND a.tag_name = b.tag_name
AND (
    (a.resource_name = 'unknown' AND b.resource_name != 'unknown')
    OR
    (a.resource_name = a.service_name AND b.resource_name != b.service_name)
);

-- 2. Cleanup placeholder GCP data (0.0 cost connectivity tests)
DELETE FROM cost_reports 
WHERE tag_name = 'connectivity-test' 
AND amount_usd = 0;

-- 3. Ensure no records with NULL or empty fields that bypass unique constraints conceptually
DELETE FROM cost_reports 
WHERE service_name IS NULL OR service_name = ''
OR account_id IS NULL;
