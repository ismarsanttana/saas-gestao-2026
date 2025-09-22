package http

import (
	"encoding/json"
	"net/http"
)

// SuccessEnvelope padroniza respostas com dados.
type SuccessEnvelope struct {
	Data  any `json:"data"`
	Error any `json:"error"`
}

// ErrorEnvelope padroniza respostas de erro.
type ErrorEnvelope struct {
	Data  any        `json:"data"`
	Error *ErrorBody `json:"error"`
}

// ErrorBody descreve falhas normalizadas.
type ErrorBody struct {
	Code    string      `json:"code"`
	Message string      `json:"message"`
	Details interface{} `json:"details,omitempty"`
}

// WriteJSON escreve envelope de sucesso.
func WriteJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(SuccessEnvelope{Data: data, Error: nil})
}

// WriteError escreve envelope de erro e mantém formato consistente.
func WriteError(w http.ResponseWriter, status int, code, message string, details interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(ErrorEnvelope{
		Data:  nil,
		Error: &ErrorBody{Code: code, Message: message, Details: details},
	})
}
