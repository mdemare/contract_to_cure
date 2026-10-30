.PHONY: all build docker loc check full-check js-test go-test go-full-test go-vet

# Default target (push.sh, staging.sh): build the binary, then the image
all: build docker

# Per-ticket checks: slow Go tests opt out via testing.Short().
check: js-test
	@$(MAKE) --no-print-directory go-vet go-test

# Complete suite: run daily once at least ten commits have landed since the
# last successful full check. No timeout; bypass the Go test result cache.
full-check: js-test
	@$(MAKE) --no-print-directory go-vet go-full-test

js-test:
	node --experimental-default-type=module --test test/js/*.mjs

# Static binary that the Docker image copies. gitHash is the short SHA of the
# checked-out commit (the deploy scripts reset to the deployed SHA first);
# without git it is empty and ./main falls back to the release in .version.
build:
	CGO_ENABLED=0 go build -ldflags "-X main.gitHash=$(shell git rev-parse --short=6 HEAD 2>/dev/null)" -o main ./src

go-test:
	go test -short ./...

go-full-test:
	go test -count=1 -timeout=0 ./...

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
