package janitor

import (
	"context"
	"fmt"
	"log"
	"strings"

	"github.com/stayrelevant-id/cloudgazer/internal/aws"
	"github.com/stayrelevant-id/cloudgazer/internal/database"
)

type Service struct {
	db        *database.DB
	awsRegion string
}

func NewService(db *database.DB, awsRegion string) *Service {
	return &Service{db: db, awsRegion: awsRegion}
}

type JanitorResult struct {
	AccountName string             `json:"account_name"`
	Provider    string             `json:"provider"`
	Resources   []aws.IdleResource `json:"resources"`
}

func (s *Service) GetIdleResources(ctx context.Context) ([]JanitorResult, error) {
	// 1. Get all active cloud accounts
	rows, err := s.db.Pool.Query(ctx, "SELECT id, provider, account_name, aws_ssm_path FROM cloud_accounts WHERE is_active = true")
	if err != nil {
		return nil, fmt.Errorf("failed to query accounts: %w", err)
	}
	defer rows.Close()

	var results []JanitorResult
	for rows.Next() {
		var id, provider, accountName, ssmPath string
		if err := rows.Scan(&id, &provider, &accountName, &ssmPath); err != nil {
			log.Printf("Janitor: failed to scan account: %v", err)
			continue
		}

		var resources []aws.IdleResource
		if strings.HasPrefix(ssmPath, "TEST_MOCK_") {
			log.Printf("Janitor: using MOCK data for %s", accountName)
			shortID := id[:8]
			if provider == "aws" {
				resources = []aws.IdleResource{
					{ID: fmt.Sprintf("vol-%s-ebs1", shortID), Type: "EBS", Name: fmt.Sprintf("temp-db-%s", accountName), CostMonthly: 12.50},
					{ID: fmt.Sprintf("ip-%s-eip1", shortID), Type: "EIP", Name: "legacy-server-ip", CostMonthly: 3.60},
				}
			} else if provider == "gcp" {
				resources = []aws.IdleResource{
					{ID: fmt.Sprintf("disk-%s-gce1", shortID), Type: "GCE Disk", Name: "old-staging-disk", CostMonthly: 8.20},
				}
			}
		} else if provider == "aws" {
			jc, err := aws.NewJanitorClient(s.awsRegion)
			if err != nil {
				log.Printf("Janitor: failed to init AWS Janitor for %s: %v", accountName, err)
				continue
			}

			vols, err := jc.GetUnattachedVolumes(ctx)
			if err == nil {
				resources = append(resources, vols...)
			}

			eips, err := jc.GetUnassociatedElasticIPs(ctx)
			if err == nil {
				resources = append(resources, eips...)
			}
		} else if provider == "gcp" {
			// GCP Janitor implementation pending
			log.Printf("Janitor: GCP provider not yet supported for %s", accountName)
		}

		if len(resources) > 0 {
			results = append(results, JanitorResult{
				AccountName: accountName,
				Provider:    provider,
				Resources:   resources,
			})
		}
	}
	return results, nil
}
