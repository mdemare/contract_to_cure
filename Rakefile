require 'rake/testtask'

Rake::TestTask.new(:test) do |t|
  t.libs << "test"
  t.libs << "lib"
  t.test_files = FileList['test/test_*.rb']
  t.verbose = true
end

desc "Run tests"
task default: :test

namespace :contract do
  desc "Re-record the API contract fixtures in testdata/contract"
  task :record do
    ENV['CONTRACT_RECORD'] = '1'
    ruby '-Itest', 'test/test_contract_fixtures.rb'
  end
end
