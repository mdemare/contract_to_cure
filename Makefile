.PHONY: all docker loc

# Default target
all: docker

# Build Docker image
docker:
	@echo "Building Docker image..."
	docker compose -f $(COMPOSE_FILE) build

loc:
	@git ls-files -z -- \
		'app/*.rb' 'app/**/*.rb' 'app/**/*.erb' \
		'public/css/*.css' 'public/js/*.js' 'public/cities.json' | \
		xargs -0 wc -l | awk 'END {print $$1}'
