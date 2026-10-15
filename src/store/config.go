package store

import (
	"strconv"
	"strings"
	"time"
)

// Defaults match the former Rails GameRedisPool.
const (
	DefaultURL         = "redis://localhost:6379"
	DefaultPoolSize    = 5
	DefaultPoolTimeout = 5 * time.Second
	DefaultKey         = "contract-to-cure/current-game"
	// StagingKey keeps staging off production's game: both deployments use
	// the same Redis server, and REDIS_URL can't differ per environment.
	StagingKey = "contract-to-cure/staging/current-game"
)

// Config is how the store connects to Redis and which key holds the game.
type Config struct {
	URL               string
	PoolSize          int
	PoolTimeout       time.Duration
	Key               string // tests use their own key
	DefaultDifficulty string // for saves without a valid difficulty
}

// ConfigFromEnv reads REDIS_URL, REDIS_POOL_SIZE and REDIS_POOL_TIMEOUT (in
// seconds). Like GameRedisPool, blank or non-integer values fall back to the
// defaults. Unlike Rails, so does a value below 1, which would leave the pool
// with no usable connections. DEPLOYMENT_ENV=staging selects StagingKey.
func ConfigFromEnv(getenv func(string) string) Config {
	url := getenv("REDIS_URL")
	if url == "" {
		url = DefaultURL
	}
	key := DefaultKey
	if strings.TrimSpace(getenv("DEPLOYMENT_ENV")) == "staging" {
		key = StagingKey
	}
	return Config{
		URL:               url,
		PoolSize:          positiveIntEnv(getenv, "REDIS_POOL_SIZE", DefaultPoolSize),
		PoolTimeout:       time.Duration(positiveIntEnv(getenv, "REDIS_POOL_TIMEOUT", int(DefaultPoolTimeout/time.Second))) * time.Second,
		Key:               key,
		DefaultDifficulty: fallbackDifficulty,
	}
}

// positiveIntEnv parses like Ruby's Integer(): surrounding whitespace,
// underscores and 0x/0o/0b/0 prefixes are allowed.
func positiveIntEnv(getenv func(string) string, key string, def int) int {
	s := strings.TrimSpace(getenv(key))
	if s == "" {
		return def
	}
	n, err := strconv.ParseInt(s, 0, 0)
	if err != nil || n < 1 {
		return def
	}
	return int(n)
}
