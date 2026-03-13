package fetcher

import (
	"context"
	"fmt"
	"time"

	"google.golang.org/api/cloudbilling/v1"
	"google.golang.org/api/option"
)

type GCPFetcher struct{}

func NewGCPFetcher() *GCPFetcher {
	return &GCPFetcher{}
}

// FetchCost pulls GCP costs for a given billingAccountID.
// It uses serviceAccountJSON provided from AWS SSM to authenticate.
func (g *GCPFetcher) FetchCost(ctx context.Context, serviceAccountJSON []byte, billingAccountID string, start, end time.Time) ([]CostRecord, error) {
	client, err := cloudbilling.NewService(ctx, option.WithCredentialsJSON(serviceAccountJSON))
	if err != nil {
		return nil, fmt.Errorf("failed to create GCP billing client: %w", err)
	}

	// billingAccountName format required by API: "billingAccounts/{billing_account_id}"
	accountName := fmt.Sprintf("billingAccounts/%s", billingAccountID)

	// Since Cloud Billing API (Cost Management) lacks a dedicated easy "yesterday's unblended group by" API natively
	// (unlike AWS CE) without BigQuery Export, we are using the Projects API to approximate some structure,
	// but a proper billing API endpoint needs to be used based on what's available.
	// For MVP, we will list the billing account's associated projects to ensure auth works.

	projSvc := cloudbilling.NewBillingAccountsProjectsService(client)
	res, err := projSvc.List(accountName).Do()
	if err != nil {
		return nil, fmt.Errorf("failed to fetch GCP projects for billing account: %w", err)
	}

	var records []CostRecord
	now := time.Now().UTC()
	yesterday := now.AddDate(0, 0, -1)

	// Example generic mock integration returning 0 cost per project attached to the billing account
	// Because Cloud Billing Catalog / Cost API directly doesn't yield grouped cost cleanly without BigQuery
	for _, proj := range res.ProjectBillingInfo {
		records = append(records, CostRecord{
			AmountUSD:   0.0, // Placeholder
			Date:        yesterday,
			ServiceName: proj.ProjectId,
			TagName:     "untagged",
		})
	}

	return records, nil
}
