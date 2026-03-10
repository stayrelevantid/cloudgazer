package notifier

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
)

// Notifier defines the interface for an alerting channel
type Notifier interface {
	SendAlert(message string) error
}

func NewNotifier(channel string, webhookURL string) (Notifier, error) {
	switch channel {
	case "slack":
		return &SlackNotifier{WebhookURL: webhookURL}, nil
	case "telegram":
		// Expect webhookURL to be in the format: "https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<CHAT_ID>"
		return &TelegramNotifier{Endpoint: webhookURL}, nil
	default:
		return nil, fmt.Errorf("unsupported notifier channel: %s", channel)
	}
}

// Ensure interface implementations
var _ Notifier = (*SlackNotifier)(nil)
var _ Notifier = (*TelegramNotifier)(nil)

// -- Slack --

type SlackNotifier struct {
	WebhookURL string
}

func (s *SlackNotifier) SendAlert(message string) error {
	payload := map[string]string{
		"text": message,
	}
	body, _ := json.Marshal(payload)

	resp, err := http.Post(s.WebhookURL, "application/json", bytes.NewBuffer(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("slack webhook returned status: %d", resp.StatusCode)
	}
	return nil
}

// -- Telegram --

type TelegramNotifier struct {
	Endpoint string
}

func (t *TelegramNotifier) SendAlert(message string) error {
	// Parse the URL to inject parse_mode
	u, err := url.Parse(t.Endpoint)
	if err != nil {
		return fmt.Errorf("invalid telegram endpoint: %v", err)
	}

	q := u.Query()
	q.Set("text", message)
	q.Set("parse_mode", "Markdown") // Support markdown formatting
	u.RawQuery = q.Encode()

	resp, err := http.Get(u.String())
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("telegram webhook returned status: %d", resp.StatusCode)
	}
	return nil
}
