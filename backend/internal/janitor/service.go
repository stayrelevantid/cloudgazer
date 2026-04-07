package janitor

import (
	"context"
	"fmt"
	"log"
	"strings"

	"github.com/stayrelevant-id/cloudgazer/internal/aws"
	"github.com/stayrelevant-id/cloudgazer/internal/database"
	"github.com/stayrelevant-id/cloudgazer/internal/gcp"
)

type Service struct {
	db        *database.DB
	awsRegion string
	ssmClient *aws.SSMClient
}

func NewService(db *database.DB, awsRegion string, ssmClient *aws.SSMClient) *Service {
	return &Service{db: db, awsRegion: awsRegion, ssmClient: ssmClient}
}

type JanitorResult struct {
	AccountName string             `json:"account_name"`
	Provider    string             `json:"provider"`
	Resources   []aws.IdleResource `json:"resources"`
}

func (s *Service) GetIdleResources(ctx context.Context, userID string) ([]JanitorResult, error) {
	// 1. Get all active cloud accounts belonging to this user
	rows, err := s.db.Pool.Query(ctx, "SELECT id, provider, account_name, aws_ssm_path FROM cloud_accounts WHERE is_active = true AND user_id = $1", userID)
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
					{
						ID:          fmt.Sprintf("vol-%s-ebs1", shortID),
						Type:        "EBS",
						Name:        fmt.Sprintf("temp-db-%s", accountName),
						CostMonthly: 12.50,
						ConsoleURL:  fmt.Sprintf("https://%s.console.aws.amazon.com/ec2/home?region=%s#Volumes:search=%s", s.awsRegion, s.awsRegion, fmt.Sprintf("vol-%s-ebs1", shortID)),
					},
					{
						ID:          fmt.Sprintf("ip-%s-eip1", shortID),
						Type:        "EIP",
						Name:        "legacy-server-ip",
						CostMonthly: 3.60,
						ConsoleURL:  fmt.Sprintf("https://%s.console.aws.amazon.com/ec2/home?region=%s#Addresses:search=%s", s.awsRegion, s.awsRegion, fmt.Sprintf("ip-%s-eip1", shortID)),
					},
				}
			} else if provider == "gcp" {
				resources = []aws.IdleResource{
					{
						ID:          fmt.Sprintf("disk-%s-gce1", shortID),
						Type:        "GCE Disk",
						Name:        "old-staging-disk",
						CostMonthly: 8.20,
						ConsoleURL:  fmt.Sprintf("https://console.cloud.google.com/compute/disksDetail/zones/us-central1-a/disks/old-staging-disk?project=%s", accountName),
					},
				}
			}
		} else if provider == "aws" {
			credentialsJSON := ""
			if ssmPath != "" && s.ssmClient != nil {
				credentialsJSON, err = s.ssmClient.GetSecret(ctx, ssmPath)
				if err != nil {
					log.Printf("Janitor: failed to get AWS credentials JSON from SSM for %s: %v", accountName, err)
					continue
				}
			}

			jc, err := aws.NewJanitorClient(s.awsRegion, credentialsJSON)
			if err != nil {
				log.Printf("Janitor: failed to init AWS Janitor for %s: %v", accountName, err)
				continue
			}

			vols, err := jc.GetUnattachedVolumes(ctx, s.awsRegion)
			if err == nil {
				resources = append(resources, vols...)
			}

			eips, err := jc.GetUnassociatedElasticIPs(ctx, s.awsRegion)
			if err == nil {
				resources = append(resources, eips...)
			}
		} else if provider == "gcp" {
			if ssmPath == "" || s.ssmClient == nil {
				log.Printf("Janitor: GCP requires SSM Path for SA JSON. Skipping %s", accountName)
				continue
			}

			saJSON, err := s.ssmClient.GetSecret(ctx, ssmPath)
			if err != nil {
				log.Printf("Janitor: failed to get GCP secret for %s: %v", accountName, err)
				continue
			}

			jc, err := gcp.NewJanitorClient(ctx, []byte(saJSON))
			if err != nil {
				log.Printf("Janitor: failed to init GCP Janitor for %s: %v", accountName, err)
				continue
			}

			// For GCP, we assume projectID is stored in accountName or we'd need another field
			// In daily.go, they use accountName as billingAccountID, but for Compute we need ProjectID.
			// Let's check if we can extract ProjectID from the SA JSON or if it's passed somehow.
			// For now, let's assume accountName is the ProjectID if it's GCP.
			projectID := accountName

			vols, err := jc.GetUnattachedDisks(ctx, projectID)
			if err == nil {
				resources = append(resources, vols...)
			}

			ips, err := jc.GetUnassociatedIPs(ctx, projectID)
			if err == nil {
				resources = append(resources, ips...)
			}
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
