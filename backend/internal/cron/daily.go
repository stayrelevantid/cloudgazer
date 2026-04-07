package cron

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/stayrelevant-id/cloudgazer/internal/aws"
	"github.com/stayrelevant-id/cloudgazer/internal/database"
	"github.com/stayrelevant-id/cloudgazer/internal/fetcher"
	"github.com/stayrelevant-id/cloudgazer/internal/notifier"
	"os"
)

func RunDailyFetch(ctx context.Context, db *database.DB, ssmClient *aws.SSMClient, awsRegion string) error {
	log.Println("Starting Daily Cost Fetch...")

	// Default to yesterday
	now := time.Now().UTC()
	yesterday := now.AddDate(0, 0, -1)
	today := now

	return runSyncForRange(ctx, db, ssmClient, awsRegion, yesterday, today, "")
}

func RunHistoricalSync(ctx context.Context, db *database.DB, ssmClient *aws.SSMClient, awsRegion string, accountID string, monthsBack int) error {
	log.Printf("Starting Historical Sync for %d months...", monthsBack)

	now := time.Now().UTC()
	// CE API allows up to 12 months.
	start := now.AddDate(0, -monthsBack, 0)
	// Set start to the beginning of that month
	start = time.Date(start.Year(), start.Month(), 1, 0, 0, 0, 0, time.UTC)

	return runSyncForRange(ctx, db, ssmClient, awsRegion, start, now, accountID)
}

