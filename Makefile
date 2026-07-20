.PHONY: all docker loc

# Default target
all: docker

# Build Docker image
docker:
	@echo "Building Docker image..."
	docker compose -f $(COMPOSE_FILE) build

loc:
	@git ls-files -z -- app public/js public/css ':(exclude)public/js/.gitignore' | ruby -e 'puts STDIN.read.split("\0").reject(&:empty?).sum { |path| File.foreach(path).count }'
