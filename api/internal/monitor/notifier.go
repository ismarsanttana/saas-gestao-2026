package monitor

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"
)

// Notifier envia alertas para canais externos.
type Notifier interface {
	Notify(ctx context.Context, msg AlertMessage) error
}

type AlertMessage struct {
	Title    string
	Text     string
	Severity string
}

type SlackNotifier struct {
	webhookURL string
	client     *http.Client
}

func NewSlackNotifier(webhookURL string) *SlackNotifier {
	if webhookURL == "" {
		return nil
	}
	return &SlackNotifier{
		webhookURL: webhookURL,
		client:     &http.Client{Timeout: 5 * time.Second},
	}
}

func (s *SlackNotifier) Notify(ctx context.Context, msg AlertMessage) error {
	if s == nil || s.webhookURL == "" {
		return errors.New("slack notifier not configured")
	}

	payload := map[string]any{
		"text": formatSlackMessage(msg),
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.webhookURL, bytes.NewBuffer(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return errors.New("slack notification failed")
	}
	return nil
}

func formatSlackMessage(msg AlertMessage) string {
	emoji := ":information_source:"
	switch msg.Severity {
	case "warning":
		emoji = ":warning:"
	case "critical":
		emoji = ":rotating_light:"
	}
	if msg.Title != "" {
		return emoji + " *" + msg.Title + "*\n" + msg.Text
	}
	return emoji + " " + msg.Text
}
