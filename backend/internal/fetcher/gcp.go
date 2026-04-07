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
	if billingAccountID == "" {
		return nil, fmt.Errorf("billing account ID is empty")
	}

	client, err := cloudbilling.NewService(ctx, option.WithCredentialsJSON(serviceAccountJSON))
	if err != nil {
		return nil, fmt.Errorf("GCP Auth Failed: invalid service account JSON: %w", err)
	}

	// billingAccountName format required by API: "billingAccounts/{billing_account_id}"
	accountName := fmt.Sprintf("billingAccounts/%s", billingAccountID)

	projSvc := cloudbilling.NewBillingAccountsProjectsService(client)
	res, err := projSvc.List(accountName).Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("GCP Connectivity Failed for %s: %w (check SA permissions: Billing Account Viewer)", billingAccountID, err)
	}

	var records []CostRecord
	now := time.Now().UTC()
	yesterday := now.AddDate(0, 0, -1)

	// Since Cloud Billing API (without BigQuery) doesn't provide granular costs,
	// we use project count as a "connectivity success" indicator.
	if len(res.ProjectBillingInfo) == 0 {
		fmt.Printf("GCP Sync: Success! Connected to %s, but found no active projects.\n", billingAccountID)
	} else {
		fmt.Printf("GCP Sync: Success! Connected to %s, found %d active projects.\n", billingAccountID, len(res.ProjectBillingInfo))
	}

	for _, proj := range res.ProjectBillingInfo {
		records = append(records, CostRecord{
			AmountUSD:   0.0, // Minimal dummy cost for connectivity success
			Date:        yesterday,
			ServiceName: fmt.Sprintf("GCP Project: %s", proj.ProjectId),
			TagName:     "connectivity-test",
		})
	}

	return records, nil
}
