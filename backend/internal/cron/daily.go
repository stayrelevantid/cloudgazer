package cron

import (
	"context"
	"log"

	"github.com/stayrelevant-id/cloudgazer/internal/aws"
	"github.com/stayrelevant-id/cloudgazer/internal/database"
	"github.com/stayrelevant-id/cloudgazer/internal/fetcher"
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

		if provider == "aws" {
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

		// 3. Persist to DB
		for _, rec := range records {
			_, err = db.Pool.Exec(ctx,
				"INSERT INTO cost_reports (account_id, amount_usd, record_date, tag_name) VALUES ($1, $2, $3, $4)",
				id, rec.AmountUSD, rec.Date, rec.Service,
			)
			if err != nil {
				log.Printf("Failed to insert cost record for %s: %v", accountName, err)
			}
		}
	}

	log.Println("Daily Cost Fetch completed successfully.")
	return nil
}
