# PLAN-menu-70: Replace Login/Logout Button with Menu

## Issue Summary
Replace the current standalone login/logout button with a dropdown menu that includes:
- Login/Logout option at the bottom
- New Game item

## Current State Analysis
1. **Login/Logout Button Location**: `app/views/application/index.html.erb` (lines 101-108)
   - Currently in `.auth-container` div within `.game-header`
   - Separate buttons for login and logout
   - Conditional display based on authentication state

2. **Authentication Logic**: `public/js/auth.js`
   - `updateAuthUI()` manages button visibility
   - Login redirects to `/auth/google_oauth2`
   - Logout makes DELETE request to `/logout`

3. **Styling**: `public/css/style.css` (lines 101-134)
   - Login button: Blue background (#4285f4)
   - Logout button: Semi-transparent white with border

4. **New Game Functionality**: Already exists as "Restart Game"
   - Backend: `/restart_game` route in `game_controller.rb`
   - Frontend: `restartGame()` in `game_over.js`

## Implementation Plan

### 1. Create Menu Component Structure
- Replace the current auth-container div with a menu-container
- Add a menu toggle button (e.g., hamburger icon or user icon)
- Create dropdown menu with items:
  - New Game
  - Divider
  - Login/Logout (at bottom)

### 2. HTML Changes (`app/views/application/index.html.erb`)
- Replace auth-container with menu-container
- Add menu toggle button
- Add dropdown menu structure with proper ARIA attributes

### 3. CSS Changes
- Create new file: `public/css/menu.css`
- Style menu toggle button
- Style dropdown menu with:
  - Proper positioning (absolute/relative)
  - Smooth transitions
  - Hover effects
  - Mobile-responsive design

### 4. JavaScript Changes
- Create new file: `public/js/menu.js`
- Implement menu toggle functionality
- Handle click outside to close menu
- Update `auth.js` to work with new menu structure
- Add New Game functionality that calls existing `restartGame()` method

### 5. Integration Points
- Ensure menu works with existing authentication flow
- Maintain current Google OAuth2 integration
- Preserve logout functionality
- Connect New Game to existing restart game logic

### 6. Testing
- Test menu toggle functionality
- Test authentication flow (login/logout)
- Test New Game functionality
- Test responsive behavior on mobile
- Verify no regression in existing features

### 7. Accessibility
- Add proper ARIA labels and roles
- Ensure keyboard navigation works
- Test with screen readers

## File Changes Summary
1. **Modified**: `app/views/application/index.html.erb`
2. **New**: `public/css/menu.css`
3. **New**: `public/js/menu.js`
4. **Modified**: `public/js/auth.js`
5. **Modified**: `public/css/style.css` (remove old button styles)
6. **Test**: Create tests for menu functionality

## Potential Challenges
- Ensuring menu doesn't interfere with game UI
- Mobile responsiveness
- Maintaining authentication state during menu transitions
- Handling edge cases (e.g., menu open during game actions)