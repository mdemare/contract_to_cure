# Plan for Issue #8: Log In Via Google

## Objective
Implement Google OAuth authentication for Contract to Cure, allowing users to log in via their Google accounts. When logged in, display username and logout button; otherwise show login button.

## Analysis
The application currently has no authentication system. We'll implement Google OAuth using the same approach as the boardgame-ratings project, which uses:
- OmniAuth with Google OAuth2 provider
- Redis for user data storage (no database required)
- Rails sessions for maintaining login state

## Implementation Steps

### 1. Enable Session Support
- Modify `config/application.rb` to enable session middleware (currently API-only)
- Add necessary session configuration

### 2. Add Authentication Gems
- Add to Gemfile:
  - `omniauth` (~> 2.1)
  - `omniauth-google-oauth2` (~> 1.1)
  - `omniauth-rails_csrf_protection` (~> 1.0)
- Run bundle install

### 3. Configure OmniAuth
- Create `config/initializers/omniauth.rb`
- Configure Google OAuth2 provider with proper scopes and settings
- Handle CSRF protection

### 4. Create Sessions Controller
- Create `app/controllers/sessions_controller.rb`
- Implement actions:
  - `create`: Handle OAuth callback, store user in Redis
  - `destroy`: Log out user
  - `failure`: Handle authentication failures

### 5. Update Routes
- Add authentication routes:
  - OAuth callback: `/auth/:provider/callback`
  - Login redirect: `/login`
  - Logout: `/logout`
  - Auth failure: `/auth/failure`

### 6. Update Application Controller
- Add helper methods: `current_user`, `logged_in?`
- Add `require_authentication` method for protected actions
- Ensure proper handling of both HTML and JSON formats

### 7. Update Frontend UI
- Modify `public/index.html` to include login/logout UI
- Add JavaScript to handle login state display
- Show username when logged in, login button when not

### 8. Environment Configuration
- Create `.env.example` with required variables:
  - GOOGLE_CLIENT_ID
  - GOOGLE_CLIENT_SECRET
- Add instructions for Google OAuth setup

### 9. Testing
- Write tests for sessions controller
- Test OAuth flow
- Test protected endpoints
- Test UI login/logout functionality

### 10. Documentation
- Update README with authentication setup instructions
- Document Google Cloud Console setup process
- Add development environment setup notes

## Technical Considerations
- Keep the implementation lightweight using Redis (no User model needed)
- Ensure game state becomes user-specific after login
- Handle both development (mock user) and production environments
- Maintain backwards compatibility for existing game functionality

## Success Criteria
- Users can log in via Google OAuth
- Username is displayed when logged in
- Logout functionality works correctly
- Sessions persist across page refreshes
- Game state is associated with logged-in users