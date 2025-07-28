# Plan: Fix OmniAuth uninitialized constant error

## Issue Analysis
The application fails to start with error:
```
NameError: uninitialized constant OmniAuth
```

This occurs in `config/initializers/omniauth.rb:1` when trying to use `OmniAuth::Builder`.

## Root Cause
The `omniauth` and `omniauth-google-oauth2` gems are missing from the Gemfile. The application is configured to use OmniAuth for Google OAuth2 authentication, but the required gems are not installed.

## Solution
Add the missing OmniAuth gems to the Gemfile:
1. Add `gem 'omniauth'`
2. Add `gem 'omniauth-google-oauth2'`
3. Add `gem 'omniauth-rails_csrf_protection'` (required for Rails 7+)
4. Run `bundle install` to install the gems
5. Verify the application starts without errors

## Implementation Steps
1. Edit the Gemfile to add the missing gems in the authentication section
2. Run bundle install to update Gemfile.lock
3. Test that the application starts correctly
4. Ensure tests pass with the new dependencies