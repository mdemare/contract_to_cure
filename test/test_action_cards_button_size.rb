require 'test_helper'

class TestActionCardsButtonSize < Minitest::Test
  def test_action_cards_button_css_dimensions
    css_file = File.read(File.join(__dir__, '..', 'public', 'css', 'buttons.css'))

    assert_match(/\.action-btn\.special-action\s*\{[^}]*width:\s*72px/, css_file,
                 "Action cards button should fit the compact action row")

    assert_match(/\.action-btn\.special-action\s*\{[^}]*height:\s*72px/, css_file,
                 "Action cards button should not make the action row taller")

    assert_match(/\.action-btn\.special-action\s+i\s*\{[^}]*font-size:\s*24px/, css_file,
                 "Action cards button icon should fit the compact control")

    assert_match(/\.action-btn\.special-action\s+span\s*\{[^}]*font-size:\s*10px/, css_file,
                 "Action cards button label should fit the compact control")
  end
end
