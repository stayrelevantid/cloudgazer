# ☁️ CloudGazer: Cloud Credential Setup Guide

This guide provides step-by-step instructions for setting up dedicated, read-only access for CloudGazer in AWS and GCP.

## 🔐 Security Principle
We use the **Principle of Least Privilege**. CloudGazer only requires the minimum permissions necessary to view your resource usage and billing data.

---

## 🟠 Phase 0: Backend Infrastructure Setup (AWS)

Before adding accounts to the dashboard, the CloudGazer backend (running on Koyeb) needs a **Primary IAM User** with permission to read secrets from your AWS Parameter Store.

### 1. Create a Primary IAM Policy
1. Log in to your **Primary AWS Account** IAM Console.
2. Go to **Policies** -> **Create policy**.
3. Select the **JSON** tab and paste the following policy (restricted to SSM):
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ssm:GetParameter",
                "ssm:GetParameters",
                "ssm:GetParametersByPath"
            ],
            "Resource": "arn:aws:ssm:*:*:parameter/cloudgazer/*"
        }
    ]
}
```
4. Click **Next**, name it `CloudGazerBackendAccess`, and click **Create policy**.

### 2. Create the Primary IAM User
1. In the IAM Console, go to **Users** -> **Create user**.
2. **User name**: `cloudgazer-backend`.
3. Do **not** check the box for AWS Management Console access. Click **Next**.
4. Select **Attach policies directly**.
5. Search for and select the `CloudGazerBackendAccess` policy you created in Step 1.
6. Click **Next** and then **Create user**.

### 3. Set Koyeb Environment Variables
1. Click on the newly created `cloudgazer-backend` user.
2. Go to the **Security credentials** tab.
3. Scroll down to **Access keys** and click **Create access key**.
4. Select **Application running outside AWS** and click **Next**.
5. Click **Create access key**.
6. **IMPORTANT**: Copy the **Access Key ID** and **Secret Access Key**.
7. In your **Koyeb Dashboard**, add these as environment variables:
   - `AWS_ACCESS_KEY_ID`: [Your Access Key ID]
   - `AWS_SECRET_ACCESS_KEY`: [Your Secret Access Key]
   - `AWS_REGION`: [Your AWS Region, e.g., ap-southeast-1]

---

## 🟠 Phase 1: Target Cloud Account Setup (Monitored Account)

This step is for the accounts you want to monitor. You will store their credentials in the Parameter Store.

### 1. Create a Dedicated IAM Policy
Instead of giving full `ReadOnlyAccess`, we will create a dedicated policy explicitly for CloudGazer.
1. Log in to the [AWS IAM Console](https://console.aws.amazon.com/iam/).
2. Navigate to **Policies** from the left menu and click **Create policy**.
3. Select the **JSON** tab and paste the following policy:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ce:GetCostAndUsage",
                "ce:GetDimensionValues",
                "ce:GetCostForecast",
                "ec2:Describe*",
                "organizations:DescribeOrganization",
                "organizations:ListAccounts"
            ],
            "Resource": "*"
        }
    ]
}
```
4. Click **Next**.
5. Name the policy: `CloudGazerAccess` and provide a description.
6. Click **Create policy**.

### 2. Create the IAM User & Attach Policy
1. In the IAM Console, go to **Users** -> **Create user**.
2. **User name**: `cloudgazer-monitor`.
3. Do **not** check the box for AWS Management Console access (programmatic access only). Click **Next**.
4. Select **Attach policies directly**.
5. Search for and select the `CloudGazerAccess` policy you created in Step 1.
6. Click **Next** and then **Create user**.

### 3. Generate Access Keys & Format as JSON
1. Click on the newly created `cloudgazer-monitor`.
2. Go to the **Security credentials** tab.
3. Scroll down to **Access keys** and click **Create access key**.
4. Select **Application running outside AWS** (or Other), and click **Next**.
5. Click **Create access key**.
6. **Do not close this page yet!** Open a local text editor and create a new JSON file following this exact structure, pasting your new keys:
```json
{
  "AccessKeyId": "AKIA...",
  "SecretAccessKey": "..."
}
```
7. Save this temporary file securely. You can now click **Done** in the AWS console.

