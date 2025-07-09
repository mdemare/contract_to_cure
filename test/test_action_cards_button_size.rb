require 'test_helper'

class TestActionCardsButtonSize < Minitest::Test
  def test_action_cards_button_css_dimensions
    css_file = File.read(File.join(__dir__, '..', 'public', 'css', 'buttons.css'))

    # Test that the action-btn.special-action width is 88px (10% bigger than original 80px)
    assert_match(/\.action-btn\.special-action\s*\{[^}]*width:\s*88px/, css_file,
                 "Action cards button width should be 88px")

    # Test that the action-btn.special-action height is 132px (10% bigger than original 120px)
    assert_match(/\.action-btn\.special-action\s*\{[^}]*height:\s*132px/, css_file,
                 "Action cards button height should be 132px")

    # Test that the icon font-size is 40px (proportionally increased from 36px)
    assert_match(/\.action-btn\.special-action\s+i\s*\{[^}]*font-size:\s*40px/, css_file,
                 "Action cards button icon font-size should be 40px")

    # Test that the text font-size is 13px (proportionally increased from 12px)
    assert_match(/\.action-btn\.special-action\s+span\s*\{[^}]*font-size:\s*13px/, css_file,
                 "Action cards button text font-size should be 13px")
  end
end