func runSyncForRange(ctx context.Context, db *database.DB, ssmClient *aws.SSMClient, awsRegion string, start, end time.Time, filterAccountID string) error {
	query := "SELECT id, provider, account_name, aws_ssm_path FROM cloud_accounts WHERE is_active = true"
	if filterAccountID != "" {
		query += fmt.Sprintf(" AND id = '%s'", filterAccountID)
	}

	rows, err := db.Pool.Query(ctx, query)
	if err != nil {
		return err
	}
	defer rows.Close()

	awsF := fetcher.NewAWSFetcher()
	gcpF := fetcher.NewGCPFetcher()

	for rows.Next() {
		var id, provider, accountName, ssmPath string
		if err := rows.Scan(&id, &provider, &accountName, &ssmPath); err != nil {
			log.Printf("Failed to scan account: %v", err)
			continue
		}

		log.Printf("[Sync] Processing account: %s (%s)", accountName, provider)
		log.Printf("[Sync] Date Range: %s to %s", start.Format("2006-01-02"), end.Format("2006-01-02"))

		var records []fetcher.CostRecord
		var err error

		if strings.HasPrefix(ssmPath, "TEST_MOCK_") {
			// Generate records for every day in the range
			for d := start; !d.After(end); d = d.AddDate(0, 0, 1) {
				// Base randomness on date and account id
				seed := int64(d.Unix()) + int64(id[0])
				randVal := (float64(seed%100) / 100.0) * 10.0

				if provider == "aws" {
					records = append(records, fetcher.CostRecord{ServiceName: "EC2 - Instances", ResourceName: "i-0987abcd1234", TagName: "Project:Alpha", AmountUSD: 15.0 + randVal, Date: d})
					records = append(records, fetcher.CostRecord{ServiceName: "S3", ResourceName: "static-assets-cdn", TagName: "Project:Alpha", AmountUSD: 2.5 + randVal/5, Date: d})
					records = append(records, fetcher.CostRecord{ServiceName: "RDS", ResourceName: "db-prod-cluster", TagName: "Project:Beta", AmountUSD: 30.0 + randVal*2, Date: d})
				} else {
					records = append(records, fetcher.CostRecord{ServiceName: "Compute Engine", ResourceName: "instance-prod-01", TagName: "Env:Prod", AmountUSD: 20.0 + randVal, Date: d})
					records = append(records, fetcher.CostRecord{ServiceName: "Cloud Storage", ResourceName: "backups-bucket", TagName: "Env:Backup", AmountUSD: 5.0 + randVal/2, Date: d})
				}
			}
		} else if provider == "aws" {
			credentialsJSON := ""
			if ssmPath != "" && ssmClient != nil {
				credentialsJSON, err = ssmClient.GetSecret(ctx, ssmPath)
				if err != nil {
					log.Printf("Failed to get AWS credentials JSON from SSM for %s: %v", accountName, err)
					continue
				}
			}
			tagKey := os.Getenv("COST_TAG_KEY")
			if tagKey == "" {
				tagKey = "Project"
			}
			records, err = awsF.FetchCost(ctx, awsRegion, credentialsJSON, tagKey, start, end)

		} else if provider == "gcp" {
			if ssmPath == "" || ssmClient == nil {
				continue
			}
			saJSONStr, err := ssmClient.GetSecret(ctx, ssmPath)
			if err != nil {
				log.Printf("Failed to get GCP SA JSON from SSM for %s: %v", accountName, err)
				continue
			}
			records, err = gcpF.FetchCost(ctx, []byte(saJSONStr), accountName, start, end)
		}

		if err != nil {
			log.Printf("[Sync] Error: Failed to fetch costs for %s: %v", accountName, err)
			continue
		}

		log.Printf("[Sync] Success! Retrieved %d records for %s", len(records), accountName)

		// 3. Persist to DB (Idempotent)
		for _, rec := range records {
			_, err = db.Pool.Exec(ctx, `
				INSERT INTO cost_reports (account_id, amount_usd, record_date, service_name, resource_name, tag_name)
				VALUES ($1, $2, $3, $4, $5, $6)
				ON CONFLICT (account_id, record_date, service_name, resource_name, tag_name)
				DO UPDATE SET amount_usd = EXCLUDED.amount_usd
			`, id, rec.AmountUSD, rec.Date.Format("2006-01-02"), rec.ServiceName, rec.ResourceName, rec.TagName)
			if err != nil {
				log.Printf("Failed to upsert cost record for %s: %v", accountName, err)
			}
		}

		// Only do anomaly/budget check for daily fetches (where start is yesterday)
		isDaily := start.After(time.Now().AddDate(0, 0, -3))
		if !isDaily {
			continue
		}

		// 4. Anomaly Check (Alerts)
		var dayTotal float64
		for _, rec := range records {
			dayTotal += rec.AmountUSD
		}
		// ... (rest of alerting logic remains the same)

		// check if config exists
		var channel, webhookURL string
		var weeklyThreshold float64
		err = db.Pool.QueryRow(ctx, `
			SELECT channel, webhook_url, weekly_threshold 
			FROM alert_configs 
			WHERE account_id = $1 
			LIMIT 1`, id).Scan(&channel, &webhookURL, &weeklyThreshold)

		if err != nil {
			log.Printf("No alert config (or error) for %s: %v", accountName, err)
		}

		if err == nil {
			// A. Threshold Alert
			if weeklyThreshold > 0 {
				weekTotal, err := db.GetWeeklyTotalCost(ctx, id)
				if err == nil && weekTotal > weeklyThreshold {
					log.Printf("ALERT! Account %s exceeded weekly threshold (%.2f > %.2f)", accountName, weekTotal, weeklyThreshold)
					msg := fmt.Sprintf("🚨 *CloudGazer Weekly Limit Exceeded* 🚨\nAccount: *%s* (%s)\n- Current Week Total: *$%.2f*\n- Weekly Limit: *$%.2f*", accountName, provider, weekTotal, weeklyThreshold)
					sendAlert(channel, webhookURL, accountName, msg)
				}
			}

			// B. Anomaly Detection (> 20% of 7-day average)
			avg7Day, err := db.Get7DayAverageCost(ctx, id)
			if err == nil && avg7Day > 0 {
				if dayTotal > (avg7Day * 1.2) {
					log.Printf("ANOMALY! Account %s cost surged (%.2f vs avg %.2f)", accountName, dayTotal, avg7Day)
					msg := fmt.Sprintf("⚠️ *CloudGazer Anomaly Detected* ⚠️\nAccount: *%s* (%s)\n- Today's Usage: *$%.2f*\n- 7-Day Average: *$%.2f*\n- Surge: *+%.1f%%*",
						accountName, provider, dayTotal, avg7Day, ((dayTotal/avg7Day)-1)*100)
					sendAlert(channel, webhookURL, accountName, msg)
				}
			}

			// C. Monthly Budget Alert
			var budgetAmount float64
			err = db.Pool.QueryRow(ctx, "SELECT amount FROM budgets WHERE account_id = $1 AND is_active = true LIMIT 1", id).Scan(&budgetAmount)
			if err == nil && budgetAmount > 0 {
				monthTotal, err := db.GetCurrentMonthTotal(ctx, id)
				if err == nil {
					// We only alert if it crosses the threshold today.
					// This is a bit tricky to do perfectly without tracking "last alerted percentage",
					// but for now we just alert if the total is in the range.
					// To avoid spamming, we could check if yesterday's total was below and today's is above.
					// For simplicity, we just alert if today's fetch pushed it over a milestone.

					yesterdayTotal := monthTotal - dayTotal
					milestones := []float64{0.5, 0.8, 1.0}
					for _, m := range milestones {
						threshold := budgetAmount * m
						if yesterdayTotal < threshold && monthTotal >= threshold {
							log.Printf("BUDGET ALERT! Account %s reached %.0f%% of budget", accountName, m*100)
							msg := fmt.Sprintf("💰 *CloudGazer Budget Milestone* 💰\nAccount: *%s* (%s)\n- Usage: *%.0f%%* ($%.2f / $%.2f)",
								accountName, provider, m*100, monthTotal, budgetAmount)
							sendAlert(channel, webhookURL, accountName, msg)
						}
					}
				}
			}
		}
	}

	log.Println("Daily Cost Fetch completed successfully.")
	return nil
}

func sendAlert(channel, webhookURL, accountName, msg string) {
	n, err := notifier.NewNotifier(channel, webhookURL)
	if err != nil {
		log.Printf("Failed to init notifier for %s: %v", accountName, err)
		return
	}
	if err := n.SendAlert(msg); err != nil {
		log.Printf("Failed to send alert for %s: %v", accountName, err)
	} else {
		log.Printf("Successfully sent %s alert for %s", channel, accountName)
	}
}
