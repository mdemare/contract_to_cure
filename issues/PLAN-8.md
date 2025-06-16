# Plan for Issue #8: Log In Via Google

## Problem
The Contract to Cure application currently has no authentication system. Users need to be able to log in via Google OAuth2, with the interface showing:
- Login button when not authenticated
- Username and logout button when authenticated

## Reference Implementation
Following the pattern from `~/projects/boardgame-ratings/trunk` which uses:
- Sinatra-compatible OAuth2 with Google
- Redis for user session storage
- Simple UI integration

## Current State Analysis
- **Technology Stack**: Sinatra + Redis (not Rails)
- **No Authentication**: Currently no auth system exists
- **UI**: Single HTML page with JavaScript game interface
- **Architecture**: Simple web app with game state management

## Implementation Plan

### 1. Add Required Dependencies
- Add OAuth2 gems to Gemfile:
  - `omniauth`
  - `omniauth-google-oauth2` 
  - `omniauth-rails_csrf_protection` (for CSRF protection)

### 2. Environment Configuration
- Add Google OAuth2 environment variables:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
- Update docker-compose.yml to include these env vars

### 3. Sinatra OAuth2 Setup
- Configure OmniAuth middleware in Sinatra app
- Add OAuth2 routes:
  - `/auth/google_oauth2` (redirect to Google)
  - `/auth/google_oauth2/callback` (OAuth callback)
  - `/auth/failure` (failure handler)
  - `/login` (login endpoint)
  - `/logout` (logout endpoint)

### 4. Session Management
- Implement user session storage in Redis
- Create session helper methods:
  - `current_user`
  - `logged_in?`
  - Session creation/destruction

### 5. UI Integration
- Update `public/index.html` to include:
  - Login button when not authenticated
  - User info display when authenticated
  - Logout button when authenticated
- Add JavaScript for authentication state management
- Style authentication UI elements

### 6. Security Considerations
- Enable CSRF protection for authentication routes
- Secure session cookie configuration
- Add proper error handling for OAuth failures

## Implementation Steps
1. Update Gemfile with OAuth2 dependencies
2. Configure OmniAuth middleware in Sinatra app
3. Add authentication routes and handlers
4. Implement session management with Redis
5. Update UI to show login/logout interface
6. Add CSS styling for authentication elements
7. Test authentication flow end-to-end

## Files to Modify
- `Gemfile` - Add OAuth2 gems
- `app/sinatra.rb` - Add OAuth2 middleware and routes
- `docker-compose.yml` - Add environment variables
- `public/index.html` - Add authentication UI
- `public/js/` - Add authentication JavaScript
- `public/css/style.css` - Add authentication styling

## Testing Strategy
- Manual testing of Google OAuth2 flow
- Verify session persistence across page reloads
- Test logout functionality
- Ensure game functionality works for authenticated users