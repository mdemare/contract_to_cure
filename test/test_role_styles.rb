require 'test_helper'

class TestRoleStyles < Minitest::Test
  def test_role_names_are_defined_correctly
    # Test that the role names we expect to have CSS styling issues are defined in Player
    expected_roles = [:operations_expert, :quarantine_specialist]

    expected_roles.each do |role|
      assert Player::ROLE_NAMES.key?(role), "Role #{role} should be defined in Player::ROLE_NAMES"
    end
  end

  def test_role_name_formatting
    # Test the role name formatting for display
    operations_expert = Player.new(:operations_expert, 0)
    quarantine_specialist = Player.new(:quarantine_specialist, 1)

    assert_equal "Operations Expert", operations_expert.role_name
    assert_equal "Quarantine Specialist", quarantine_specialist.role_name
  end

  def test_all_roles_have_names
    # Ensure all roles have proper names defined
    Player::ROLE_NAMES.each do |role_symbol, role_name|
      refute_nil role_name, "Role #{role_symbol} should have a name"
      refute_empty role_name, "Role #{role_symbol} should have a non-empty name"
    end
  end
end
