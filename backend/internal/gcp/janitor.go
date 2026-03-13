package gcp

import (
	"context"
	"fmt"
	"strings"

	"github.com/stayrelevant-id/cloudgazer/internal/aws"
	"google.golang.org/api/compute/v1"
	"google.golang.org/api/option"
)

type JanitorClient struct {
	service *compute.Service
}

func NewJanitorClient(ctx context.Context, serviceAccountJSON []byte) (*JanitorClient, error) {
	service, err := compute.NewService(ctx, option.WithCredentialsJSON(serviceAccountJSON))
	if err != nil {
		return nil, fmt.Errorf("failed to create GCP compute service: %w", err)
	}
	return &JanitorClient{service: service}, nil
}

func (j *JanitorClient) GetUnattachedDisks(ctx context.Context, projectID string) ([]aws.IdleResource, error) {
	var idle []aws.IdleResource
	req := j.service.Disks.AggregatedList(projectID)
	err := req.Pages(ctx, func(res *compute.DiskAggregatedList) error {
		for _, scopedList := range res.Items {
			for _, disk := range scopedList.Disks {
				// len(disk.Users) == 0 means the disk is not attached to any VM
				if len(disk.Users) == 0 {
					// Zone is in format "https://.../zones/us-central1-a"
					zoneParts := strings.Split(disk.Zone, "/")
					zone := zoneParts[len(zoneParts)-1]
					idle = append(idle, aws.IdleResource{
						ID:         fmt.Sprintf("%d", disk.Id),
						Type:       "GCE Disk",
						Name:       disk.Name,
						ConsoleURL: fmt.Sprintf("https://console.cloud.google.com/compute/disksDetail/zones/%s/disks/%s?project=%s", zone, disk.Name, projectID),
					})
				}
			}
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list GCP disks: %w", err)
	}
	return idle, nil
}

func (j *JanitorClient) GetUnassociatedIPs(ctx context.Context, projectID string) ([]aws.IdleResource, error) {
	var idle []aws.IdleResource
	req := j.service.Addresses.AggregatedList(projectID)
	err := req.Pages(ctx, func(res *compute.AddressAggregatedList) error {
		for _, scopedList := range res.Items {
			for _, addr := range scopedList.Addresses {
				// Status RESERVED and no Users means it's an unassociated static IP
				if addr.Status == "RESERVED" && len(addr.Users) == 0 {
					// Region is in format "https://.../regions/us-central1"
					regionParts := strings.Split(addr.Region, "/")
					region := regionParts[len(regionParts)-1]
					idle = append(idle, aws.IdleResource{
						ID:         addr.Address,
						Type:       "Static IP",
						Name:       addr.Name,
						ConsoleURL: fmt.Sprintf("https://console.cloud.google.com/networking/addresses/details/%s/%s?project=%s", region, addr.Name, projectID),
					})
				}
			}
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list GCP addresses: %w", err)
	}
	return idle, nil
}
