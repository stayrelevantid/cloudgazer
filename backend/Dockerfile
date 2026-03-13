# Build stage
FROM golang:1.24-alpine AS builder

# Set the working directory inside the container
WORKDIR /app

# Copy go mod and sum files first for better caching
COPY go.mod go.sum ./
RUN go mod download

# Copy the rest of the source code
COPY . .

# Build the application
RUN go build -o cloudgazer-backend ./cmd/api/main.go

# Run stage
FROM alpine:latest

# Install CA certificates for secure API calls
RUN apk add --no-cache ca-certificates

WORKDIR /root/

# Copy the binary from the builder stage
COPY --from=builder /app/cloudgazer-backend .

# Expose the default port (8080)
EXPOSE 8080

# Run the binary
CMD ["./cloudgazer-backend"]
