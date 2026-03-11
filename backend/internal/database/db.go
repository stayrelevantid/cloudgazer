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

type Budget struct {
	ID           string    `json:"id"`
	AccountID    string    `json:"account_id"`
	AccountName  string    `json:"account_name"`
	Provider     string    `json:"provider"`
	Amount       float64   `json:"amount"`
	CurrentSpend float64   `json:"current_spend"`
	IsActive     bool      `json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
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

// GetCurrentMonthTotal returns the sum of costs for the current calendar month
func (db *DB) GetCurrentMonthTotal(ctx context.Context, accountID string) (float64, error) {
	var total float64
	err := db.Pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount_usd), 0)
		FROM cost_reports
		WHERE account_id = $1 
		AND record_date >= DATE_TRUNC('month', CURRENT_DATE)
	`, accountID).Scan(&total)
	return total, err
}

// GetWeeklyTotalCost returns the sum of costs for the current week (starting Monday)
func (db *DB) GetWeeklyTotalCost(ctx context.Context, accountID string) (float64, error) {
	var total float64
	err := db.Pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount_usd), 0)
		FROM cost_reports
		WHERE account_id = $1 
		AND record_date >= DATE_TRUNC('week', CURRENT_DATE)
	`, accountID).Scan(&total)
	return total, err
}

func (db *DB) GetBudgets(ctx context.Context) ([]Budget, error) {
	rows, err := db.Pool.Query(ctx, `
		SELECT 
			b.id, b.account_id, ca.account_name, ca.provider, b.amount, b.is_active, b.created_at, b.updated_at,
			COALESCE((
				SELECT SUM(amount_usd) 
				FROM cost_reports 
				WHERE account_id = b.account_id 
				AND record_date >= DATE_TRUNC('month', CURRENT_DATE)
			), 0) as current_spend
		FROM budgets b
		JOIN cloud_accounts ca ON ca.id = b.account_id
		ORDER BY b.created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var budgets []Budget
	for rows.Next() {
		var b Budget
		if err := rows.Scan(&b.ID, &b.AccountID, &b.AccountName, &b.Provider, &b.Amount, &b.IsActive, &b.CreatedAt, &b.UpdatedAt, &b.CurrentSpend); err != nil {
			return nil, err
		}
		budgets = append(budgets, b)
	}
	return budgets, nil
}

func (db *DB) CreateBudget(ctx context.Context, accountID string, amount float64) error {
	_, err := db.Pool.Exec(ctx, `
		INSERT INTO budgets (account_id, amount, is_active, updated_at)
		VALUES ($1, $2, true, CURRENT_TIMESTAMP)
		ON CONFLICT (account_id) 
		DO UPDATE SET 
			amount = EXCLUDED.amount,
			is_active = true,
			updated_at = CURRENT_TIMESTAMP
	`, accountID, amount)
	return err
}

func (db *DB) DeleteBudget(ctx context.Context, id string) error {
	_, err := db.Pool.Exec(ctx, "DELETE FROM budgets WHERE id = $1", id)
	return err
}
