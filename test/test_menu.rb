require_relative 'test_helper'

class TestMenu < Minitest::Test
  include Rack::Test::Methods

  def app
    Rails.application
  end

  def test_menu_html_structure
    get '/'
    assert last_response.ok?

    # Check that menu container exists
    assert_match(/<div class="menu-container">/, last_response.body)

    # Check for menu toggle button
    assert_match(/<button id="menu-toggle" class="menu-toggle"/, last_response.body)
    assert_match(/aria-label="Menu"/, last_response.body)
    assert_match(/aria-expanded="false"/, last_response.body)

    # Check for dropdown menu
    assert_match(/<div id="dropdown-menu" class="dropdown-menu"/, last_response.body)
    assert_match(/role="menu"/, last_response.body)

    # Check for menu items
    assert_match(/<button id="new-game-btn" class="menu-item"/, last_response.body)
    assert_match(/<button id="login-menu-btn" class="menu-item"/, last_response.body)
    assert_match(/<button id="logout-menu-btn" class="menu-item"/, last_response.body)

    # Check for user info section
    assert_match(/<div id="auth-info-menu" class="user-info"/, last_response.body)
  end

  def test_menu_css_included
    get '/'
    assert last_response.ok?

    # Check that menu.css is included
    assert_match %r{<link rel="stylesheet" href="/css/menu.css">}, last_response.body
  end

  def test_menu_js_included
    get '/'
    assert last_response.ok?

    # Check that menu.js is included
    assert_match %r{<script type="module" src="/js/menu.js"></script>}, last_response.body
  end

  def test_old_auth_container_removed
    get '/'
    assert last_response.ok?

    # Check that old auth-container is not present
    refute_match(/<div class="auth-container">/, last_response.body)

    # Check that old login/logout buttons outside menu are not present
    refute_match(/<button id="login-btn" class="login-button"/, last_response.body)
    refute_match(/<button id="logout-btn" class="logout-button"/, last_response.body)
  end

  def test_menu_has_proper_structure
    get '/'
    assert last_response.ok?

    body = last_response.body

    # Check menu has proper nesting structure
    menu_start = body.index('<div class="menu-container">')
    body.index('</div>', menu_start + 1)

    assert menu_start, "Menu container should exist"

    # Check that New Game button comes before login/logout
    new_game_pos = body.index('new-game-btn')
    login_pos = body.index('login-menu-btn')
    logout_pos = body.index('logout-menu-btn')

    assert new_game_pos < login_pos, "New Game should come before Login"
    assert new_game_pos < logout_pos, "New Game should come before Logout"

    # Check for menu divider
    assert_match(/<div class="menu-divider">/, body)
  end
end
