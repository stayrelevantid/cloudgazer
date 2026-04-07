package fetcher

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/costexplorer"
	ceTypes "github.com/aws/aws-sdk-go-v2/service/costexplorer/types"
)

// CostRecord represents a simplified daily cost grouped by service and tag
type CostRecord struct {
	ServiceName  string
	ResourceName string // New field
	TagName      string
	AmountUSD    float64
	Date         time.Time
}

type AWSFetcher struct{}

func NewAWSFetcher() *AWSFetcher {
	return &AWSFetcher{}
}

// FetchCost pulls the cost from a date range grouped by SERVICE (and optionally TAG).
// If credentialsJSON is not empty, it parses it and uses it for authentication.
func (f *AWSFetcher) FetchCost(ctx context.Context, region, credentialsJSON, tagKey string, start, end time.Time) ([]CostRecord, error) {
	// Load default config (based on environment / SSM logic)
	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(region))
	if err != nil {
		return nil, fmt.Errorf("failed to load AWS config: %w", err)
	}

	// Use Static Credentials if provided via JSON
	if credentialsJSON != "" {
		var creds struct {
			AccessKeyId     string `json:"AccessKeyId"`
			SecretAccessKey string `json:"SecretAccessKey"`
		}
		if err := json.Unmarshal([]byte(credentialsJSON), &creds); err != nil {
			return nil, fmt.Errorf("failed to parse AWS credentials JSON: %w", err)
		}

		provider := credentials.NewStaticCredentialsProvider(creds.AccessKeyId, creds.SecretAccessKey, "")
		cfg.Credentials = aws.NewCredentialsCache(provider)
	}

	ceClient := costexplorer.NewFromConfig(cfg)

	startStr := start.Format("2006-01-02")
	endStr := end.Format("2006-01-02")

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

	if tagKey != "" {
		input.GroupBy = append(input.GroupBy, ceTypes.GroupDefinition{
			Type: ceTypes.GroupDefinitionTypeTag,
			Key:  aws.String(tagKey),
		})
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
			tagName := "untagged"
			if len(group.Keys) > 1 {
				tagName = group.Keys[1]
				// AWS tags often come back as "Key$Value" or just "Value" depending on version,
				// but in Filter/GroupBy it's usually just the value.
				if strings.Contains(tagName, "$") {
					parts := strings.SplitN(tagName, "$", 2)
					tagName = parts[1]
				}
			}

			valStr := "0"
			if metric, ok := group.Metrics["UnblendedCost"]; ok && metric.Amount != nil {
				valStr = *metric.Amount
			}

			var amount float64
			fmt.Sscanf(valStr, "%f", &amount)

			records = append(records, CostRecord{
				Date:         recordDate,
				ServiceName:  serviceName,
				ResourceName: serviceName, // Default to service name for now
				TagName:      tagName,
				AmountUSD:    amount,
			})
		}
	}

	return records, nil
}
