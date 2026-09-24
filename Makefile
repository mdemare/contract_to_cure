.PHONY: all docker loc check

# Default target
all: docker

check:
	RUBYOPT= RUBYLIB= ruby --disable=gems bin/check
	node --test test/js/*.mjs

# Build Docker image
docker:
	@echo "Building Docker image..."
	docker compose -f $(COMPOSE_FILE) build

loc:
	@git ls-files -z -- \
		'app/*.rb' 'app/**/*.rb' 'app/**/*.erb' \
		'public/css/*.css' 'public/js/*.js' 'public/cities.json' | \
		xargs -0 wc -l | awk 'END {print $$1}'
