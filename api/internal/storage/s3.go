package storage

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

// S3Config descreve parâmetros necessários para assinar requisições compatíveis com S3.
type S3Config struct {
	Endpoint     string
	Region       string
	Bucket       string
	AccessKey    string
	SecretKey    string
	PublicDomain string
	HTTPClient   *http.Client
}

// S3Uploader implementa Upload usando assinatura SigV4.
type S3Uploader struct {
	cfg    S3Config
	client *http.Client
}

// NewS3Uploader cria um uploader pronto para enviar arquivos a um endpoint S3/R2.
func NewS3Uploader(cfg S3Config) (*S3Uploader, error) {
	if err := cfg.validate(); err != nil {
		return nil, err
	}

	client := cfg.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}

	return &S3Uploader{cfg: cfg, client: client}, nil
}

// Upload envia o arquivo para o bucket configurado e retorna URL pública (se disponível).
func (u *S3Uploader) Upload(ctx context.Context, input UploadInput) (*UploadResult, error) {
	if strings.TrimSpace(input.Key) == "" {
		return nil, errors.New("storage: chave do objeto obrigatória")
	}
	if len(input.Body) == 0 {
		return nil, errors.New("storage: corpo vazio")
	}

	contentType := strings.TrimSpace(input.ContentType)
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	endpoint := strings.TrimRight(u.cfg.Endpoint, "/")
	escapedKey := (&url.URL{Path: strings.TrimLeft(input.Key, "/")}).EscapedPath()
	targetURL := fmt.Sprintf("%s/%s/%s", endpoint, u.cfg.Bucket, escapedKey)

	reader := bytes.NewReader(input.Body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, targetURL, reader)
	if err != nil {
		return nil, err
	}

	payloadHash := sha256.Sum256(input.Body)
	payloadHex := hex.EncodeToString(payloadHash[:])

	req.Header.Set("Content-Type", contentType)
	req.ContentLength = int64(len(input.Body))
	if strings.TrimSpace(input.CacheControl) != "" {
		req.Header.Set("Cache-Control", input.CacheControl)
	}
	req.Header.Set("x-amz-content-sha256", payloadHex)
	req.Header.Set("Content-Length", fmt.Sprintf("%d", len(input.Body)))

	if err := signS3Request(req, u.cfg, payloadHex, time.Now().UTC()); err != nil {
		return nil, err
	}

	resp, err := u.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("storage: upload falhou (%d): %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	etag := strings.Trim(resp.Header.Get("ETag"), "\"")

	publicURL := targetURL
	if strings.TrimSpace(u.cfg.PublicDomain) != "" {
		publicURL = fmt.Sprintf("%s/%s", strings.TrimRight(u.cfg.PublicDomain, "/"), escapedKey)
	}

	return &UploadResult{URL: publicURL, ETag: etag}, nil
}

func (cfg S3Config) validate() error {
	if strings.TrimSpace(cfg.Endpoint) == "" {
		return errors.New("storage: endpoint do S3 ausente")
	}
	if strings.TrimSpace(cfg.Region) == "" {
		return errors.New("storage: região do S3 ausente")
	}
	if strings.TrimSpace(cfg.Bucket) == "" {
		return errors.New("storage: bucket do S3 ausente")
	}
	if strings.TrimSpace(cfg.AccessKey) == "" {
		return errors.New("storage: access key ausente")
	}
	if strings.TrimSpace(cfg.SecretKey) == "" {
		return errors.New("storage: secret key ausente")
	}
	if !strings.HasPrefix(cfg.Endpoint, "http://") && !strings.HasPrefix(cfg.Endpoint, "https://") {
		return errors.New("storage: endpoint deve incluir protocolo http/https")
	}
	return nil
}

