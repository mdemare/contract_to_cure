# Plan for Issue #30: Login via GET

## Problem
The login link using google_oauth2 has been implemented, but `curl -v http://contracttocure.mdemare.nl/login` returns a 404.

## Root Cause
The OmniAuth configuration in `config/initializers/omniauth.rb` restricts allowed request methods to only POST requests:

```ruby
OmniAuth.config.allowed_request_methods = [:post]
```

However, the login flow requires GET requests to work properly:
1. User visits `/login` (GET request)
2. Rails redirects to `/auth/google_oauth2` (GET request) 
3. User is redirected to Google OAuth (GET request)
4. Google redirects back to `/auth/google_oauth2/callback` (GET request)

## Solution
Modify the OmniAuth configuration to allow both GET and POST requests:

```ruby
OmniAuth.config.allowed_request_methods = [:get, :post]
```

This will allow:
- GET requests for the standard OAuth flow
- POST requests for enhanced security (CSRF protection)

## Implementation Steps
1. Update `config/initializers/omniauth.rb` to allow both GET and POST methods
2. Test the login flow manually
3. Ensure existing tests still pass
4. Add or update tests to verify GET request handling

## Files to Modify
- `config/initializers/omniauth.rb` - Update allowed request methods

## Testing
- Verify `/login` endpoint returns 302 redirect (not 404)
- Verify complete OAuth flow works via GET requests
- Ensure existing session controller tests still pass
- Test with curl commands to confirm fix