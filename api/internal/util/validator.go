package util

import (
	"errors"
	"net/mail"
	"strings"
)

// ValidateEmail retorna erro para e-mails inválidos.
func ValidateEmail(email string) error {
	email = strings.TrimSpace(email)
	if email == "" {
		return errors.New("email obrigatório")
	}
	if _, err := mail.ParseAddress(email); err != nil {
		return errors.New("email inválido")
	}
	return nil
}

// ValidatePassword verifica requisitos mínimos de senha.
func ValidatePassword(password string) error {
	if len(password) < 8 {
		return errors.New("senha deve ter pelo menos 8 caracteres")
	}
	return nil
}

// RequireString garante string não vazia.
func RequireString(value, field string) error {
	if strings.TrimSpace(value) == "" {
		return errors.New(field + " obrigatório")
	}
	return nil
}
