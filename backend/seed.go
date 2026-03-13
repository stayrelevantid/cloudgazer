package main

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"os"
	"time"

	"github.com/jackc/pgx/v5"
)

type Account struct {
	ID          string
	Name        string
	Provider    string
	SSMPatPath string
}

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgresql://neondb_owner:npg_xyRia2kmhPW9@ep-gentle-dust-a1fj937t-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
	}

	conn, err := pgx.Connect(context.Background(), dbURL)
	if err != nil {
		log.Fatalf("Unable to connect to database: %v\n", err)
	}
	defer conn.Close(context.Background())

	ctx := context.Background()

	log.Println("Cleaning up existing data...")
	conn.Exec(ctx, "TRUNCATE TABLE cost_reports RESTART IDENTITY CASCADE")
	conn.Exec(ctx, "DELETE FROM cloud_accounts")
	conn.Exec(ctx, "DELETE FROM users")

	// 1. Create User
	userID := "user_seed_v1"
	_, err = conn.Exec(ctx, "INSERT INTO users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING", userID, "demo@cloudgazer.io")
	if err != nil {
		log.Fatalf("Failed to create user: %v", err)
	}

	// 2. Define Accounts
	accounts := []Account{
		{ID: "00000000-0000-0000-0000-000000000001", Name: "Production-AWS", Provider: "aws", SSMPatPath: "TEST_MOCK_PROD_AWS_NEW"},
		{ID: "00000000-0000-0000-0000-000000000002", Name: "Staging-AWS", Provider: "aws", SSMPatPath: "TEST_MOCK_STG_AWS_NEW"},
		{ID: "00000000-0000-0000-0000-000000000003", Name: "Core-GCP", Provider: "gcp", SSMPatPath: "TEST_MOCK_CORE_GCP_NEW"},
	}

	for _, acc := range accounts {
		_, err = conn.Exec(ctx, `
			INSERT INTO cloud_accounts (id, user_id, provider, account_name, aws_ssm_path, is_active)
			VALUES ($1, $2, $3, $4, $5, true)
			ON CONFLICT (id) DO NOTHING`,
			acc.ID, userID, acc.Provider, acc.Name, acc.SSMPatPath)
		if err != nil {
			log.Fatalf("Failed to create account %s: %v", acc.Name, err)
		}
	}

	// 3. Define Services & Tags
	awsServices := []string{"Amazon EC2", "Amazon S3", "Amazon RDS", "AWS Lambda", "Amazon DynamoDB"}
	gcpServices := []string{"Compute Engine", "Cloud Storage", "Cloud SQL", "GKE", "BigQuery"}
	projects := []string{"Project:Alpha", "Project:Beta", "Project:Delta", "untagged"}

	// 4. Generate 365 days of data in memory first for batching
	log.Println("Preparing data for 365 days...")
	now := time.Now().UTC()
	
	batch := &pgx.Batch{}

	for i := 0; i < 365; i++ {
		date := now.AddDate(0, 0, -i)
		dateStr := date.Format("2006-01-02")
		
		for _, acc := range accounts {
			services := awsServices
			if acc.Provider == "gcp" {
				services = gcpServices
			}

			for _, svc := range services {
				// Generate a few resources per service
				for rIdx := 0; rIdx < 2; rIdx++ {
					resourceID := fmt.Sprintf("%s-%d", svc, rIdx)
					if svc == "Amazon EC2" {
						resourceID = fmt.Sprintf("i-%010d", rand.Intn(1000000000))
					} else if svc == "Amazon S3" {
						resourceID = fmt.Sprintf("bucket-%d-prod", rand.Intn(1000))
					} else if svc == "Compute Engine" {
						resourceID = fmt.Sprintf("gce-inst-%d", rand.Intn(1000))
					}

					// Pick one project tag for this resource
					tag := projects[rand.Intn(len(projects))]
					
					base := 1.0 + rand.Float64()*15.0
					if svc == "Amazon EC2" || svc == "Compute Engine" || svc == "GKE" {
						base *= 5
					}
					
					fluctuation := 0.9 + rand.Float64()*0.2
					amount := base * fluctuation

					if rand.Float64() < 0.01 { 
						amount *= 5.0
					}

					batch.Queue(`
						INSERT INTO cost_reports (account_id, amount_usd, record_date, service_name, resource_name, tag_name)
						VALUES ($1, $2, $3, $4, $5, $6)`,
						acc.ID, amount, dateStr, svc, resourceID, tag)
				}
			}
		}
	}

	log.Printf("Executing batch insert...")
	br := conn.SendBatch(ctx, batch)
	err = br.Close()
	if err != nil {
		log.Fatalf("Batch execution failed: %v", err)
	}

	fmt.Println("Seeding complete! Dashboard is now rich with data.")
}
