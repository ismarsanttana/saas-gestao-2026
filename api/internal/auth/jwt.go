package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// Claims representa as informações presentes em um JWT de acesso.
type Claims struct {
	Roles []string `json:"roles"`
	jwt.RegisteredClaims
}

// JWTManager encapsula geração e validação de tokens.
type JWTManager struct {
	secret    []byte
	accessTTL time.Duration
}

// NewJWTManager cria o gerenciador com segredo e TTL configurados.
func NewJWTManager(secret string, accessTTL time.Duration) *JWTManager {
	return &JWTManager{secret: []byte(secret), accessTTL: accessTTL}
}

// GenerateAccessToken cria um JWT HS256 com claims padrão.
func (m *JWTManager) GenerateAccessToken(subject, audience string, roles []string) (string, string, error) {
	now := time.Now().UTC()
	jti := uuid.NewString()

	claims := Claims{
		Roles: roles,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   subject,
			Audience:  jwt.ClaimStrings{audience},
			ExpiresAt: jwt.NewNumericDate(now.Add(m.accessTTL)),
			IssuedAt:  jwt.NewNumericDate(now),
			ID:        jti,
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(m.secret)
	if err != nil {
		return "", "", err
	}

	return signed, jti, nil
}

// ParseAndValidate verifica assinatura e expiração.
func (m *JWTManager) ParseAndValidate(tokenString string) (*Claims, error) {
	parser := jwt.NewParser(jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))

	token, err := parser.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		return m.secret, nil
	})
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("token inválido")
	}

	return claims, nil
}
