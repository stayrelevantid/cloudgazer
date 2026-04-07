# ☁️ CloudGazer: Cloud Credential Setup Guide

This guide provides step-by-step instructions for setting up dedicated, read-only access for CloudGazer in AWS and GCP.

## 🔐 Security Principle
We use the **Principle of Least Privilege**. CloudGazer only requires **Read-Only** access to view your resource usage and billing data.

---

## 🟠 AWS Setup (IAM Role)

We recommend using an IAM Role for secure, cross-account or same-account access.

### 1. Create a New IAM Role
1. Log in to the [AWS IAM Console](https://console.aws.amazon.com/iam/).
2. Click **Roles** -> **Create role**.
3. Select **AWS account** as the trusted entity type.
4. Choose **This account** (or specify another Account ID if CloudGazer is running elsewhere).
5. Click **Next**.

### 2. Attach Permissions
1. Search for and check the box for `ReadOnlyAccess`.
2. Click **Next**.

### 3. Name and Create
1. **Role name**: `CloudGazerReadOnlyRole`.
2. **Description**: `Dedicated read-only access for CloudGazer monitoring.`
3. Click **Create role**.

### 4. Store ARN in AWS SSM
CloudGazer reads the Role ARN from AWS Systems Manager (SSM) Parameter Store.
1. Navigate to [SSM Parameter Store](https://console.aws.amazon.com/systems-manager/parameters).
2. Click **Create parameter**.
3. **Name**: `/cloudgazer/aws-role-arn` (or your preferred path).
4. **Tier**: `Standard`.
5. **Type**: `SecureString`.
6. **Value**: Paste the **ARN** of the role you just created (e.g., `arn:aws:iam::123456789012:role/CloudGazerReadOnlyRole`).
7. Click **Create parameter**.

---

## 🔵 GCP Setup (Service Account)

GCP access is managed through a dedicated Service Account.

### 1. Create a New Service Account
1. Log in to the [GCP Console](https://console.cloud.google.com/).
2. Select your project.
3. Navigate to **IAM & Admin** -> **Service Accounts**.
4. Click **Create Service Account**.
5. **Name**: `cloudgazer-monitor`.
6. Click **Create and Continue**.

### 2. Grant Access
Assign the following roles to the service account:
- `Billing Account Viewer` (Required for cost data).
- `Compute Viewer` (Required for resource discovery).
- `Monitoring Viewer` (Optional).
Click **Continue** and then **Done**.

### 3. Generate JSON Key
1. Click on the newly created service account.
2. Go to the **Keys** tab.
3. Click **Add Key** -> **Create new key**.
4. Select **JSON** and click **Create**. 
5. **SAVE THIS FILE SECURELY.** You will need its content.

### 4. Store JSON in AWS SSM
For multi-cloud management, CloudGazer stores the GCP JSON key in AWS SSM.
1. Navigate back to [AWS SSM Parameter Store](https://console.aws.amazon.com/systems-manager/parameters).
2. Click **Create parameter**.
3. **Name**: `/cloudgazer/gcp-service-account` (or your preferred path).
4. **Type**: `SecureString`.
5. **Value**: Paste the **entire content** of the JSON key file you downloaded.
6. Click **Create parameter**.

---

## ✅ Next Steps
Once you have the SSM paths, proceed to the **CloudGazer Dashboard** and add these accounts under the **Accounts** menu using the exact SSM paths defined above.
