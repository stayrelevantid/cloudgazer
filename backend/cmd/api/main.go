package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
)

import (
	"github.com/clerk/clerk-sdk-go/v2"
	clerkhttp "github.com/clerk/clerk-sdk-go/v2/http"
	"github.com/joho/godotenv"
	"github.com/stayrelevant-id/cloudgazer/internal/aws"
	"github.com/stayrelevant-id/cloudgazer/internal/cron"
	"github.com/stayrelevant-id/cloudgazer/internal/database"
	"github.com/stayrelevant-id/cloudgazer/internal/janitor"
)

func toJSON(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func getUserID(r *http.Request) string {
	claims, ok := clerk.SessionClaimsFromContext(r.Context())
	if !ok {
		return ""
	}
	return claims.Subject
}

func ensureUser(ctx context.Context, db *database.DB, userID string) error {
	if userID == "" {
		return fmt.Errorf("empty userID")
	}
	_, err := db.Pool.Exec(ctx, "INSERT INTO users (id, email) VALUES ($1, $1) ON CONFLICT DO NOTHING", userID)
	return err
}

// corsMiddleware adds CORS headers and handles OPTIONS preflight requests
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		
		next.ServeHTTP(w, r)
	})
}

// jsonResponse adds JSON content-type header
func jsonResponse(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		next.ServeHTTP(w, r)
	})
}

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, relying on environment variables")
	}

	clerkKey := os.Getenv("CLERK_SECRET_KEY")
	if clerkKey == "" {
		log.Println("CLERK_SECRET_KEY is not set")
	} else {
		clerk.SetKey(clerkKey)
		log.Println("Successfully initialized Clerk SDK")
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

	janitorSvc := janitor.NewService(db, awsRegion, ssmClient)

	mux := http.NewServeMux()

	// ── Health (Unprotected) ──────────────────────────────────────────
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"success"}`))
	})

	// ── SSM Diagnostic ──────────────────────────────────────────────────
	mux.HandleFunc("/api/diag/ssm-test", func(w http.ResponseWriter, r *http.Request) {
		if ssmClient == nil {
			http.Error(w, `{"status":"error","message":"SSM Client not initialized"}`, http.StatusInternalServerError)
			return
		}
		path := r.URL.Query().Get("path")
		if path == "" {
			path = "/cloudgazer/aws-credentials"
		}
		val, err := ssmClient.GetSecret(r.Context(), path)
		if err != nil {
			log.Printf("Diag: Failed to fetch %s: %v", path, err)
			w.WriteHeader(http.StatusUnauthorized)
			fmt.Fprintf(w, `{"status":"error","path":"%s","message":"%s"}`, path, err.Error())
			return
		}
		w.Write([]byte(fmt.Sprintf(`{"status":"success","path":"%s","length":%d}`, path, len(val))))
	})

	// ── Auth-wrapped Handlers ──────────────────────────────────────────
	
	// Cron Trigger
	mux.Handle("/api/cron/fetch", clerkhttp.RequireHeaderAuthorization()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		userID := getUserID(r)
		if userID == "" {
			log.Println("Auth failed: No userID in context")
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		ensureUser(r.Context(), db, userID)

		if err := cron.RunDailyFetch(r.Context(), db, ssmClient, awsRegion, userID); err != nil {
			log.Printf("Cron fetch error: %v", err)
			http.Error(w, "Fetch failed", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusAccepted)
		w.Write([]byte(`{"status":"success"}`))
	})))

	// Accounts
	mux.Handle("/api/accounts", clerkhttp.RequireHeaderAuthorization()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		if userID == "" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized); return
		}
		ensureUser(r.Context(), db, userID)

		if r.Method == http.MethodGet {
			rows, err := db.Pool.Query(r.Context(), "SELECT id, user_id, provider, account_name, aws_ssm_path, is_active FROM cloud_accounts WHERE user_id = $1 ORDER BY account_name", userID)
			if err != nil {
				http.Error(w, `{"error":"Failed to query"}`, http.StatusInternalServerError)
				return
			}
			defer rows.Close()
			type Account struct {
				ID string `json:"id"`; UserID string `json:"user_id"`; Provider string `json:"provider"`; AccountName string `json:"account_name"`; SSMPath string `json:"aws_ssm_path"`; IsActive bool `json:"is_active"`
			}
			var accounts []Account
			for rows.Next() {
				var a Account; var uid *string
				if err := rows.Scan(&a.ID, &uid, &a.Provider, &a.AccountName, &a.SSMPath, &a.IsActive); err == nil {
					if uid != nil { a.UserID = *uid }
					accounts = append(accounts, a)
				}
			}
			fmt.Fprintf(w, `{"accounts":%s}`, toJSON(accounts))
			return
		}
		if r.Method == http.MethodPost {
			var body struct { Provider string `json:"provider"`; AccountName string `json:"account_name"`; SSMPath string `json:"aws_ssm_path"` }
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, "Invalid body", 400); return
			}
			_, err := db.Pool.Exec(r.Context(), "INSERT INTO cloud_accounts (user_id, provider, account_name, aws_ssm_path, is_active) VALUES ($1, $2, $3, $4, true)", userID, body.Provider, body.AccountName, body.SSMPath)
			if err != nil {
				log.Printf("Failed to create account: %v", err)
				http.Error(w, "Database error", 500); return
			}
			w.WriteHeader(http.StatusOK); w.Write([]byte(`{"status":"success"}`)); return
		}
		if r.Method == http.MethodDelete {
			id := r.URL.Query().Get("id")
			db.Pool.Exec(r.Context(), "DELETE FROM cost_reports cr USING cloud_accounts ca WHERE cr.account_id = ca.id AND ca.id = $1 AND ca.user_id = $2", id, userID)
			db.Pool.Exec(r.Context(), "DELETE FROM alert_configs WHERE account_id = $1", id)
			db.Pool.Exec(r.Context(), "DELETE FROM cloud_accounts WHERE id = $1 AND user_id = $2", id, userID)
			w.WriteHeader(http.StatusOK); w.Write([]byte(`{"status":"success"}`)); return
		}
	})))

	// Migrate
	mux.Handle("/api/accounts/migrate", clerkhttp.RequireHeaderAuthorization()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		if userID == "" { http.Error(w, "Unauthorized", 401); return }
		ensureUser(r.Context(), db, userID)

		var body struct { AccountID string `json:"account_id"`; MonthsBack int `json:"months_back"` }
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "Invalid body", 400); return
		}
		if body.MonthsBack <= 0 { body.MonthsBack = 6 }
		go func() {
			ctx := context.Background()
			var exists bool
			db.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM cloud_accounts WHERE id = $1 AND user_id = $2)", body.AccountID, userID).Scan(&exists)
			if exists { cron.RunHistoricalSync(ctx, db, ssmClient, awsRegion, body.AccountID, body.MonthsBack, userID) }
		}()
		w.WriteHeader(http.StatusAccepted); w.Write([]byte(`{"status":"migration_started"}`))
	})))

	// Reports - Summary
	mux.Handle("/api/reports", clerkhttp.RequireHeaderAuthorization()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r); days := r.URL.Query().Get("days")
		if userID == "" { http.Error(w, "Unauthorized", 401); return }
		ensureUser(r.Context(), db, userID)
		if days == "" { days = "30" }
		rows, err := db.Pool.Query(r.Context(), "SELECT cr.record_date::text, ca.provider, SUM(cr.amount_usd) FROM cost_reports cr JOIN cloud_accounts ca ON ca.id = cr.account_id WHERE ca.user_id = $1 AND cr.record_date >= NOW() - ($2 || ' days')::interval GROUP BY 1, 2 ORDER BY 1 ASC", userID, days)
		if err != nil { log.Printf("Reports query error: %v", err); http.Error(w, "Query failed", 500); return }
		defer rows.Close()
		type Row struct { Date string `json:"date"`; Provider string `json:"provider"`; TotalUSD float64 `json:"total_usd"` }
		var res []Row
		for rows.Next() {
			var r Row; rows.Scan(&r.Date, &r.Provider, &r.TotalUSD); res = append(res, r)
		}
		fmt.Fprintf(w, `{"reports":%s}`, toJSON(res))
	})))

	// Reports - Services
	mux.Handle("/api/reports/services", clerkhttp.RequireHeaderAuthorization()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r); timeframe := r.URL.Query().Get("range")
		if userID == "" { http.Error(w, "Unauthorized", 401); return }
		ensureUser(r.Context(), db, userID)
		
		query := "SELECT ca.account_name, ca.provider, cr.service_name, SUM(cr.amount_usd) FROM cost_reports cr JOIN cloud_accounts ca ON ca.id = cr.account_id WHERE ca.user_id = $1"
		args := []interface{}{userID}
		
		switch timeframe {
		case "today": query += " AND cr.record_date >= CURRENT_DATE"
		case "7d": query += " AND cr.record_date >= CURRENT_DATE - INTERVAL '6 days'"
		case "30d": query += " AND cr.record_date >= DATE_TRUNC('month', CURRENT_DATE)"
		default: query += " AND cr.record_date >= DATE_TRUNC('month', CURRENT_DATE)"
		}
		
		accountID := r.URL.Query().Get("account_id")
		if accountID != "" {
			query += fmt.Sprintf(" AND cr.account_id = $%d", len(args)+1)
			args = append(args, accountID)
		}
		tag := r.URL.Query().Get("tag")
		if tag != "" && tag != "all" {
			query += fmt.Sprintf(" AND cr.tag_name = $%d", len(args)+1)
			args = append(args, tag)
		}
		
		query += " GROUP BY 1, 2, 3 ORDER BY 4 DESC"
		rows, err := db.Pool.Query(r.Context(), query, args...)
		if err != nil {
			log.Printf("Services query error: %v", err)
			http.Error(w, "Query failed", 500); return
		}
		defer rows.Close()
		type Row struct { AccountName string `json:"account_name"`; Provider string `json:"provider"`; ServiceName string `json:"service_name"`; TotalUSD float64 `json:"total_usd"` }
		var res []Row
		for rows.Next() {
			var r Row; rows.Scan(&r.AccountName, &r.Provider, &r.ServiceName, &r.TotalUSD); res = append(res, r)
		}
		fmt.Fprintf(w, `{"services":%s}`, toJSON(res))
	})))

	// Comparison
	mux.Handle("/api/reports/comparison", clerkhttp.RequireHeaderAuthorization()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		if userID == "" { http.Error(w, "Unauthorized", 401); return }
		ensureUser(r.Context(), db, userID)
		
		args := []interface{}{userID}
		extra := " AND ca.user_id = $1"
		accountID := r.URL.Query().Get("account_id")
		if accountID != "" {
			extra += " AND cr.account_id = $2"
			args = append(args, accountID)
		}
		
		rows, err := db.Pool.Query(r.Context(), fmt.Sprintf(`
			WITH ranges AS (SELECT DATE_TRUNC('month', CURRENT_DATE) as cur_s, DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') as prev_s, DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 second' as prev_e),
			data AS (SELECT cr.service_name, ca.provider, SUM(CASE WHEN cr.record_date >= r.cur_s THEN cr.amount_usd ELSE 0 END) as cur, SUM(CASE WHEN cr.record_date >= r.prev_s AND cr.record_date <= r.prev_e THEN cr.amount_usd ELSE 0 END) as prev FROM cost_reports cr JOIN cloud_accounts ca ON ca.id = cr.account_id CROSS JOIN ranges r WHERE cr.record_date >= r.prev_s %s GROUP BY 1, 2)
			SELECT service_name, provider, cur, prev, (cur - prev), CASE WHEN prev = 0 THEN 100 ELSE ((cur-prev)/prev)*100 END as pct FROM data WHERE cur > 0 OR prev > 0 ORDER BY cur DESC`, extra), args...)
		if err != nil {
			log.Printf("Comparison query error: %v", err)
			http.Error(w, "Query failed", 500); return
		}
		defer rows.Close()
		type Row struct { Service string `json:"service"`; Provider string `json:"provider"`; CurrentTotal float64 `json:"current_total"`; PrevTotal float64 `json:"prev_total"`; Delta float64 `json:"delta"`; DeltaPercent float64 `json:"delta_percent"` }
		var res []Row
		for rows.Next() {
			var r Row; rows.Scan(&r.Service, &r.Provider, &r.CurrentTotal, &r.PrevTotal, &r.Delta, &r.DeltaPercent); res = append(res, r)
		}
		fmt.Fprintf(w, `{"comparison":%s}`, toJSON(res))
	})))

	// Forecasting
	mux.Handle("/api/reports/forecasting", clerkhttp.RequireHeaderAuthorization()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		if userID == "" { http.Error(w, "Unauthorized", 401); return }
		ensureUser(r.Context(), db, userID)
		
		rows, err := db.Pool.Query(r.Context(), `
			WITH m_data AS (SELECT ca.provider, SUM(cr.amount_usd) as so_far, GREATEST(EXTRACT(DAY FROM CURRENT_DATE), 1) as elapsed, EXTRACT(DAY FROM (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')) as total FROM cost_reports cr JOIN cloud_accounts ca ON ca.id = cr.account_id WHERE cr.record_date >= DATE_TRUNC('month', CURRENT_DATE) AND ca.user_id = $1 GROUP BY 1),
			b_data AS (SELECT ca.provider, SUM(COALESCE(b.amount, 0)) as budget FROM cloud_accounts ca LEFT JOIN budgets b ON b.account_id = ca.id AND b.is_active = true WHERE ca.user_id = $2 GROUP BY 1)
			SELECT m.provider, m.so_far, (m.so_far/m.elapsed)*m.total, COALESCE(b.budget, 0) FROM m_data m LEFT JOIN b_data b ON b.provider = m.provider`, userID, userID)
		if err != nil {
			log.Printf("Forecasting query error: %v", err)
			http.Error(w, "Query failed", 500); return
		}
		defer rows.Close()
		type Row struct { Provider string `json:"provider"`; TotalSoFar float64 `json:"total_so_far"`; ProjectedTotal float64 `json:"project_total"`; Budget float64 `json:"budget"` }
		var res []Row
		for rows.Next() {
			var r Row; rows.Scan(&r.Provider, &r.TotalSoFar, &r.ProjectedTotal, &r.Budget); res = append(res, r)
		}
		fmt.Fprintf(w, `{"forecasting":%s}`, toJSON(res))
	})))

	// Advanced
	mux.Handle("/api/reports/advanced", clerkhttp.RequireHeaderAuthorization()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		if userID == "" { http.Error(w, "Unauthorized", 401); return }
		ensureUser(r.Context(), db, userID)
		
		tr := r.URL.Query().Get("range"); gr := r.URL.Query().Get("granularity"); gb := r.URL.Query().Get("group_by")
		trunc := "day"; if gr == "week" || gr == "month" { trunc = gr }
		fld := "'Total'"; switch gb { case "account": fld = "ca.account_name"; case "service": fld = "cr.service_name"; case "provider": fld = "ca.provider"; case "tag": fld = "cr.tag_name" }
		
		query := fmt.Sprintf("SELECT DATE_TRUNC('%s', cr.record_date)::text, %s, SUM(cr.amount_usd) FROM cost_reports cr JOIN cloud_accounts ca ON ca.id = cr.account_id WHERE ca.user_id = $1", trunc, fld)
		switch tr {
		case "7d": query += " AND cr.record_date >= CURRENT_DATE - INTERVAL '6 days'"
		case "30d": query += " AND cr.record_date >= DATE_TRUNC('month', CURRENT_DATE)"
		default: query += " AND cr.record_date >= DATE_TRUNC('month', CURRENT_DATE)"
		}
		query += " GROUP BY 1, 2 ORDER BY 1 ASC"
		
		rows, err := db.Pool.Query(r.Context(), query, userID)
		if err != nil {
			log.Printf("Advanced query error: %v", err)
			http.Error(w, "Query failed", 500); return
		}
		defer rows.Close()
		type Row struct { Period string `json:"period"`; GroupName string `json:"group_name"`; TotalUSD float64 `json:"total_usd"` }
		var res []Row
		for rows.Next() {
			var r Row; rows.Scan(&r.Period, &r.GroupName, &r.TotalUSD); res = append(res, r)
		}
		fmt.Fprintf(w, `{"reports":%s}`, toJSON(res))
	})))

	// Resources
	mux.Handle("/api/reports/resources", clerkhttp.RequireHeaderAuthorization()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r); tr := r.URL.Query().Get("range")
		if userID == "" { http.Error(w, "Unauthorized", 401); return }
		ensureUser(r.Context(), db, userID)
		
		query := "SELECT ca.account_name, ca.provider, cr.service_name, cr.resource_name, cr.tag_name, SUM(cr.amount_usd) FROM cost_reports cr JOIN cloud_accounts ca ON ca.id = cr.account_id WHERE ca.user_id = $1"
		switch tr { case "7d": query += " AND cr.record_date >= CURRENT_DATE - INTERVAL '6 days'"; default: query += " AND cr.record_date >= DATE_TRUNC('month', CURRENT_DATE)" }
		query += " GROUP BY 1,2,3,4,5 ORDER BY 6 DESC"
		
		rows, err := db.Pool.Query(r.Context(), query, userID)
		if err != nil {
			log.Printf("Resources query error: %v", err)
			http.Error(w, "Query failed", 500); return
		}
		defer rows.Close()
		type Row struct { AccountName string `json:"account_name"`; Provider string `json:"provider"`; ServiceName string `json:"service_name"`; ResourceName string `json:"resource_name"`; TagName string `json:"tag_name"`; TotalUSD float64 `json:"total_usd"` }
		var res []Row
		for rows.Next() {
			var r Row; rows.Scan(&r.AccountName, &r.Provider, &r.ServiceName, &r.ResourceName, &r.TagName, &r.TotalUSD); res = append(res, r)
		}
		fmt.Fprintf(w, `{"resources":%s}`, toJSON(res))
	})))

	// Janitor
	mux.Handle("/api/janitor", clerkhttp.RequireHeaderAuthorization()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		if userID == "" { http.Error(w, "Unauthorized", 401); return }
		ensureUser(r.Context(), db, userID)
		results, _ := janitorSvc.GetIdleResources(r.Context(), userID)
		fmt.Fprintf(w, `{"janitor":%s}`, toJSON(results))
	})))

	// Budgets
	mux.Handle("/api/budgets", clerkhttp.RequireHeaderAuthorization()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		if userID == "" { http.Error(w, "Unauthorized", 401); return }
		ensureUser(r.Context(), db, userID)
		if r.Method == http.MethodGet {
			b, _ := db.GetBudgets(r.Context(), userID)
			fmt.Fprintf(w, `{"budgets":%s}`, toJSON(b)); return
		}
		if r.Method == http.MethodPost {
			var body struct { AccountID string `json:"account_id"`; Amount float64 `json:"amount"` }
			json.NewDecoder(r.Body).Decode(&body)
			db.CreateBudget(r.Context(), userID, body.AccountID, body.Amount)
			w.WriteHeader(200); return
		}
		if r.Method == http.MethodDelete {
			id := r.URL.Query().Get("id")
			db.DeleteBudget(r.Context(), userID, id)
			w.WriteHeader(200); return
		}
	})))

	// Alerts
	mux.Handle("/api/alerts", clerkhttp.RequireHeaderAuthorization()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		if userID == "" { http.Error(w, "Unauthorized", 401); return }
		ensureUser(r.Context(), db, userID)
		if r.Method == http.MethodGet {
			rows, _ := db.Pool.Query(r.Context(), "SELECT channel, webhook_url, weekly_threshold, account_id FROM alert_configs ac JOIN cloud_accounts ca ON ca.id = ac.account_id WHERE ca.user_id = $1", userID)
			defer rows.Close()
			var res []interface{}
			for rows.Next() {
				var c, w, t, a string; rows.Scan(&c, &w, &t, &a)
				res = append(res, map[string]string{"channel": c, "webhook_url": w, "weekly_threshold": t, "account_id": a})
			}
			fmt.Fprintf(w, `{"alerts":%s}`, toJSON(res)); return
		}
		if r.Method == http.MethodPost {
			var b struct { AccountID string `json:"account_id"`; Channel string `json:"channel"`; WebhookURL string `json:"webhook_url"`; WeeklyThreshold float64 `json:"weekly_threshold"` }
			json.NewDecoder(r.Body).Decode(&b)
			// Ownership check
			var exists bool
			db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM cloud_accounts WHERE id=$1 AND user_id=$2)", b.AccountID, userID).Scan(&exists)
			if exists {
				db.Pool.Exec(r.Context(), "DELETE FROM alert_configs WHERE account_id = $1", b.AccountID)
				db.Pool.Exec(r.Context(), "INSERT INTO alert_configs (account_id, channel, webhook_url, weekly_threshold) VALUES ($1, $2, $3, $4)", b.AccountID, b.Channel, b.WebhookURL, b.WeeklyThreshold)
			}
			w.WriteHeader(200); return
		}
	})))

	// Global Middleware
	finalHandler := corsMiddleware(jsonResponse(mux))

	port := os.Getenv("PORT")
	if port == "" { port = "8080" }
	log.Printf("Server running on port %s", port)
	http.ListenAndServe(fmt.Sprintf(":%s", port), finalHandler)
}
