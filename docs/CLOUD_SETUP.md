# ☁️ CloudGazer: Cloud Credential Setup Guide

This guide provides step-by-step instructions for setting up dedicated, read-only access for CloudGazer in AWS and GCP via the Cloud Consoles.

## 🔐 Security Principle
We use the **Principle of Least Privilege**. CloudGazer only requires **Read-Only** access to view your resource usage and billing data.

---

## 🟠 AWS Setup (IAM Role)

We recommend using an IAM Role for secure, cross-account or same-account access.

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

### 2. Create the IAM Role
1. In the IAM Console, go to **Roles** -> **Create role**.
2. Select **Custom trust policy** as the trusted entity type.
3. Paste the following JSON (Replace `YOUR_ACCOUNT_ID` with the AWS Account ID where CloudGazer is running):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::YOUR_ACCOUNT_ID:root" },
      "Action": "sts:AssumeRole"
    }
  ]
}
```
4. Click **Next**.
5. Search for and select the `CloudGazerAccess` policy you created in Step 1.
6. Click **Next**.
7. **Role name**: `CloudGazerReadOnlyRole`.
8. Click **Create role**.

### 3. Store ARN in AWS SSM
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
Assign the following roles to the service account to grant visibility:
- `Billing Account Viewer` (Required for cost data).
- `Compute Viewer` (Required for resource discovery).
Click **Continue** and then **Done**.

### 3. Generate JSON Key
1. Click on the newly created `cloudgazer-monitor` service account.
2. Go to the **Keys** tab.
3. Click **Add Key** -> **Create new key**.
4. Select **JSON** and click **Create**. 
5. **SAVE THIS FILE SECURELY.** You will need its content for AWS SSM.

### 4. Store JSON in AWS SSM
For centralized management, CloudGazer expects the GCP JSON key to be stored in AWS SSM.
1. Navigate back to [AWS SSM Parameter Store](https://console.aws.amazon.com/systems-manager/parameters) in your primary AWS account.
2. Click **Create parameter**.
3. **Name**: `/cloudgazer/gcp-service-account` (or your preferred path).
4. **Type**: `SecureString`.
5. **Value**: Open the GCP JSON file you downloaded in a text editor, copy all of the contents, and paste it here.
6. Click **Create parameter**.

---

## ✅ Next Steps
Once you have the SSM paths ready, proceed to the **CloudGazer Dashboard** and add these accounts under the **Accounts** menu using the exact SSM paths defined above.
