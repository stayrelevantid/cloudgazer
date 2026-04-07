# 🧪 CloudGazer Real-World Testing Plan

This document serves as a checklist and guide for transitioning from development/mock data to real-world cloud monitoring.

## 🏁 Phase 1: Database Cleanup
Clean up all dummy/mock data before adding real accounts.

- [ ] **Stop Backend Server**: Ensure no active processes are writing to the DB.
- [ ] **Delete Mock Accounts**:
    ```sql
    DELETE FROM cloud_accounts WHERE aws_ssm_path LIKE 'TEST_MOCK_%';
    ```
- [ ] **Clean Orphaned Reports**:
    ```sql
    DELETE FROM cost_reports WHERE account_id NOT IN (SELECT id FROM cloud_accounts);
    ```
- [ ] **Reset Alert Configs**:
    ```sql
    DELETE FROM alert_configs WHERE account_id NOT IN (SELECT id FROM cloud_accounts);
    ```

---

## 🔑 Phase 2: Cloud Credential Setup
Prepare your cloud providers for read-only access. Follow the [Manual Setup Guide](file:///Users/muhammad.indragiri/Kerja/cloudgazer/docs/CLOUD_SETUP.md) for detailed steps.

### AWS (Cross-Account Role)
- [ ] Create IAM Role with `ReadOnlyAccess` in the target account.
- [ ] Configure Trust Policy to allow assume-role from CloudGazer.
- [ ] Save Role ARN in AWS SSM Parameter Store as `SecureString`.

### GCP (Service Account)
- [ ] Create Service Account with `Billing Account Viewer` & `Compute Viewer`.
- [ ] Generate JSON Key.
- [ ] Save JSON string in AWS SSM Parameter Store as `SecureString`.

---

## ⚙️ Phase 3: Application Integration
Add the real accounts via the CloudGazer dashboard.

- [ ] Navigate to **Accounts** page.
- [ ] **Add Account**: Use the exact SSM Path from Phase 2.
- [ ] Verify status is **Active**.

---

## 📊 Phase 4: Data Synchronization
Fetch historical and current data.

- [ ] **Historical Sync**: Click **Migrate** in the Accounts table (Select 6-12 months).
- [ ] **Daily Fetch**: Trigger manual fetch to test connectivity:
    ```bash
    curl -X POST http://localhost:8080/api/cron/fetch -H "Authorization: Bearer <CRON_SECRET>"
    ```

---

## ✅ Phase 5: Functional Verification
Validate core features with real data.

- [ ] **Dashboard**: Verify **Service Breakdown** shows real cloud services.
- [ ] **Dashboard**: Verify **Resource Breakdown** shows real resource IDs.
- [ ] **Comparison**: Check **MoM Analysis** accuracy.
- [ ] **Janitor**: Verify unattached resources appear and "Manage in Console" links work.
- [ ] **Alerting**: Test **Threshold Alerts** by setting a low limit and triggering a fetch.
- [ ] **Budgets**: Verify the monthly budget progress bar.

---

## 🚀 Phase 6: Production Readiness
- [ ] **Export**: Ensure CSV export contains accurate real resource data.
- [ ] **Tags**: Test cost grouping by actual cloud tags (Project, Environment).
- [ ] **Stability**: Monitor backend logs for any errors or performance bottlenecks.
