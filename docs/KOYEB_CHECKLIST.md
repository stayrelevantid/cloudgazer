# 🚀 Koyeb Deployment Checklist

Use this checklist to verify that your CloudGazer backend is properly configured in the Koyeb dashboard.

## 🔑 Required Environment Variables

Ensure these specific variables are set in your **Koyeb Service Settings** under the **Environment Variables** section.

| Variable | Description | Example |
| :--- | :--- | :--- |
| **`DATABASE_URL`** | Postgres connection string | `postgres://user:pass@host:5432/db` |
| **`AWS_ACCESS_KEY_ID`** | Access key for the **Primary Backend User** (Phase 0) | `AKIA...` |
| **`AWS_SECRET_ACCESS_KEY`** | Secret key for the **Primary Backend User** | `wJal...` |
| **`AWS_REGION`** | region where your SSM parameters are stored | `ap-southeast-1` |
| **`CRON_SECRET`** | (Optional) Token for triggering remote syncs | `yoursecret` |
| **`COST_TAG_KEY`** | (Optional) Cloud tag key for grouping | `Project` |
| **`PORT`** | Port the server listens on (Koyeb usually defaults to 8080) | `8080` |

---

## 🔍 Connectivity Diagnostics

Once deployed, you can verify your configuration using these endpoints:

### 1. Health Check
*   **URL**: `https://your-service.koyeb.app/health`
*   **Success**: `{"status":"UP"}`

### 2. SSM Connectivity Test
*   **URL**: `https://your-service.koyeb.app/api/diag/ssm-test`
*   **Optional**: Add `?path=/your/custom/path` to check a specific parameter.
*   **Success Response**:
    ```json
    {
      "status": "success",
      "path": "/cloudgazer/aws-credentials",
      "length": 184
    }
    ```
*   **Error Response (Check Credentials)**:
    ```json
    {
      "status": "error",
      "message": "failed to get parameter from SSM: AccessDeniedException: ..."
    }
    ```

---

## 🛠 Troubleshooting

*   **AccessDeniedException**: Double-check that your `CloudGazerBackendAccess` IAM policy (Phase 0) includes the `ssm:GetParameter` action for the correct resource ARN.
*   **ParameterNotFound**: Verify that you have created the parameter in the **Parameter Store** within the **same AWS Region** specified in your Koyeb environment.
