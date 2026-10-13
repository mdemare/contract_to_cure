require 'minitest/autorun'
require 'yaml'

# The image runs the Go binary (cc-425): `make` builds ./main on the host and
# docker compose copies it into an Alpine image (Q6-xx).
class TestDeployment < Minitest::Test
  ROOT = File.expand_path('..', __dir__)
  COMPOSE_FILES = %w[docker-compose.production.yml docker-compose.staging.yml].freeze

  def read(path)
    File.read(File.join(ROOT, path))
  end

  def test_default_make_target_builds_the_binary_then_the_image
    makefile = read('Makefile')
    assert_match(/^all: build docker$/, makefile)
    assert_match(/^build:\n\tCGO_ENABLED=0 go build -o main \.\/src$/, makefile)
    assert_match(/^docker:\n(?:\t.*\n)*\tdocker compose -f \$\(COMPOSE_FILE\) build$/, makefile)
  end

  def test_dockerfile_runs_the_binary_as_non_root_on_port_2583
    dockerfile = read('Dockerfile')
    assert_match(/^FROM alpine:/, dockerfile)
    assert_match(/^COPY main /, dockerfile)
    assert_match(/^COPY public /, dockerfile)
    assert_match(/^USER app$/, dockerfile)
    assert_match(/^EXPOSE 2583$/, dockerfile)
    assert_match(/^CMD \["\.\/main"\]$/, dockerfile)
  end

  def test_dockerignore_keeps_secrets_and_git_out
    entries = read('.dockerignore').lines.map(&:strip).reject { it.empty? || it.start_with?('#') }
    assert_equal '*', entries.first
    refute_includes entries, '!.env'
    refute_includes entries, '!.git'
    %w[!main !.version !public].each { assert_includes entries, it }
  end

  def test_compose_files_run_the_binary_with_a_wget_healthcheck
    COMPOSE_FILES.each do |file|
      webapp = YAML.safe_load(read(file)).dig('services', 'webapp')
      assert_equal ['./main'], webapp['command'], file
      assert_equal({ 'PORT' => '2583' }, webapp['environment'], file)
      assert_equal [{ 'path' => '.env', 'required' => false }], webapp['env_file'], file
      assert_equal ['CMD', 'wget', '-q', '-O', '/dev/null', 'http://localhost:2583/up'],
                   webapp.dig('healthcheck', 'test'), file
    end
  end

  def test_compose_files_publish_the_platform_ports
    assert_equal ['${EXPOSED_PORT:-3100}:2583'],
                 YAML.safe_load(read('docker-compose.production.yml')).dig('services', 'webapp', 'ports')
    assert_equal ['1${EXPOSED_PORT:-3100}:2583'],
                 YAML.safe_load(read('docker-compose.staging.yml')).dig('services', 'webapp', 'ports')
  end
end
