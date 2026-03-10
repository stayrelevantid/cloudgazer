-- Core Tables
CREATE TABLE users (
    id         VARCHAR(255) PRIMARY KEY,
    email      VARCHAR(255)
);

CREATE TABLE cloud_accounts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       VARCHAR(255) REFERENCES users(id),
    provider      VARCHAR(20),    -- 'aws' | 'gcp'
    account_name  VARCHAR(100),
    aws_ssm_path  TEXT,           -- Path ke SecureString
    is_active     BOOLEAN DEFAULT true
);

CREATE TABLE cost_reports (
    id           SERIAL PRIMARY KEY,
    account_id   UUID REFERENCES cloud_accounts(id),
    amount_usd   DECIMAL(15, 2),
    record_date  DATE,
    tag_name     VARCHAR(50),
    is_anomaly   BOOLEAN DEFAULT false
);

-- Notification & Janitor
CREATE TABLE alert_configs (
    account_id       UUID REFERENCES cloud_accounts(id),
    channel          VARCHAR(20),    -- 'slack' | 'telegram'
    webhook_url      TEXT,
    daily_threshold  DECIMAL(15, 2)
);
