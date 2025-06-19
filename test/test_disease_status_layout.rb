require_relative 'test_helper'

class TestDiseaseStatusLayout < TestHelper
  def test_disease_status_html_structure
    get '/'
    assert_equal 200, last_response.status
    
    # Verify that the cure grid exists
    assert_includes last_response.body, 'cure-grid'
    
    # Verify each disease has the new structure with cure-info and cube-count
    %w[blue yellow black red].each do |color|
      assert_includes last_response.body, "cure-item #{color}"
      assert_includes last_response.body, 'cure-info'
      assert_includes last_response.body, "#{color}-cure"
      assert_includes last_response.body, "#{color}-cubes"
      assert_includes last_response.body, 'cube-count'
    end
  end
  
  def test_disease_status_elements_present
    get '/'
    assert_equal 200, last_response.status
    
    # Check that cube count elements are present for each disease
    %w[blue yellow red black].each do |color|
      assert_includes last_response.body, "id=\"#{color}-cubes\""
      assert_includes last_response.body, "class=\"cube-count\""
    end
  end
end