package cloudflare

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const defaultAPIBase = "https://api.cloudflare.com/client/v4"
const defaultDoHEndpoint = "https://cloudflare-dns.com/dns-query"

// Client encapsula chamadas à API da Cloudflare.
type Client struct {
	httpClient *http.Client
	apiToken   string
	zoneID     string
	baseURL    string
	dohURL     string
}

// Config descreve credenciais essenciais para o cliente.
type Config struct {
	APIToken string
	ZoneID   string
	APIBase  string
	DoHURL   string
}

// New cria um novo cliente utilizando API Token.
func New(cfg Config) (*Client, error) {
	if strings.TrimSpace(cfg.APIToken) == "" {
		return nil, errors.New("cloudflare: api token obrigatório")
	}
	if strings.TrimSpace(cfg.ZoneID) == "" {
		return nil, errors.New("cloudflare: zone id obrigatório")
	}

	apiBase := strings.TrimSpace(cfg.APIBase)
	if apiBase == "" {
		apiBase = defaultAPIBase
	}

	doh := strings.TrimSpace(cfg.DoHURL)
	if doh == "" {
		doh = defaultDoHEndpoint
	}

	return &Client{
		httpClient: &http.Client{Timeout: 15 * time.Second},
		apiToken:   cfg.APIToken,
		zoneID:     cfg.ZoneID,
		baseURL:    strings.TrimRight(apiBase, "/"),
		dohURL:     doh,
	}, nil
}

// EnsureCNAME cria ou atualiza um registro CNAME para o nome informado.
func (c *Client) EnsureCNAME(ctx context.Context, name, target string, proxied bool, ttl int) (string, error) {
	if ttl <= 0 {
		ttl = 3600
	}
	normalizedName := strings.TrimSpace(name)
	if normalizedName == "" {
		return "", errors.New("cloudflare: nome do CNAME vazio")
	}
	normalizedTarget := strings.TrimSuffix(strings.TrimSpace(target), ".")
	if normalizedTarget == "" {
		return "", errors.New("cloudflare: target do CNAME vazio")
	}

	existing, err := c.findCNAME(ctx, normalizedName)
	if err != nil {
		return "", err
	}
	if existing != nil {
		if strings.EqualFold(strings.TrimSuffix(existing.Content, "."), normalizedTarget) && existing.Proxied == proxied && existing.TTL == ttl {
			return existing.ID, nil
		}
		if err := c.updateRecord(ctx, existing.ID, normalizedName, normalizedTarget, proxied, ttl); err != nil {
			return "", err
		}
		return existing.ID, nil
	}

	recordID, err := c.createRecord(ctx, normalizedName, normalizedTarget, proxied, ttl)
	if err != nil {
		return "", err
	}
	return recordID, nil
}

// CheckCNAMEPropagation consulta DNS over HTTPS para verificar se o CNAME já aponta para o destino esperado.
func (c *Client) CheckCNAMEPropagation(ctx context.Context, fqdn, expected string) (bool, error) {
	q := url.Values{}
	q.Set("name", fqdn)
	q.Set("type", "CNAME")

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.dohURL+"?"+q.Encode(), nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("accept", "application/dns-json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return false, fmt.Errorf("cloudflare doh: status %d", resp.StatusCode)
	}

	var payload struct {
		Answer []struct {
			Data string `json:"data"`
		} `json:"Answer"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return false, err
	}

	normalizedExpected := strings.TrimSuffix(strings.ToLower(expected), ".")
	for _, ans := range payload.Answer {
		candidate := strings.TrimSuffix(strings.ToLower(ans.Data), ".")
		if candidate == normalizedExpected {
			return true, nil
		}
	}

	return false, nil
}

func (c *Client) createRecord(ctx context.Context, name, target string, proxied bool, ttl int) (string, error) {
	endpoint := fmt.Sprintf("%s/zones/%s/dns_records", c.baseURL, c.zoneID)
	body := map[string]any{
		"type":    "CNAME",
		"name":    name,
		"content": target,
		"proxied": proxied,
		"ttl":     ttl,
	}

	req, err := c.newRequest(ctx, http.MethodPost, endpoint, body)
	if err != nil {
		return "", err
	}

	var resp struct {
		Success bool       `json:"success"`
		Errors  []apiError `json:"errors"`
		Result  struct {
			ID string `json:"id"`
		} `json:"result"`
	}

	if err := c.do(req, &resp); err != nil {
		return "", err
	}
	if !resp.Success {
		return "", joinAPIErrors(resp.Errors)
	}
	return resp.Result.ID, nil
}

func (c *Client) updateRecord(ctx context.Context, recordID, name, target string, proxied bool, ttl int) error {
	endpoint := fmt.Sprintf("%s/zones/%s/dns_records/%s", c.baseURL, c.zoneID, recordID)
	body := map[string]any{
		"type":    "CNAME",
		"name":    name,
		"content": target,
		"proxied": proxied,
		"ttl":     ttl,
	}

	req, err := c.newRequest(ctx, http.MethodPut, endpoint, body)
	if err != nil {
		return err
	}

	var resp struct {
		Success bool       `json:"success"`
		Errors  []apiError `json:"errors"`
	}
	if err := c.do(req, &resp); err != nil {
		return err
	}
	if !resp.Success {
		return joinAPIErrors(resp.Errors)
	}
	return nil
}

func (c *Client) findCNAME(ctx context.Context, name string) (*dnsRecord, error) {
	endpoint := fmt.Sprintf("%s/zones/%s/dns_records?type=CNAME&name=%s", c.baseURL, c.zoneID, url.QueryEscape(name))
	req, err := c.newRequest(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}

	var resp struct {
		Success bool        `json:"success"`
		Errors  []apiError  `json:"errors"`
		Result  []dnsRecord `json:"result"`
	}
	if err := c.do(req, &resp); err != nil {
		return nil, err
	}
	if !resp.Success {
		return nil, joinAPIErrors(resp.Errors)
	}
	if len(resp.Result) == 0 {
		return nil, nil
	}
	return &resp.Result[0], nil
}

func (c *Client) newRequest(ctx context.Context, method, endpoint string, body any) (*http.Request, error) {
	var (
		req *http.Request
		err error
	)
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		req, err = http.NewRequestWithContext(ctx, method, endpoint, bytes.NewReader(payload))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/json")
	} else {
		req, err = http.NewRequestWithContext(ctx, method, endpoint, nil)
		if err != nil {
			return nil, err
		}
	}

	req.Header.Set("Authorization", "Bearer "+c.apiToken)
	req.Header.Set("Accept", "application/json")
	return req, nil
}

func (c *Client) do(req *http.Request, v any) error {
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("cloudflare api: status %d", resp.StatusCode)
	}

	if v == nil {
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(v)
}

type dnsRecord struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Name     string `json:"name"`
	Content  string `json:"content"`
	TTL      int    `json:"ttl"`
	Proxied  bool   `json:"proxied"`
	ZoneName string `json:"zone_name"`
}

type apiError struct {
	Message string `json:"message"`
}

func (a apiError) Error() string {
	if strings.TrimSpace(a.Message) == "" {
		return "cloudflare: erro desconhecido"
	}
	return a.Message
}

func joinAPIErrors(errs []apiError) error {
	if len(errs) == 0 {
		return errors.New("cloudflare: resposta sem sucesso")
	}
	messages := make([]string, 0, len(errs))
	for _, err := range errs {
		messages = append(messages, err.Error())
	}
	return errors.New(strings.Join(messages, "; "))
}
