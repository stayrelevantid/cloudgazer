package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/jackc/pgx/v5"
)

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is not set")
	}

	conn, err := pgx.Connect(context.Background(), dbURL)
	if err != nil {
		log.Fatalf("Unable to connect to database: %v\n", err)
	}
	defer conn.Close(context.Background())

	ctx := context.Background()

	log.Println("Starting Phase 1: Database Cleanup...")

	// 1. Delete associated data first to avoid FK constraints
	log.Println("Cleaning up reports and configs associated with mock accounts...")
	
	// Delete Alert Configs for Mock Accounts
	res, err := conn.Exec(ctx, "DELETE FROM alert_configs WHERE account_id IN (SELECT id FROM cloud_accounts WHERE aws_ssm_path LIKE 'TEST_MOCK_%')")
	if err != nil {
		log.Fatalf("Failed to delete mock alert configs: %v", err)
	}
	log.Printf("Deleted %d mock alert configs.\n", res.RowsAffected())

	// Delete Cost Reports for Mock Accounts
	res, err = conn.Exec(ctx, "DELETE FROM cost_reports WHERE account_id IN (SELECT id FROM cloud_accounts WHERE aws_ssm_path LIKE 'TEST_MOCK_%')")
	if err != nil {
		log.Fatalf("Failed to delete mock cost reports: %v", err)
	}
	log.Printf("Deleted %d mock cost reports.\n", res.RowsAffected())

	// 2. Delete Mock Accounts
	log.Println("Deleting mock accounts (TEST_MOCK_%s)...")
	res, err = conn.Exec(ctx, "DELETE FROM cloud_accounts WHERE aws_ssm_path LIKE 'TEST_MOCK_%'")
	if err != nil {
		log.Fatalf("Failed to delete mock accounts: %v", err)
	}
	log.Printf("Deleted %d mock accounts.\n", res.RowsAffected())

	// 3. Final cleanup of any other orphaned data (if any)
	log.Println("Performing final cleanup of orphaned data...")
	conn.Exec(ctx, "DELETE FROM cost_reports WHERE account_id NOT IN (SELECT id FROM cloud_accounts)")
	conn.Exec(ctx, "DELETE FROM alert_configs WHERE account_id NOT IN (SELECT id FROM cloud_accounts)")

	fmt.Println("Phase 1 Cleanup complete! Database is ready for real cloud data.")
}
