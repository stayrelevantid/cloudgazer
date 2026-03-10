# PRD: Project CloudGazer (v1.0)

| Field | Detail |
|-------|--------|
| **Project Name** | CloudGazer |
| **Owner** | stayrelevant.id |
| **Core Stack** | Go (Backend), Next.js + shadcn/ui (Frontend), AWS SSM (Secret Management), Neon.tech (Postgres) |

---

## 1. Objective & Scope

Membangun platform **monitoring biaya cloud (AWS & GCP)** mandiri yang memungkinkan pengguna untuk:

- Menambah/menghapus akun cloud secara **dinamis**.
- Melihat **tren biaya harian** melalui dashboard interaktif.
- Mendapatkan **notifikasi** jika terjadi anomali atau lonjakan biaya.

> **Target**: Biaya operasional infrastruktur **Rp 0** (Free Tier).

---

## 2. Fitur Utama (MVP + Recommended)

### A. Dashboard & Monitoring

| Fitur | Deskripsi |
|-------|-----------|
| **Multi-Cloud Overview** | Visualisasi gabungan biaya AWS dan GCP dalam satu grafik (Area Chart). |
| **Daily Fetcher** | Sinkronisasi data biaya otomatis sekali sehari (`00:00 UTC`) untuk efisiensi API. |
| **Tag/Label Filtering** | Breakdown biaya berdasarkan project (misal: `Zenith-X`, `SkyBridge`). |
| **Currency Toggle** | Konversi tampilan biaya dari USD ke IDR. |

### B. Dynamic Management & Security

| Fitur | Deskripsi |
|-------|-----------|
| **Authentication** | Login aman menggunakan **Clerk** atau **Auth.js** (NextAuth). |
| **Dynamic Account Integration** | **AWS**: Input Role ARN (Cross-account access). **GCP**: Input Service Account JSON. |
| **Secret Management** | Semua kredensial sensitif disimpan di **AWS SSM Parameter Store** (`SecureString`). |

### C. Alerting & Janitor

| Fitur | Deskripsi |
|-------|-----------|
| **Threshold Alerts** | Notifikasi ke Slack/Telegram jika biaya melebihi budget harian. |
| **Anomaly Detection** | Deteksi lonjakan biaya >20% dibandingkan rata-rata 7 hari terakhir. |
| **Idle Resource Suggestions** | Identifikasi resource tak terpakai (Unattached EBS, Idle EIP). |
| **Integration Tester** | Tombol "Test Connection" untuk memvalidasi webhook notifikasi. |

---

## 3. Arsitektur Teknis

| Layer | Technology | Provider (Free Tier) |
|-------|------------|----------------------|
| **Frontend** | Next.js 14/15, Tailwind, shadcn/ui | Vercel |
| **Backend** | Go (Golang) 1.22+ | Koyeb / Render |
| **Database** | PostgreSQL | Neon.tech |
| **Secrets** | AWS SSM Parameter Store | AWS (Standard Tier) |
| **Auth** | Clerk / NextAuth | Clerk (Free Tier) |
| **Cron Job** | GitHub Actions (Scheduled) | GitHub |

---

## 4. Skema Database (Final)

### Core Tables

```sql
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
```

### Notification & Janitor

```sql
CREATE TABLE alert_configs (
    account_id       UUID REFERENCES cloud_accounts(id),
    channel          VARCHAR(20),    -- 'slack' | 'telegram'
    webhook_url      TEXT,
    daily_threshold  DECIMAL(15, 2)
);
```

---

## 5. Roadmap Eksekusi

| Phase | Nama | Deskripsi |
|-------|------|-----------|
| **Phase 1** | Foundation | Setup Database Neon, Auth Clerk, dan Boilerplate Backend Go dengan AWS SDK. |
| **Phase 2** | Fetcher Logic | Implementasi logic penarikan data AWS Cost Explorer & GCP Billing via Go. |
| **Phase 3** | Frontend | Build Dashboard UI dengan shadcn/ui (Charts & Tables). |
| **Phase 4** | Alerting | Implementasi Anomaly Detection dan Notification Engine. |
| **Phase 5** | CI/CD | Setup GitHub Actions untuk Cron Job dan auto-deploy ke Koyeb/Vercel. |

---

## 6. Future Enhancements (v1.1)

### A. Cost Forecasting (Prediksi Biaya)

- Gunakan data historis untuk memprediksi **estimasi biaya akhir bulan** dengan metode *linear regression* sederhana.
- Tampilkan grafik **"Projected Spend vs Budget"** di dashboard utama.
- Memberikan *early warning* jika proyeksi melampaui budget sebelum bulan berakhir.

### B. Budget Management

- User dapat mengatur **monthly budget per akun cloud atau per project/tag**, bukan hanya daily threshold.
- Tampilkan **progress bar visual** di dashboard:
  > *"80% budget terpakai, sisa 5 hari"*
- Integrasi dengan alerting: notifikasi otomatis saat budget mencapai 50%, 80%, dan 100%.

### C. Cost Comparison Report

- Perbandingan biaya **bulan ini vs bulan lalu** (Month-over-Month / MoM).
- **Breakdown per service** (EC2, S3, Lambda, Cloud Run, BigQuery, dll).
- Visualisasi dalam bentuk **bar chart perbandingan** dan tabel delta (naik/turun).