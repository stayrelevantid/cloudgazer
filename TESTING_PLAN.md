---

## ⚙️ Phase 0: Backend Infrastructure Setup (AWS)
Before monitoring any accounts, the CloudGazer backend itself must be configured with access to the AWS Parameter Store.

- [ ] **Create Primary IAM User**: Create a `cloudgazer-backend` user with restricted SSM access in your primary AWS account.
- [ ] **Configure Koyeb**: Add the Access Keys and Region as environment variables in the Koyeb dashboard.
- [ ] **Verify Connection**: Ensure the backend logs "Successfully initialized AWS SSM Client" on startup.

---

## 🔑 Phase 1: Database Cleanup
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

### AWS (Dedicated IAM User)
- [ ] Create IAM Policy (`CloudGazerAccess`) with required permissions.
- [ ] Create IAM User (`cloudgazer-monitor`) and attach the policy.
- [ ] Generate Programmatic Access Keys and structure them as a JSON object.
- [ ] Save the JSON block in AWS SSM Parameter Store as `SecureString` (e.g., `/cloudgazer/aws-credentials`).

### GCP (Dedicated Service Account)
- [ ] Create Service Account (`cloudgazer-monitor`) with `Billing Viewer` & `Compute Viewer`.
- [ ] Generate JSON Key and download the file.
- [ ] Save JSON string in AWS SSM Parameter Store as `SecureString` (e.g., `/cloudgazer/gcp-service-account`).

---

## ⚙️ Phase 3: Application Integration
Add the real accounts via the CloudGazer dashboard.

- [x] Navigate to **Accounts** page.
- [x] **Add Account**: Use the exact SSM Path from Phase 2.
- [x] Verify status is **Active**.

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