func signS3Request(req *http.Request, cfg S3Config, payloadHash string, now time.Time) error {
	amzDate := now.UTC().Format("20060102T150405Z")
	dateStamp := now.UTC().Format("20060102")

	req.Header.Set("x-amz-date", amzDate)
	req.Header.Set("Host", req.URL.Host)

	canonicalURI := canonicalURI(req.URL.Path)
	canonicalQuery := canonicalQueryString(req.URL.Query())

	headers, signedHeaders := canonicalHeaders(req.Header)
	canonicalRequest := strings.Join([]string{
		req.Method,
		canonicalURI,
		canonicalQuery,
		headers,
		signedHeaders,
		payloadHash,
	}, "\n")

	hashedCanonical := sha256.Sum256([]byte(canonicalRequest))
	hexCanonical := hex.EncodeToString(hashedCanonical[:])

	credentialScope := fmt.Sprintf("%s/%s/s3/aws4_request", dateStamp, cfg.Region)
	stringToSign := strings.Join([]string{
		"AWS4-HMAC-SHA256",
		amzDate,
		credentialScope,
		hexCanonical,
	}, "\n")

	signingKey := deriveSigningKey(cfg.SecretKey, dateStamp, cfg.Region, "s3")
	signature := hmacSHA256(signingKey, []byte(stringToSign))
	signatureHex := hex.EncodeToString(signature)

	authorization := fmt.Sprintf(
		"AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		cfg.AccessKey,
		credentialScope,
		signedHeaders,
		signatureHex,
	)

	req.Header.Set("Authorization", authorization)
	return nil
}

func canonicalURI(path string) string {
	if path == "" {
		return "/"
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	return uriEncode(path, false)
}

func canonicalQueryString(values url.Values) string {
	if len(values) == 0 {
		return ""
	}
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	var parts []string
	for _, key := range keys {
		vals := values[key]
		sort.Strings(vals)
		for _, v := range vals {
			parts = append(parts, fmt.Sprintf("%s=%s", uriEncode(key, true), uriEncode(v, true)))
		}
	}
	return strings.Join(parts, "&")
}

func canonicalHeaders(h http.Header) (string, string) {
	type header struct {
		key   string
		value string
	}

	merged := make(map[string][]string)
	for k, vals := range h {
		lower := strings.ToLower(k)
		if lower == "authorization" {
			continue
		}
		merged[lower] = append(merged[lower], vals...)
	}

	if _, ok := merged["host"]; !ok {
		merged["host"] = []string{h.Get("Host")}
	}
	if _, ok := merged["x-amz-content-sha256"]; !ok {
		merged["x-amz-content-sha256"] = []string{h.Get("x-amz-content-sha256")}
	}
	if _, ok := merged["x-amz-date"]; !ok {
		merged["x-amz-date"] = []string{h.Get("x-amz-date")}
	}

	list := make([]header, 0, len(merged))
	for k, vals := range merged {
		sanitized := make([]string, 0, len(vals))
		for _, v := range vals {
			sanitized = append(sanitized, strings.TrimSpace(v))
		}
		list = append(list, header{key: k, value: strings.Join(sanitized, ",")})
	}

	sort.Slice(list, func(i, j int) bool {
		return list[i].key < list[j].key
	})

	headerLines := make([]string, len(list))
	signedHeaders := make([]string, len(list))
	for i, item := range list {
		headerLines[i] = fmt.Sprintf("%s:%s", item.key, item.value)
		signedHeaders[i] = item.key
	}

	return strings.Join(headerLines, "\n") + "\n", strings.Join(signedHeaders, ";")
}

func uriEncode(input string, encodeSlash bool) string {
	var builder strings.Builder
	for i := 0; i < len(input); i++ {
		c := input[i]
		if (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' || c == '~' {
			builder.WriteByte(c)
			continue
		}
		if c == '/' && !encodeSlash {
			builder.WriteByte(c)
			continue
		}
		builder.WriteString(fmt.Sprintf("%%%02X", c))
	}
	return builder.String()
}

func deriveSigningKey(secret, dateStamp, region, service string) []byte {
	kDate := hmacSHA256([]byte("AWS4"+secret), []byte(dateStamp))
	kRegion := hmacSHA256(kDate, []byte(region))
	kService := hmacSHA256(kRegion, []byte(service))
	return hmacSHA256(kService, []byte("aws4_request"))
}

func hmacSHA256(key, data []byte) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write(data)
	return mac.Sum(nil)
}
