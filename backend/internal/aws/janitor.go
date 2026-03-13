package aws

import (
	"context"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
	"github.com/aws/aws-sdk-go-v2/service/ec2/types"
)

type JanitorClient struct {
	client *ec2.Client
}

func NewJanitorClient(region string) (*JanitorClient, error) {
	ctx := context.TODO()
	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(region))
	if err != nil {
		return nil, fmt.Errorf("unable to load AWS config for Janitor: %w", err)
	}

	client := ec2.NewFromConfig(cfg)
	return &JanitorClient{client: client}, nil
}

type IdleResource struct {
	ID          string  `json:"id"`
	Type        string  `json:"type"` // "EBS" or "EIP"
	Name        string  `json:"name"`
	LaunchTime  string  `json:"launch_time,omitempty"`
	CostMonthly float64 `json:"cost_monthly,omitempty"`
	ConsoleURL  string  `json:"console_url,omitempty"`
}

func (j *JanitorClient) GetUnattachedVolumes(ctx context.Context, region string) ([]IdleResource, error) {
	input := &ec2.DescribeVolumesInput{
		Filters: []types.Filter{
			{
				Name:   aws.String("status"),
				Values: []string{"available"},
			},
		},
	}

	result, err := j.client.DescribeVolumes(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("failed to describe volumes: %w", err)
	}

	var idle []IdleResource
	for _, vol := range result.Volumes {
		name := ""
		for _, tag := range vol.Tags {
			if *tag.Key == "Name" {
				name = *tag.Value
				break
			}
		}
		idle = append(idle, IdleResource{
			ID:         *vol.VolumeId,
			Type:       "EBS",
			Name:       name,
			ConsoleURL: fmt.Sprintf("https://%s.console.aws.amazon.com/ec2/home?region=%s#Volumes:search=%s", region, region, *vol.VolumeId),
		})
	}
	return idle, nil
}

func (j *JanitorClient) GetUnassociatedElasticIPs(ctx context.Context, region string) ([]IdleResource, error) {
	input := &ec2.DescribeAddressesInput{}
	result, err := j.client.DescribeAddresses(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("failed to describe addresses: %w", err)
	}

	var idle []IdleResource
	for _, addr := range result.Addresses {
		if addr.AssociationId == nil {
			name := ""
			for _, tag := range addr.Tags {
				if *tag.Key == "Name" {
					name = *tag.Value
					break
				}
			}
			idle = append(idle, IdleResource{
				ID:         *addr.PublicIp,
				Type:       "EIP",
				Name:       name,
				ConsoleURL: fmt.Sprintf("https://%s.console.aws.amazon.com/ec2/home?region=%s#Addresses:search=%s", region, region, *addr.PublicIp),
			})
		}
	}
	return idle, nil
}
