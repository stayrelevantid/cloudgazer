package aws

import (
	"context"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ssm"
)

type SSMClient struct {
	client *ssm.Client
}

func NewSSMClient(region string) (*SSMClient, error) {
	ctx := context.TODO()

	// Load default config (reads from ~/.aws/credentials or env vars)
	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(region))
	if err != nil {
		return nil, fmt.Errorf("unable to load AWS config: %w", err)
	}

	client := ssm.NewFromConfig(cfg)

	return &SSMClient{client: client}, nil
}

func (s *SSMClient) GetSecret(ctx context.Context, path string) (string, error) {
	input := &ssm.GetParameterInput{
		Name:           aws.String(path),
		WithDecryption: aws.Bool(true),
	}

	result, err := s.client.GetParameter(ctx, input)
	if err != nil {
		return "", fmt.Errorf("failed to get parameter from SSM: %w", err)
	}

	if result.Parameter == nil || result.Parameter.Value == nil {
		return "", fmt.Errorf("parameter value is nil for path: %s", path)
	}

	return *result.Parameter.Value, nil
}
