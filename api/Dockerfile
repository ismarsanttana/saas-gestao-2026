FROM golang:1.24-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /api ./cmd/api

FROM alpine:3.19
WORKDIR /app
COPY --from=builder /api /app/api
EXPOSE 8081
CMD ["./api"]
