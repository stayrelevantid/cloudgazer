package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/joho/godotenv"
	"github.com/stayrelevant-id/cloudgazer/internal/aws"
	"github.com/stayrelevant-id/cloudgazer/internal/cron"
	"github.com/stayrelevant-id/cloudgazer/internal/database"
	"github.com/stayrelevant-id/cloudgazer/internal/janitor"
	"github.com/stayrelevant-id/cloudgazer/internal/notifier"
)

func toJSON(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func jsonHeader(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
}

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, relying on environment variables")
	}

	var db *database.DB
	if dbURL := os.Getenv("DATABASE_URL"); dbURL == "" {
		log.Println("DATABASE_URL is not set")
	} else {
		var err error
		db, err = database.New(dbURL)
		if err != nil {
			log.Fatalf("Failed to initialize database: %v", err)
		}
		defer db.Close()
		log.Println("Successfully connected to the database")
	}

	awsRegion := os.Getenv("AWS_REGION")
	if awsRegion == "" {
		awsRegion = "ap-southeast-1"
	}

	ssmClient, err := aws.NewSSMClient(awsRegion)
	if err != nil {
		log.Printf("Failed to initialize AWS SSM client: %v", err)
		ssmClient = nil
	} else {
		log.Println("Successfully initialized AWS SSM Client")
	}

	janitorSvc := janitor.NewService(db, awsRegion)

	mux := http.NewServeMux()

	// ── Health ──────────────────────────────────────────────────────────
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		jsonHeader(w)
		w.Write([]byte(`{"status":"UP"}`))
	})

	// ── Cron Trigger ────────────────────────────────────────────────────
	mux.HandleFunc("/api/cron/fetch", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if db == nil {
			http.Error(w, "Database not configured", http.StatusInternalServerError)
			return
		}
		if err := cron.RunDailyFetch(r.Context(), db, ssmClient, awsRegion); err != nil {
			log.Printf("Cron fetch error: %v", err)
			http.Error(w, "Fetch failed", http.StatusInternalServerError)
			return
		}
		jsonHeader(w)
		w.Write([]byte(`{"status":"success"}`))
	})

	// ── GET/POST /api/accounts ───────────────────────────────────────────────
	mux.HandleFunc("/api/accounts", func(w http.ResponseWriter, r *http.Request) {
		jsonHeader(w)

		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.WriteHeader(http.StatusOK)
			return
		}

		if db == nil {
			http.Error(w, `{"error":"Database not configured"}`, http.StatusInternalServerError)
			return
		}

		if r.Method == http.MethodGet {
			rows, err := db.Pool.Query(r.Context(),
				"SELECT id, user_id, provider, account_name, aws_ssm_path, is_active FROM cloud_accounts ORDER BY account_name",
			)
			if err != nil {
				log.Printf("Query accounts error: %v", err)
				http.Error(w, `{"error":"Failed to query accounts"}`, http.StatusInternalServerError)
				return
			}
			defer rows.Close()

			type Account struct {
				ID          string `json:"id"`
				UserID      string `json:"user_id"`
				Provider    string `json:"provider"`
				AccountName string `json:"account_name"`
				SSMPath     string `json:"aws_ssm_path"`
				IsActive    bool   `json:"is_active"`
			}

			accounts := []Account{}
			for rows.Next() {
				var a Account
				// fallback user_id scanner
				var uid *string
				if err := rows.Scan(&a.ID, &uid, &a.Provider, &a.AccountName, &a.SSMPath, &a.IsActive); err != nil {
					continue
				}
				if uid != nil {
					a.UserID = *uid
				}
				accounts = append(accounts, a)
			}
			fmt.Fprintf(w, `{"accounts":%s}`, toJSON(accounts))
			return
		}

		if r.Method == http.MethodPost {
			var body struct {
				Provider    string `json:"provider"`
				AccountName string `json:"account_name"`
				SSMPath     string `json:"aws_ssm_path"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, `{"error":"Invalid payload"}`, http.StatusBadRequest)
				return
			}

			// We hardcode user_id to "system" for now until JWT middleware is setup
			db.Pool.Exec(r.Context(), "INSERT INTO users (id, email) VALUES ('system', 'system@cloudgazer.com') ON CONFLICT DO NOTHING")

			_, err := db.Pool.Exec(r.Context(),
				"INSERT INTO cloud_accounts (user_id, provider, account_name, aws_ssm_path, is_active) VALUES ('system', $1, $2, $3, true)",
				body.Provider, body.AccountName, body.SSMPath,
			)
			if err != nil {
				log.Printf("Insert account error: %v", err)
				http.Error(w, `{"error":"Failed to insert account"}`, http.StatusInternalServerError)
				return
			}

			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"status":"success"}`))
			return
		}

		if r.Method == http.MethodDelete {
			id := r.URL.Query().Get("id")
			if id == "" {
				http.Error(w, `{"error":"Missing account ID"}`, http.StatusBadRequest)
				return
			}

			// Also delete dependent cost reports and alert configs to avoid foreign key violations
			db.Pool.Exec(r.Context(), "DELETE FROM cost_reports WHERE account_id = $1", id)
			db.Pool.Exec(r.Context(), "DELETE FROM alert_configs WHERE account_id = $1", id)

			_, err := db.Pool.Exec(r.Context(), "DELETE FROM cloud_accounts WHERE id = $1", id)
			if err != nil {
				log.Printf("Delete account error: %v", err)
				http.Error(w, `{"error":"Failed to delete account"}`, http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"status":"success"}`))
			return
		}

		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
	})

	// ── GET /api/reports ─────────────────────────────────────────────────
	mux.HandleFunc("/api/reports", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if db == nil {
			http.Error(w, "Database not configured", http.StatusInternalServerError)
			return
		}

		days := r.URL.Query().Get("days")
		if days == "" {
			days = "30"
		}

		rows, err := db.Pool.Query(r.Context(), `
			SELECT
				cr.record_date::text,
				ca.provider,
				SUM(cr.amount_usd) AS total_usd
			FROM cost_reports cr
			JOIN cloud_accounts ca ON ca.id = cr.account_id
			WHERE cr.record_date >= NOW() - ($1 || ' days')::interval
			GROUP BY cr.record_date, ca.provider
			ORDER BY cr.record_date ASC
		`, days)
		if err != nil {
			log.Printf("Query reports error: %v", err)
			http.Error(w, "Failed to query reports", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		type ReportRow struct {
			Date     string  `json:"date"`
			Provider string  `json:"provider"`
			TotalUSD float64 `json:"total_usd"`
		}

		reports := []ReportRow{}
		for rows.Next() {
			var row ReportRow
			if err := rows.Scan(&row.Date, &row.Provider, &row.TotalUSD); err != nil {
				continue
			}
			reports = append(reports, row)
		}

		jsonHeader(w)
		fmt.Fprintf(w, `{"reports":%s}`, toJSON(reports))
	})

	// ── GET /api/reports/comparison ────────────────────────────────────────
	mux.HandleFunc("/api/reports/comparison", func(w http.ResponseWriter, r *http.Request) {
		jsonHeader(w)
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if db == nil {
			http.Error(w, "Database not configured", http.StatusInternalServerError)
			return
		}

		rows, err := db.Pool.Query(r.Context(), `
			WITH ranges AS (
				SELECT 
					DATE_TRUNC('month', CURRENT_DATE) as current_start,
					DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') as prev_start,
					DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 second' as prev_end
			)
			SELECT 
				ca.provider,
				SUM(CASE WHEN cr.record_date >= r.current_start THEN cr.amount_usd ELSE 0 END) as current_month,
				SUM(CASE WHEN cr.record_date >= r.prev_start AND cr.record_date <= r.prev_end THEN cr.amount_usd ELSE 0 END) as prev_month
			FROM cost_reports cr
			JOIN cloud_accounts ca ON ca.id = cr.account_id
			CROSS JOIN ranges r
			WHERE cr.record_date >= r.prev_start
			GROUP BY ca.provider
		`)

		if err != nil {
			log.Printf("Comparison query error: %v", err)
			http.Error(w, "Failed to fetch comparison data", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		type CompRow struct {
			Provider     string  `json:"provider"`
			CurrentTotal float64 `json:"current_total"`
			PrevTotal    float64 `json:"prev_total"`
		}
		comparisons := []CompRow{}
		for rows.Next() {
			var row CompRow
			if err := rows.Scan(&row.Provider, &row.CurrentTotal, &row.PrevTotal); err != nil {
				continue
			}
			comparisons = append(comparisons, row)
		}
		fmt.Fprintf(w, `{"comparison":%s}`, toJSON(comparisons))
	})

	// ── GET /api/reports/forecasting ───────────────────────────────────────
	mux.HandleFunc("/api/reports/forecasting", func(w http.ResponseWriter, r *http.Request) {
		jsonHeader(w)
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if db == nil {
			http.Error(w, "Database not configured", http.StatusInternalServerError)
			return
		}

		// Simple Linear Regression / Average Run Rate
		// Formula: (Total Cost in Month / Days Elapsed) * Total Days in Month
		rows, err := db.Pool.Query(r.Context(), `
			WITH month_data AS (
				SELECT 
					ca.provider,
					SUM(cr.amount_usd) as total_so_far,
					EXTRACT(DAY FROM CURRENT_DATE) as days_elapsed,
					EXTRACT(DAY FROM (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')) as total_days
				FROM cost_reports cr
				JOIN cloud_accounts ca ON ca.id = cr.account_id
				WHERE cr.record_date >= DATE_TRUNC('month', CURRENT_DATE)
				GROUP BY ca.provider
			)
			SELECT 
				provider,
				total_so_far,
				(total_so_far / days_elapsed) * total_days as projected_total
			FROM month_data
		`)

		if err != nil {
			log.Printf("Forecasting query error: %v", err)
			http.Error(w, "Failed to fetch forecasting data", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		type ForecastRow struct {
			Provider       string  `json:"provider"`
			TotalSoFar     float64 `json:"total_so_far"`
			ProjectedTotal float64 `json:"projected_total"`
		}
		forecasts := []ForecastRow{}
		for rows.Next() {
			var row ForecastRow
			if err := rows.Scan(&row.Provider, &row.TotalSoFar, &row.ProjectedTotal); err != nil {
				continue
			}
			forecasts = append(forecasts, row)
		}
		fmt.Fprintf(w, `{"forecasting":%s}`, toJSON(forecasts))
	})
	
	// ── ADVANCED REPORTS ──────────────────────────────────────────
	mux.HandleFunc("/api/reports/advanced", func(w http.ResponseWriter, r *http.Request) {
		jsonHeader(w)
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if db == nil {
			http.Error(w, "Database not configured", http.StatusInternalServerError)
			return
		}

		timeRange := r.URL.Query().Get("range")       // 7d, 30d, 90d, 180d, 365d
		granularity := r.URL.Query().Get("granularity") // day, week, month

		trunc := "day"
		switch granularity {
		case "week":
			trunc = "week"
		case "month":
			trunc = "month"
		}

		whereClause := ""
		switch timeRange {
		case "today":
			whereClause = "record_date >= CURRENT_DATE"
		case "7d": // This Week (7 days back)
			whereClause = "record_date >= CURRENT_DATE - INTERVAL '6 days'"
		case "30d": // This Month (from 1st)
			whereClause = "record_date >= DATE_TRUNC('month', CURRENT_DATE)"
		case "90d": // Last 3 Months (from 1st of 2 months ago)
			whereClause = "record_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '2 months'"
		case "180d": // Last 6 Months
			whereClause = "record_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'"
		case "365d": // This Year (from Jan 1)
			whereClause = "record_date >= DATE_TRUNC('year', CURRENT_DATE)"
		case "last_year":
			whereClause = "record_date >= DATE_TRUNC('year', CURRENT_DATE) - INTERVAL '1 year' AND record_date < DATE_TRUNC('year', CURRENT_DATE)"
		case "2y_ago":
			whereClause = "record_date >= DATE_TRUNC('year', CURRENT_DATE) - INTERVAL '2 years' AND record_date < DATE_TRUNC('year', CURRENT_DATE) - INTERVAL '1 year'"
		default:
			whereClause = "record_date >= DATE_TRUNC('month', CURRENT_DATE)"
		}

		rows, err := db.Pool.Query(r.Context(), fmt.Sprintf(`
			SELECT 
				DATE_TRUNC('%s', record_date)::text as period,
				ca.provider,
				SUM(amount_usd) as total_usd
			FROM cost_reports cr
			JOIN cloud_accounts ca ON ca.id = cr.account_id
			WHERE %s
			GROUP BY 1, 2
			ORDER BY 1 ASC
		`, trunc, whereClause))

		if err != nil {
			log.Printf("Advanced reports error: %v", err)
			http.Error(w, "Query failed", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		type AdvancedRow struct {
			Period   string  `json:"period"`
			Provider string  `json:"provider"`
			TotalUSD float64 `json:"total_usd"`
		}
		var results []AdvancedRow
		for rows.Next() {
			var row AdvancedRow
			if err := rows.Scan(&row.Period, &row.Provider, &row.TotalUSD); err == nil {
				results = append(results, row)
			}
		}
		fmt.Fprintf(w, `{"reports":%s}`, toJSON(results))
	})

	mux.HandleFunc("/api/reports/resources", func(w http.ResponseWriter, r *http.Request) {
		jsonHeader(w)
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if db == nil {
			http.Error(w, "Database not configured", http.StatusInternalServerError)
			return
		}

		timeRange := r.URL.Query().Get("range")
		whereClause := ""
		switch timeRange {
		case "today":
			whereClause = "cr.record_date >= CURRENT_DATE"
		case "7d":
			whereClause = "cr.record_date >= CURRENT_DATE - INTERVAL '6 days'"
		case "30d":
			whereClause = "cr.record_date >= DATE_TRUNC('month', CURRENT_DATE)"
		case "90d":
			whereClause = "cr.record_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '2 months'"
		case "180d":
			whereClause = "cr.record_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'"
		case "365d":
			whereClause = "cr.record_date >= DATE_TRUNC('year', CURRENT_DATE)"
		case "last_year":
			whereClause = "cr.record_date >= DATE_TRUNC('year', CURRENT_DATE) - INTERVAL '1 year' AND cr.record_date < DATE_TRUNC('year', CURRENT_DATE)"
		case "2y_ago":
			whereClause = "cr.record_date >= DATE_TRUNC('year', CURRENT_DATE) - INTERVAL '2 years' AND cr.record_date < DATE_TRUNC('year', CURRENT_DATE) - INTERVAL '1 year'"
		default:
			whereClause = "cr.record_date >= DATE_TRUNC('month', CURRENT_DATE)"
		}

		rows, err := db.Pool.Query(r.Context(), fmt.Sprintf(`
			SELECT 
				ca.account_name,
				ca.provider,
				cr.tag_name as resource_name,
				SUM(cr.amount_usd) as total_usd
			FROM cost_reports cr
			JOIN cloud_accounts ca ON ca.id = cr.account_id
			WHERE %s
			GROUP BY 1, 2, 3
			ORDER BY total_usd DESC
			LIMIT 15
		`, whereClause))

		if err != nil {
			log.Printf("Resource reports error: %v", err)
			http.Error(w, "Query failed", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		type ResourceRow struct {
			AccountName  string  `json:"account_name"`
			Provider     string  `json:"provider"`
			ResourceName string  `json:"resource_name"`
			TotalUSD     float64 `json:"total_usd"`
		}
		var results []ResourceRow
		for rows.Next() {
			var row ResourceRow
			if err := rows.Scan(&row.AccountName, &row.Provider, &row.ResourceName, &row.TotalUSD); err == nil {
				results = append(results, row)
			}
		}
		fmt.Fprintf(w, `{"resources":%s}`, toJSON(results))
	})

	mux.HandleFunc("/api/reports/historical", func(w http.ResponseWriter, r *http.Request) {
		jsonHeader(w)
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if db == nil {
			http.Error(w, "Database not configured", http.StatusInternalServerError)
			return
		}

		// Pull based on range and granularity
		// Pull based on range and granularity
		timeRange := r.URL.Query().Get("range")       // 7d, 30d, etc.
		granularity := r.URL.Query().Get("granularity") // day, week, month
		if granularity == "" {
			granularity = "month"
		}

		startDate := ""
		endDate := "CURRENT_DATE"
		interval := ""

		switch timeRange {
		case "today":
			startDate = "CURRENT_DATE"
			endDate = "CURRENT_DATE"
			interval = "1 day"
		case "7d":
			startDate = "CURRENT_DATE - INTERVAL '6 days'"
			endDate = "CURRENT_DATE"
			interval = "1 day"
		case "30d":
			startDate = "DATE_TRUNC('month', CURRENT_DATE)"
			endDate = "DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day'"
			interval = "1 day"
		case "90d":
			startDate = "DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '2 months'"
			endDate = "DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day'"
			interval = "1 month"
		case "180d":
			startDate = "DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'"
			endDate = "DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day'"
			interval = "1 month"
		case "365d":
			startDate = "DATE_TRUNC('year', CURRENT_DATE)"
			endDate = "DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '1 year' - INTERVAL '1 day'"
			interval = "1 month"
		case "last_year":
			startDate = "DATE_TRUNC('year', CURRENT_DATE) - INTERVAL '1 year'"
			endDate = "DATE_TRUNC('year', CURRENT_DATE) - INTERVAL '1 day'"
			interval = "1 month"
		case "2y_ago":
			startDate = "DATE_TRUNC('year', CURRENT_DATE) - INTERVAL '2 years'"
			endDate = "DATE_TRUNC('year', CURRENT_DATE) - INTERVAL '1 year' - INTERVAL '1 day'"
			interval = "1 month"
		default:
			startDate = "DATE_TRUNC('month', CURRENT_DATE)"
			endDate = "DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day'"
			interval = "1 day"
		}

		rows, err := db.Pool.Query(r.Context(), fmt.Sprintf(`
			WITH periods AS (
				SELECT generate_series((%s)::timestamp, (%s)::timestamp, '%s'::interval) as period
			)
			SELECT 
				p.period::text,
				COALESCE(SUM(cr.amount_usd), 0) as total_usd
			FROM periods p
			LEFT JOIN cost_reports cr ON DATE_TRUNC('%s', cr.record_date) = p.period
			GROUP BY 1
			ORDER BY 1 DESC
		`, startDate, endDate, interval, granularity))

		if err != nil {
			log.Printf("Historical reports error: %v", err)
			http.Error(w, "Query failed", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		type HistRow struct {
			Period   string  `json:"period"`
			TotalUSD float64 `json:"total_usd"`
		}
		results := []HistRow{}
		for rows.Next() {
			var row HistRow
			if err := rows.Scan(&row.Period, &row.TotalUSD); err != nil {
				log.Printf("Historical scan error: %v", err)
				continue
			}
			results = append(results, row)
		}
		fmt.Fprintf(w, `{"historical":%s}`, toJSON(results))
	})

	// ── ALERTS API ───────────────────────────────────────────────────────
	mux.HandleFunc("/api/alerts", func(w http.ResponseWriter, r *http.Request) {
		jsonHeader(w)

		// Add CORS manually for POST and DELETE later
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.WriteHeader(http.StatusOK)
			return
		}

		if db == nil {
			http.Error(w, `{"error":"Database not configured"}`, http.StatusInternalServerError)
			return
		}

		if r.Method == http.MethodGet {
			// Get all alerts grouped with accounts
			rows, err := db.Pool.Query(r.Context(), `
				SELECT
					a.account_id as id,
					a.account_id,
					c.account_name,
					c.provider,
					a.channel,
					a.webhook_url,
					a.weekly_threshold,
					true as is_active
				FROM alert_configs a
				JOIN cloud_accounts c ON c.id = a.account_id
				ORDER BY c.account_name ASC
			`)
			if err != nil {
				log.Printf("Query alerts error: %v", err)
				http.Error(w, `{"error":"Failed to query alerts"}`, http.StatusInternalServerError)
				return
			}
			defer rows.Close()

			type AlertRow struct {
				ID             string  `json:"id"`
				AccountID      string  `json:"account_id"`
				AccountName    string  `json:"account_name"`
				Provider       string  `json:"provider"`
				Channel        string  `json:"channel"`
				WebhookURL     string  `json:"webhook_url"`
				WeeklyThreshold float64 `json:"weekly_threshold"`
				IsActive       bool    `json:"is_active"`
			}
			alerts := []AlertRow{}
			for rows.Next() {
				var row AlertRow
				if err := rows.Scan(&row.ID, &row.AccountID, &row.AccountName, &row.Provider, &row.Channel, &row.WebhookURL, &row.WeeklyThreshold, &row.IsActive); err != nil {
					continue
				}
				alerts = append(alerts, row)
			}
			fmt.Fprintf(w, `{"alerts":%s}`, toJSON(alerts))
			return
		}

		if r.Method == http.MethodPost {
			var body struct {
				AccountID       string  `json:"account_id"`
				Channel         string  `json:"channel"`
				WebhookURL      string  `json:"webhook_url"`
				WeeklyThreshold float64 `json:"weekly_threshold"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}

			// Insert or Update alert for this account (ON CONFLICT requires a unique constraint, but we assume one alert per account conceptually. Let's make sure it just inserts if no unique constraint exists. Oh wait, we didn't add a unique constraint on account_id in the DB schema for alert_configs. Wait. We did?)
			// Let's check the schema. Wait, no we don't have unique constraint. Let's just do an UPSERT by manually checking or let's assume we can add multiple, but our logic in cron only takes LIMIT 1.
			// I'll do a simple INSERT for now. If it already exists, frontend shouldn't POST or maybe we delete old one.

			// Splitting the multi-statement prepared queries into separate simple executes
			_, err := db.Pool.Exec(r.Context(), "DELETE FROM alert_configs WHERE account_id = $1", body.AccountID)
			if err != nil {
				log.Printf("Delete alert error: %v", err)
				http.Error(w, `{"error":"Failed to override old alert config"}`, http.StatusInternalServerError)
				return
			}

			_, err = db.Pool.Exec(r.Context(), `
				INSERT INTO alert_configs (account_id, channel, webhook_url, weekly_threshold) 
				VALUES ($1, $2, $3, $4)
			`, body.AccountID, body.Channel, body.WebhookURL, body.WeeklyThreshold)

			if err != nil {
				log.Printf("Insert alert error: %v", err)
				http.Error(w, `{"error":"Failed to save alert config"}`, http.StatusInternalServerError)
				return
			}

			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"status":"success"}`))
			return
		}

		if r.Method == http.MethodDelete {
			accountID := r.URL.Query().Get("account_id")
			if accountID == "" {
				http.Error(w, `{"error":"Missing account_id"}`, http.StatusBadRequest)
				return
			}
			_, err := db.Pool.Exec(r.Context(), "DELETE FROM alert_configs WHERE account_id = $1", accountID)
			if err != nil {
				log.Printf("Delete alert error: %v", err)
				http.Error(w, `{"error":"Failed to delete alert"}`, http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"status":"success"}`))
			return
		}

		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
	})

	// ── ALERTS TEST API ──────────────────────────────────────────────────
	mux.HandleFunc("/api/alerts/test", func(w http.ResponseWriter, r *http.Request) {
		jsonHeader(w)

		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.WriteHeader(http.StatusOK)
			return
		}

		if r.Method != http.MethodPost {
			http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
			return
		}

		var body struct {
			Channel    string `json:"channel"`
			WebhookURL string `json:"webhook_url"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
			return
		}

		if body.WebhookURL == "" {
			http.Error(w, `{"error":"Missing webhook_url"}`, http.StatusBadRequest)
			return
		}

		n, err := notifier.NewNotifier(body.Channel, body.WebhookURL)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"%v"}`, err), http.StatusBadRequest)
			return
		}

		testMsg := fmt.Sprintf("🔔 *CloudGazer Test Notification*\n\nYour webhook configuration for **%s** is working perfectly! 🚀\n_Sent at %s_",
			body.Channel, time.Now().Format("Jan 02, 15:04:05"))

		if err := n.SendAlert(testMsg); err != nil {
			log.Printf("Test notification error: %v", err)
			http.Error(w, fmt.Sprintf(`{"error":"Failed to send test notification: %v"}`, err), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"success","message":"Test notification sent"}`))
	})

	// ── JANITOR API ──────────────────────────────────────────────────────
	mux.HandleFunc("/api/janitor", func(w http.ResponseWriter, r *http.Request) {
		jsonHeader(w)

		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.WriteHeader(http.StatusOK)
			return
		}

		if r.Method != http.MethodGet {
			http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
			return
		}

		if db == nil {
			http.Error(w, `{"error":"Database not configured"}`, http.StatusInternalServerError)
			return
		}

		results, err := janitorSvc.GetIdleResources(r.Context())
		if err != nil {
			log.Printf("Janitor error: %v", err)
			http.Error(w, `{"error":"Failed to fetch idle resources"}`, http.StatusInternalServerError)
			return
		}

		fmt.Fprintf(w, `{"janitor":%s}`, toJSON(results))
	})

	// ── BUDGETS API ──────────────────────────────────────────────────────
	mux.HandleFunc("/api/budgets", func(w http.ResponseWriter, r *http.Request) {
		jsonHeader(w)

		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.WriteHeader(http.StatusOK)
			return
		}

		if db == nil {
			http.Error(w, `{"error":"Database not configured"}`, http.StatusInternalServerError)
			return
		}

		if r.Method == http.MethodGet {
			budgets, err := db.GetBudgets(r.Context())
			if err != nil {
				log.Printf("Query budgets error: %v", err)
				http.Error(w, `{"error":"Failed to query budgets"}`, http.StatusInternalServerError)
				return
			}
			fmt.Fprintf(w, `{"budgets":%s}`, toJSON(budgets))
			return
		}

		if r.Method == http.MethodPost {
			var body struct {
				AccountID string  `json:"account_id"`
				Amount    float64 `json:"amount"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, `{"error":"Invalid request payload"}`, http.StatusBadRequest)
				return
			}
			if body.AccountID == "" || body.Amount <= 0 {
				http.Error(w, `{"error":"Invalid account_id or amount"}`, http.StatusBadRequest)
				return
			}

			if err := db.CreateBudget(r.Context(), body.AccountID, body.Amount); err != nil {
				log.Printf("Create budget error: %v", err)
				http.Error(w, `{"error":"Failed to create budget"}`, http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"status":"success"}`))
			return
		}

		if r.Method == http.MethodDelete {
			id := r.URL.Query().Get("id")
			if id == "" {
				http.Error(w, `{"error":"Missing budget ID"}`, http.StatusBadRequest)
				return
			}
			if err := db.DeleteBudget(r.Context(), id); err != nil {
				log.Printf("Delete budget error: %v", err)
				http.Error(w, `{"error":"Failed to delete budget"}`, http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"status":"success"}`))
			return
		}

		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server running on port %s", port)
	if err := http.ListenAndServe(fmt.Sprintf(":%s", port), mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
