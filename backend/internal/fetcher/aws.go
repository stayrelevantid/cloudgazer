package fetcher

import (
	"context"
	"fmt"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials/stscreds"
	"github.com/aws/aws-sdk-go-v2/service/costexplorer"
	ceTypes "github.com/aws/aws-sdk-go-v2/service/costexplorer/types"
	"github.com/aws/aws-sdk-go-v2/service/sts"
)

// CostRecord represents a simplified daily cost grouped by service/tag
type CostRecord struct {
	AmountUSD float64
	Date      time.Time
	Service   string // Used for tag_name in DB
}

type AWSFetcher struct{}

func NewAWSFetcher() *AWSFetcher {
	return &AWSFetcher{}
}

// FetchDailyCost pulls the cost from exactly yesterday grouped by SERVICE.
// If roleARN is not empty, it assumes that role first.
func (f *AWSFetcher) FetchDailyCost(ctx context.Context, region, roleARN string) ([]CostRecord, error) {
	// Load default config (based on environment / SSM logic)
	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(region))
	if err != nil {
		return nil, fmt.Errorf("failed to load AWS config: %w", err)
	}

	// Assume Role if provided
	if roleARN != "" {
		stsClient := sts.NewFromConfig(cfg)
		provider := stscreds.NewAssumeRoleProvider(stsClient, roleARN)
		cfg.Credentials = aws.NewCredentialsCache(provider)
	}

	ceClient := costexplorer.NewFromConfig(cfg)

	// In CE API, End date is exclusive, Start date is inclusive.
	// We want precisely yesterday's data. Wait until the next day to measure full yesterday.
	now := time.Now().UTC()
	yesterday := now.AddDate(0, 0, -1)
	startStr := yesterday.Format("2006-01-02")
	endStr := now.Format("2006-01-02")

	input := &costexplorer.GetCostAndUsageInput{
		TimePeriod: &ceTypes.DateInterval{
			Start: aws.String(startStr),
			End:   aws.String(endStr),
		},
		Granularity: ceTypes.GranularityDaily,
		Metrics:     []string{"UnblendedCost"},
		GroupBy: []ceTypes.GroupDefinition{
			{
				Type: ceTypes.GroupDefinitionTypeDimension,
				Key:  aws.String("SERVICE"),
			},
		},
	}

	out, err := ceClient.GetCostAndUsage(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("failed to get cost and usage: %w", err)
	}

	var records []CostRecord
	for _, res := range out.ResultsByTime {
		recordDate, err := time.Parse("2006-01-02", *res.TimePeriod.Start)
		if err != nil {
			continue // Skip invalid dates
		}

		for _, group := range res.Groups {
			if len(group.Keys) == 0 {
				continue
			}
			serviceName := group.Keys[0]

			valStr := "0"
			if metric, ok := group.Metrics["UnblendedCost"]; ok && metric.Amount != nil {
				valStr = *metric.Amount
			}

			var amount float64
			fmt.Sscanf(valStr, "%f", &amount)

			records = append(records, CostRecord{
				Date:      recordDate,
				Service:   serviceName,
				AmountUSD: amount,
			})
		}
	}

	return records, nil
}
