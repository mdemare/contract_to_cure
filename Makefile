.PHONY: all build docker loc check go-test go-vet

# Default target (push.sh, staging.sh): build the binary, then the image
all: build docker

check:
	node --experimental-default-type=module --test test/js/*.mjs
	@$(MAKE) --no-print-directory go-vet go-test

# Static binary that the Docker image copies. gitHash is the short SHA of the
# checked-out commit (the deploy scripts reset to the deployed SHA first);
# without git it is empty and ./main falls back to the release in .version.
build:
	CGO_ENABLED=0 go build -ldflags "-X main.gitHash=$(shell git rev-parse --short=6 HEAD 2>/dev/null)" -o main ./src

go-test:
	go test ./...

go-vet:
	go vet ./...

# Build Docker image (needs ./main from build)
docker:
	@echo "Building Docker image..."
	docker compose -f $(COMPOSE_FILE) build

loc:
	@git ls-files -z -- \
		'src/*.go' 'src/**/*.go' 'src/**/*.tmpl' ':!*_test.go' \
		'public/css/*.css' 'public/js/*.js' 'public/cities.json' | \
		xargs -0 wc -l | awk 'END {print $$1}'
