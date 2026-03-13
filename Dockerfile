# Build stage
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Copy the entire monorepo context
COPY . .

# Build the backend
WORKDIR /app/backend
RUN go mod download
RUN go build -o /app/cloudgazer-backend ./cmd/api/main.go

# Run stage
FROM alpine:latest

# Install CA certificates for TLS/API calls
RUN apk add --no-cache ca-certificates

WORKDIR /root/

# Copy the binary from the builder stage
COPY --from=builder /app/cloudgazer-backend .

# Expose the default port (though Koyeb overrides this via environment)
EXPOSE 8080

# Run the backend
CMD ["./cloudgazer-backend"]
