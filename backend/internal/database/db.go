package database

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type DB struct {
	Pool *pgxpool.Pool
}

func New(connectionString string) (*DB, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	config, err := pgxpool.ParseConfig(connectionString)
	if err != nil {
		return nil, fmt.Errorf("error parsing database connection string: %w", err)
	}

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("unable to connect to database: %w", err)
	}

	// Ping the DB to verify connection
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("database ping failed: %w", err)
	}

	return &DB{Pool: pool}, nil
}

func (db *DB) Close() {
	if db.Pool != nil {
		db.Pool.Close()
	}
}

// Get7DayAverageCost calculates the average daily cost for a given account over the last 7 days
func (db *DB) Get7DayAverageCost(ctx context.Context, accountID string) (float64, error) {
	// Let's get the average of the daily totals for the 7 days prior to today
	// "today" is generally the date the cron is running for (e.g. yesterday's cost)
	// For simplicity, we just look at the last 7 distinct days in cost_reports
	var avgCost float64
	err := db.Pool.QueryRow(ctx, `
		WITH daily_totals AS (
			SELECT record_date, SUM(amount_usd) as daily_total
			FROM cost_reports
			WHERE account_id = $1
			GROUP BY record_date
			ORDER BY record_date DESC
			LIMIT 7
		)
		SELECT COALESCE(AVG(daily_total), 0)
		FROM daily_totals
	`, accountID).Scan(&avgCost)

	if err != nil {
		return 0, err
	}
	return avgCost, nil
}