### 4. Store JSON in AWS SSM
CloudGazer reads this JSON credential from AWS Systems Manager (SSM) Parameter Store.
1. Navigate to [SSM Parameter Store](https://console.aws.amazon.com/systems-manager/parameters).
2. Click **Create parameter**.
3. **Name**: `/cloudgazer/aws-credentials` (or your preferred path).
4. **Tier**: `Standard`.
5. **Type**: `SecureString`.
6. **Value**: Paste the **entire JSON block** you authored in the previous step.
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

### 2. Grant Project-Level Access
In the setup wizard, add this role for resource discovery at the project level:
- **Compute Viewer**
Click **Continue** and then **Done**.

### 3. Grant Billing Access
To view cost data, the service account must be added to your **Billing Account** (not just the project):
1. Navigate to **Billing** -> **Account Management** in the GCP Console.
2. Ensure you are viewing the correct Billing Account.
3. Click **Show Info Panel** on the right side if it is not visible.
4. Click **Add Principal** and paste the email of your new `cloudgazer-monitor` service account.
5. Select the role: **Billing** -> **Billing Account Viewer**.
6. Click **Save**.

### 4. Generate JSON Key
1. Click on the newly created `cloudgazer-monitor` service account.
2. Go to the **Keys** tab.
3. Click **Add Key** -> **Create new key**.
4. Select **JSON** and click **Create**. 
5. **SAVE THIS FILE SECURELY.** You will need its content for AWS SSM.

### 5. Store JSON in AWS SSM
For centralized management, CloudGazer expects the GCP JSON key to be stored in AWS SSM.
1. Navigate back to [AWS SSM Parameter Store](https://console.aws.amazon.com/systems-manager/parameters) in your primary AWS account.
2. Click **Create parameter**.
3. **Name**: `/cloudgazer/gcp-service-account` (or your preferred path).
4. **Type**: `SecureString`.
5. **Value**: Open the GCP JSON file you downloaded in a text editor, copy all of the contents, and paste it here.
6. Click **Create parameter**.

> [!IMPORTANT]
> **Dashboard Integration**: When adding this account in the CloudGazer dashboard, use your **GCP Billing Account ID** (e.g., `012345-6789AB-CDEF01`) as the **Account Name**. This is required for the integration to know which billing account to monitor.

---

## 🔵 GCP Phase 2: BigQuery Billing Export (Optional for Detailed Costs)

To view real, detailed historical cost data (Daily, Service-level, etc.), GCP requires you to export your billing data to **BigQuery**. Without this, CloudGazer can only perform a "Connectivity Test".

### 1. Create a BigQuery Dataset
1. Go to the [BigQuery Console](https://console.cloud.google.com/bigquery).
2. Click the three dots next to your **Project ID** and select **Create dataset**.
3. **Dataset ID**: `billing_export` (or similar).
4. **Location**: Choose a region (e.g., `asia-southeast1`).
5. Click **Create Dataset**.

### 2. Enable Billing Export
1. Go to **Billing** -> **Billing Export** in the GCP Console.
2. Select the **BigQuery Export** tab.
3. Click **Edit Settings** (or **Set Up Export**).
4. **Project**: Select the project where you created the dataset.
5. **Dataset**: Select your `billing_export` dataset.
6. **Export Type**: Select **Standard Usage Cost** (this is usually sufficient and avoids high costs).
7. Click **Save**.

### 3. Grant BigQuery Permissions to Service Account
The `cloudgazer-monitor` service account needs permission to query this dataset:
1. Go to **IAM & Admin** -> **IAM**.
2. Find your `cloudgazer-monitor` service account.
3. Click the **Edit** (pencil) icon.
4. Click **Add Another Role**.
5. Select **BigQuery** -> **BigQuery Data Viewer**.
6. Click **Add Another Role** again.
7. Select **BigQuery** -> **BigQuery Job User**.
8. Click **Save**.

> [!NOTE]
> **Propagation Delay**: After enabling the export, it may take **24-48 hours** for the first data to appear in BigQuery. CloudGazer will start pulling data once the table `gcp_billing_export_v1_...` is populated by GCP.

---

## ✅ Next Steps
Once you have the SSM paths ready, proceed to the **CloudGazer Dashboard** and add these accounts under the **Accounts** menu using the exact SSM paths defined above.
