.PHONY: all docker loc check go-build go-test go-vet

# Default target
all: docker

check:
	BUNDLE_GEMFILE="$(CURDIR)/Gemfile" BUNDLE_LOCKFILE="$(CURDIR)/Gemfile.lock" \
		bundle exec rake test
	node --experimental-default-type=module --test test/js/*.mjs
	@$(MAKE) --no-print-directory go-vet go-test

# Go port (epic cc-368); not deployed until cutover
go-build:
	CGO_ENABLED=0 go build -o main ./src

go-test:
	go test ./...

go-vet:
	go vet ./...

# Build Docker image
docker:
	@echo "Building Docker image..."
	docker compose -f $(COMPOSE_FILE) build

loc:
	@git ls-files -z -- \
		'app/*.rb' 'app/**/*.rb' 'app/**/*.erb' \
		'public/css/*.css' 'public/js/*.js' 'public/cities.json' | \
		xargs -0 wc -l | awk 'END {print $$1}'
