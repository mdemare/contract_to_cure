# Plan for Issue #13: Migrate Sinatra App to Rails

## Overview
Convert the existing Sinatra application to a Rails application while maintaining all current functionality.

## Current Application Analysis
- **Main App**: `/app/sinatra.rb` - Contains all HTTP endpoints and routing
- **Game Logic**: `/app/game_state.rb` and `/app/game_state/` directory containing business logic
- **Static Assets**: `/public/` directory with HTML, CSS, and JavaScript
- **Configuration**: `config.ru`, `Gemfile`, Docker setup

## Migration Strategy

### Phase 1: Rails Setup
1. **Generate new Rails application**
   - Run `rails new . --api --skip-active-record --skip-action-mailer --skip-action-cable --skip-sprockets --skip-javascript`
   - Keep existing game logic and public assets

2. **Update Gemfile**
   - Add Rails dependencies
   - Keep existing gems (redis, puma, etc.)
   - Remove sinatra gems

### Phase 2: Convert Controllers
1. **Create ApplicationController**
   - Move common functionality from Sinatra before block
   - Add forecast_active check as before_action

2. **Create GameController**
   - Convert all Sinatra routes to Rails controller actions:
     - `GET /` → `root#index` (redirect to index.html)
     - `GET /game_state.json` → `game#state`
     - `POST /move` → `game#move`
     - `POST /treat` → `game#treat`
     - `POST /cure_disease` → `game#cure_disease`
     - `POST /retrieve` → `game#retrieve`
     - `POST /share_knowledge` → `game#share_knowledge`
     - `POST /pass` → `game#pass`
     - `POST /draw_cards` → `game#draw_cards`
     - `POST /infect_cities` → `game#infect_cities`
     - `POST /build_research_station` → `game#build_research_station`
     - `POST /discard_cards` → `game#discard_cards`
     - `POST /action_card` → `game#action_card`
     - `POST /restart_game` → `game#restart_game`

### Phase 3: Configuration
1. **Routes setup**
   - Configure `config/routes.rb` with all endpoints
   - Set up static file serving for `/public`

2. **Application configuration**
   - Configure Rails app for API mode
   - Set up CORS if needed
   - Configure Redis connection
   - Port command-line options handling

3. **Environment setup**
   - Move game initialization logic to appropriate Rails initializer
   - Handle command-line options parsing

### Phase 4: Testing & Cleanup
1. **Verify functionality**
   - Test all endpoints work identically
   - Ensure static assets are served correctly
   - Verify game state persistence works

2. **Clean up**
   - Remove Sinatra files
   - Update Docker configuration
   - Update documentation

## Implementation Steps
1. Generate Rails application in place
2. Create controllers and routes
3. Move game initialization logic
4. Test endpoints one by one
5. Update configuration files
6. Remove old Sinatra code
7. Update deployment scripts

## Risks & Considerations
- **Static Asset Serving**: Need to ensure `/public` assets are served correctly
- **Game State Initialization**: Command-line options need to work in Rails context
- **Redis Integration**: Ensure game persistence continues to work
- **API Compatibility**: All endpoints must work identically to maintain frontend compatibility

## Success Criteria
- All existing HTTP endpoints work identically
- Static assets (HTML, CSS, JS) are served correctly
- Game state persistence via Redis continues to work
- Command-line options for difficulty/new game work
- Application can be deployed with same Docker setup