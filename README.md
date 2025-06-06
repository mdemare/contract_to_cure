# Pandemic: Global Disease Control

A web-based implementation of the cooperative board game Pandemic, where players work together as disease-fighting specialists to prevent global outbreaks and discover cures for four deadly diseases.

## Overview

This is a Ruby/Sinatra web application with a JavaScript frontend that faithfully recreates the Pandemic board game experience. Players take on different specialist roles and must coordinate their efforts to travel the world, treat infections, build research stations, and discover cures before time runs out.

## Game Features

### Core Gameplay
- **Cooperative Strategy**: All players work together to save the world
- **Multiple Difficulty Levels**: Introductory, Normal, and Heroic difficulty settings
- **4 Disease Types**: Blue, Yellow, Black, and Red diseases spread across different regions
- **Specialist Roles**: 7 unique player roles with special abilities:
  - Medic (removes all disease cubes when treating)
  - Scientist (needs only 4 cards to discover a cure)
  - Researcher (can share knowledge more freely)
  - Operations Expert (builds research stations without city cards)
  - Dispatcher (can move other players)
  - Contingency Planner (can retrieve action cards from discard)
  - Quarantine Specialist (prevents disease spread in nearby cities)

### Player Actions
- **Move**: Travel between connected cities, or use special movement options
- **Treat Disease**: Remove disease cubes from current city
- **Share Knowledge**: Exchange city cards with other players
- **Build Research Station**: Construct facilities needed for discovering cures
- **Cure Disease**: Discover cures by trading in sets of same-color city cards
- **Action Cards**: Use special event cards for powerful one-time effects

### Victory & Loss Conditions
- **Victory**: Discover cures for all 4 diseases
- **Defeat**: 
  - 8 outbreaks occur
  - Run out of disease cubes for any color
  - Player deck runs out of cards

## Technical Architecture

### Backend (Ruby/Sinatra)
- **Main Server**: `app/sinatra.rb` - HTTP API endpoints and game coordination
- **Game Logic**: `app/game_state.rb` - Core game state management
- **Modular Design**: Game logic split into focused modules:
  - `game_state/player_actions.rb` - Player action implementations
  - `game_state/end_turn_events.rb` - End-of-turn disease spreading
  - `game_state/action_cards.rb` - Special event card effects
  - `game_state/setup.rb` - Game initialization
  - `game_state/config.rb` - Game constants and configuration

### Frontend (Vanilla JavaScript)
- **Modular ES6**: Clean separation of concerns across multiple modules
- **Interactive Map**: Visual world map with clickable cities and connections
- **Real-time Updates**: Dynamic UI updates based on game state
- **Touch-Friendly**: Mobile-responsive interface with large action buttons
- **Game State Management**: Client-side state synchronization with server

### Key Files
```
app/
├── sinatra.rb              # Main server and API endpoints
├── game_state.rb           # Core game state class
└── game_state/
    ├── config.rb           # Game constants
    ├── player_actions.rb   # Player action logic
    ├── end_turn_events.rb  # Disease spreading mechanics
    ├── action_cards.rb     # Special event cards
    └── setup.rb            # Game initialization

public/
├── index.html              # Main game interface
├── cities.json             # World map data
├── css/                    # Stylesheets for different UI components
└── js/                     # Frontend JavaScript modules
```

## Installation & Setup

### Prerequisites
- Ruby 3.0+
- Bundler gem

### Installation
1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd contract_to_cure
   ```

2. Install dependencies:
   ```bash
   bundle install
   ```

3. Start the development server:
   ```bash
   ruby app/sinatra.rb
   ```

4. Open your browser to `http://localhost:4567`

### Command Line Options
```bash
ruby app/sinatra.rb [options]

Options:
  -d, --difficulty DIFFICULTY    Set game difficulty (introductory, normal, heroic)
  -n, --new                     Start a new game (ignore saved state)
  -h, --help                    Show help message
```

Examples:
```bash
# Start a new heroic difficulty game
ruby app/sinatra.rb -d heroic -n

# Load saved game on normal difficulty
ruby app/sinatra.rb -d normal
```

## Game Persistence

The game automatically saves state to `current_game.yaml` after each action, allowing you to:
- Resume games after server restarts
- Load previous game sessions
- Start fresh games with the `-n` flag

## Development

### Architecture Highlights
- **RESTful API**: Clean HTTP endpoints for all game actions
- **Stateful Server**: Game state persisted server-side with YAML serialization
- **Modular Frontend**: ES6 modules for maintainable JavaScript code
- **Responsive Design**: Mobile-first CSS with touch-friendly interactions

### API Endpoints
- `GET /game_state.json` - Current game state
- `POST /move` - Move a player
- `POST /treat` - Treat disease in current city
- `POST /cure_disease` - Discover a cure
- `POST /share_knowledge` - Share city cards between players
- `POST /build_research_station` - Build a research station
- `POST /action_card` - Use special event cards
- `POST /restart_game` - Start a new game

### Contributing
The codebase is well-structured for contributions:
- Game logic is cleanly separated from presentation
- Each player action is implemented as a focused method
- Frontend modules handle specific UI concerns
- CSS is organized by component for easy styling updates

## License

This is a fan implementation of the Pandemic board game for educational purposes.