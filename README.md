# ☁️ CloudGazer (v1.1.1)

**CloudGazer** is a self-hosted multi-cloud cost monitoring platform designed to help you track daily spend across AWS and GCP while maintaining **Rp 0 operating costs** using free-tier infrastructure.

---

## 🚀 Key Features

### 📊 Dashboard & Monitoring
- **Multi-Cloud Overview**: Visualize combined AWS and GCP costs in a unified area chart.
- **Granular Filtering**: Filter dashboard data by specific cloud accounts or providers (AWS/GCP).
- **DataTable Analytics**: Interractive tables for "Top Resources" and "Historical Trend" with Search, Pagination, and Page Size controls.
- **Advanced Reports**: Supports calendar-aligned timeframes (Today, This Week, This Month, This Year, Last Year, 2 Years Ago).
- **Daily Fetcher**: Automated synchronization of cost data at `00:00 UTC` for maximum efficiency.
- **Currency Toggle**: Easily switch between USD and IDR display.

### 🛡️ Security & Management
- **Dynamic Account Integration**: Add/remove AWS accounts (via Role ARN) and GCP accounts (via Service Account JSON) dynamically.
- **Secret Management**: All sensitive credentials are stored securely in **AWS SSM Parameter Store** (`SecureString`).
- **Authentication**: Secure login powered by **Clerk**. All dashboard routes (`/`, `/accounts`, etc.) are protected and require a signed-in session.

### ⚠️ Alerting & Janitor
- **Weekly Threshold Alerts**: Receive Slack/Telegram notifications when weekly spend exceeds your defined limit.
- **Budget Planning**: Set monthly budgets per account with visual progress tracking.
- **Cost Forecasting**: Predictive spend analysis based on historical trends (linear regression).
- **Anomaly Detection**: Automatic alerts if today's cost surges **>20%** compared to the 7-day average.
- **Janitor (Idle Resources)**: Identify and clean up unattached EBS volumes and unassociated Elastic IPs (AWS).
- **Integration Tester**: "Test Connection" button to validate webhook configurations instantly.

---

## 🛠️ Technical Stack

| Layer | Technology | Provider |
| :--- | :--- | :--- |
| **Frontend** | Next.js 15, Tailwind CSS, shadcn/ui | Vercel |
| **Backend** | Go (Golang) 1.22+ | Koyeb / Render |
| **Database** | PostgreSQL | Neon.tech |
| **Secrets** | AWS SSM Parameter Store | AWS (Standard Tier) |
| **Auth** | Clerk | Clerk (Free Tier) |
| **CI/CD / Cron** | GitHub Actions | GitHub |

---

## ⚙️ Getting Started

### 1. Prerequisites
- **AWS Account**: To store secrets in SSM and monitor AWS costs.
- **GCP Project**: (Optional) For GCP cost monitoring.
- **Neon.tech**: Free PostgreSQL database.
- **Clerk**: To handle user authentication.
- **Koyeb & Vercel**: For hosting the backend and frontend.

### 2. Environment Variables

#### Backend (`.env`)
```env
PORT=8080
DATABASE_URL=postgres://...
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
CRON_SECRET=your_random_secret
```

#### Frontend (`.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
```

### 3. Database Setup
Run the SQL located in `backend/migrations/` to initialize your database schema (Users, Cloud Accounts, Cost Reports, Alert Configs).

---

## 🤖 CI/CD & Automation

CloudGazer uses **GitHub Actions** for:
1. **Daily Cron**: Triggers the `/api/cron/fetch` endpoint every day at midnight.
2. **Auto-Deploy**: Automatically deploys changes to Koyeb (Backend) and Vercel (Frontend) on every push to `main`.

> [!NOTE]
> Ensure you have configured the required **GitHub Secrets** (`API_URL`, `KOYEB_TOKEN`, `VERCEL_TOKEN`, `CRON_SECRET`) in your repository settings.
> The Koyeb deployment requires the full service identifier: `koyeb service redeploy cloudgazer/cloudgazer`.
> 
> [!IMPORTANT]
> For Vercel deployments, ensure `frontend/vercel.json` does **not** contain the `rootDirectory` property, as this is managed via the Vercel dashboard.

---

## 📈 Roadmap
- [x] **Phase 1**: Foundation (Database, Storage, Auth)
- [x] **Phase 2**: Fetcher Logic (AWS/GCP Cost APIs)
- [x] **Phase 3**: Frontend UI (Charts, Account Management)
- [x] **Phase 4**: Alerting & Janitor (Anomalies, Idle Resources)
- [x] **Phase 5**: CI/CD (GitHub Actions)
- [x] **v1.1.1**: Analytics filtering, DataTables, Forecasting, & Budgets

---

## 📄 License
Project CloudGazer - Built by **stayrelevant.id** team.
