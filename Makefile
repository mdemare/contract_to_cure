.PHONY: all docker

# Default target
all: docker

# Build Docker image
docker:
	@echo "Building Docker image..."
	docker compose -f $(COMPOSE_FILE) build
