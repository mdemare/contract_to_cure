# JSON 3 accepts parser options only as keywords, while Rails 8.1 passes the
# options hash positionally. Keep the compatibility shim scoped to
# ActiveSupport until Rails handles the JSON 3 API directly.
if Gem::Version.new(::JSON::VERSION) >= Gem::Version.new('3.0.0')
  module JsonThreeActiveSupportCompatibility
    def decode(json, options = {})
      data = ::JSON.parse(json, **options)
      ActiveSupport.parse_json_times ? convert_dates_from(data) : data
    end

    alias_method :load, :decode
  end

  ActiveSupport::JSON.singleton_class.prepend(JsonThreeActiveSupportCompatibility)
end
