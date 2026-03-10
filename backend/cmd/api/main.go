package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/joho/godotenv"
	"github.com/stayrelevant-id/cloudgazer/internal/aws"
	"github.com/stayrelevant-id/cloudgazer/internal/cron"
	"github.com/stayrelevant-id/cloudgazer/internal/database"
)

func main() {
	// Load .env file if exists
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, relying on environment variables")
	}

	var db *database.DB
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
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

	// Initialize AWS SSM Client
	awsRegion := os.Getenv("AWS_REGION")
	if awsRegion == "" {
		awsRegion = "ap-southeast-1" // fallback default
	}

	ssmClient, err := aws.NewSSMClient(awsRegion)
	if err != nil {
		log.Printf("Failed to initialize AWS SSM client: %v", err)
	} else {
		log.Println("Successfully initialized AWS SSM Client")
		_ = ssmClient // To avoid unused variable error
	}

	// Setup Standard Router
	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status": "UP"}`))
	})

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
			log.Printf("Cron Fetch Failed: %v", err)
			http.Error(w, "Fetcher failed", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status": "success"}`))
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server is running on port %s", port)
	if err := http.ListenAndServe(fmt.Sprintf(":%s", port), mux); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
