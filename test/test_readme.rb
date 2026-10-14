require 'minitest/autorun'

# README.md only points to the noca knowledge base (cc-478). Keep the pointers
# well formed and the quoted setup facts in line with the repository.
class TestReadme < Minitest::Test
  ROOT = File.expand_path('..', __dir__)
  QUESTION_KEY = /\AQ\d+-cc\z/

  def readme
    @readme ||= File.read(File.join(ROOT, 'README.md'))
  end

  def read(path)
    File.read(File.join(ROOT, path))
  end

  def test_every_noca_view_command_uses_question_keys
    commands = readme.scan(/`noca view ([^`]+)`/).flatten
    refute_empty commands

    commands.each do |references|
      references.split(',').each do |key|
        next if key == '<key>'

        assert_match QUESTION_KEY, key, "malformed reference in `noca view #{references}`"
      end
    end
  end

  def test_quoted_questions_have_keys
    quoted = readme.scan(/^> \*\*(Q\d+-cc):/).flatten
    assert_equal %w[Q44-cc Q8-cc Q37-cc], quoted
  end

  def test_explains_how_to_list_all_questions
    assert_includes readme, '`noca list question --all`'
  end

  def test_drops_sinatra_era_instructions
    %w[sinatra current_game.yaml NEW_GAME public/index.html].each do |stale|
      refute_match(/#{Regexp.escape(stale)}/i, readme)
    end
  end

  def test_quoted_ruby_version_matches_ruby_version_file
    assert_includes readme, "Ruby #{read('.ruby-version').strip}"
  end

  def test_quoted_puma_port_matches_puma_config
    assert_match(/ENV\['PORT'\] \|\| '4567'/, read('config/puma.rb'))
    assert_includes readme, 'http://localhost:4567'
    assert_includes readme, 'bundle exec puma -C config/puma.rb'
  end

  def test_quoted_make_check_target_exists
    assert_match(/^check:/, read('Makefile'))
    assert_includes readme, '`make check`'
  end
end
