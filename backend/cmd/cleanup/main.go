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

	// 1. Delete Mock Accounts
	log.Println("Deleting mock accounts (TEST_MOCK_%s)...")
	res, err := conn.Exec(ctx, "DELETE FROM cloud_accounts WHERE aws_ssm_path LIKE 'TEST_MOCK_%'")
	if err != nil {
		log.Fatalf("Failed to delete mock accounts: %v", err)
	}
	log.Printf("Deleted %d mock accounts.\n", res.RowsAffected())

	// 2. Clean Orphaned Reports
	log.Println("Cleaning orphaned cost reports...")
	res, err = conn.Exec(ctx, "DELETE FROM cost_reports WHERE account_id NOT IN (SELECT id FROM cloud_accounts)")
	if err != nil {
		log.Fatalf("Failed to clean orphaned reports: %v", err)
	}
	log.Printf("Deleted %d orphaned cost reports.\n", res.RowsAffected())

	// 3. Reset Alert Configs
	log.Println("Resetting orphaned alert configs...")
	res, err = conn.Exec(ctx, "DELETE FROM alert_configs WHERE account_id NOT IN (SELECT id FROM cloud_accounts)")
	if err != nil {
		log.Fatalf("Failed to reset alert configs: %v", err)
	}
	log.Printf("Deleted %d orphaned alert configs.\n", res.RowsAffected())

	fmt.Println("Phase 1 Cleanup complete! Database is ready for real cloud data.")
}
