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
)

func RunDailyFetch(ctx context.Context, db *database.DB, ssmClient *aws.SSMClient, awsRegion string) error {
	log.Println("Starting Daily Cost Fetch...")

	// 1. Get all active cloud accounts
	rows, err := db.Pool.Query(ctx, "SELECT id, provider, account_name, aws_ssm_path FROM cloud_accounts WHERE is_active = true")
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

		log.Printf("Processing account: %s (%s)", accountName, provider)

		var records []fetcher.CostRecord
		var err error

		if strings.HasPrefix(ssmPath, "TEST_MOCK_") {
			log.Printf("Using MOCK data for testing account %s", accountName)
			importTime := time.Now().UTC().AddDate(0, 0, -1) // yesterday
			todayTime := time.Now().UTC()
			records = []fetcher.CostRecord{
				{Service: "Amazon EC2 (Mock)", AmountUSD: 120.50, Date: importTime},
				{Service: "Amazon S3 (Mock)", AmountUSD: 30.25, Date: importTime},
				{Service: "Amazon EC2 (Mock)", AmountUSD: 45.10, Date: todayTime},
				{Service: "Amazon S3 (Mock)", AmountUSD: 12.30, Date: todayTime},
			}
		} else if provider == "aws" {
			// For AWS, ssmPath might store the Role ARN
			roleARN := ""
			if ssmPath != "" && ssmClient != nil {
				roleARN, err = ssmClient.GetSecret(ctx, ssmPath)
				if err != nil {
					log.Printf("Failed to get AWS Role ARN from SSM for %s: %v", accountName, err)
					continue
				}
			}
			records, err = awsF.FetchDailyCost(ctx, awsRegion, roleARN)

		} else if provider == "gcp" {
			if ssmPath == "" || ssmClient == nil {
				log.Printf("GCP requires SSM Path to Service Account JSON. Skipping %s", accountName)
				continue
			}
			saJSONStr, err := ssmClient.GetSecret(ctx, ssmPath)
			if err != nil {
				log.Printf("Failed to get GCP SA JSON from SSM for %s: %v", accountName, err)
				continue
			}

			// Normally you'd also need the Billing Account ID. For simplicity, we could store it in accountName
			records, err = gcpF.FetchDailyCost(ctx, []byte(saJSONStr), accountName)
		}

		if err != nil {
			log.Printf("Failed to fetch costs for %s: %v", accountName, err)
			continue
		}

		// 3. Persist to DB (Idempotent)
		for _, rec := range records {
			_, err = db.Pool.Exec(ctx, `
				INSERT INTO cost_reports (account_id, amount_usd, record_date, tag_name) 
				VALUES ($1, $2, $3, $4)
				ON CONFLICT (account_id, record_date, tag_name) 
				DO UPDATE SET amount_usd = EXCLUDED.amount_usd`,
				id, rec.AmountUSD, rec.Date, rec.Service,
			)
			if err != nil {
				log.Printf("Failed to upsert cost record for %s: %v", accountName, err)
			}
		}
		// 4. Anomaly Check (Alerts)
		var dayTotal float64
		for _, rec := range records {
			dayTotal += rec.AmountUSD
		}

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
