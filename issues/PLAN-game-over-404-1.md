# Plan for Fixing Game Over 404 Issue

## Issue Description
The "Main Menu" button in the game over dialog leads to a 404 error when clicked.

## Root Cause Analysis
The issue is in `/public/js/game_over.js` line 89, where the Main Menu button click handler redirects to `/` using `window.location.href = '/'`. This causes a 404 error because:
1. The application might be deployed under a subdirectory
2. The redirect goes to the server root instead of serving the index.html file properly

## Proposed Solution
Use `window.location.reload()` instead of redirecting to `/`. This will:
- Properly reload the page and reset the game to its initial state
- Work correctly regardless of deployment path
- Be consistent with how a main menu return should behave (resetting the entire page)

## Implementation Steps
1. Edit `/public/js/game_over.js` line 89
2. Change `window.location.href = '/'` to `window.location.reload()`
3. Test the fix by triggering game over and clicking the Main Menu button
4. Ensure no 404 errors occur and the page reloads properly

## Alternative Solutions Considered
1. Using `window.location.href = window.location.pathname` - Less clean as it maintains URL parameters
2. Adding a GET route for `/` in Sinatra - Unnecessary server-side change for a client-side issue
3. Using relative path redirect - Could still cause issues with subdirectory deployments

## Testing Plan
1. Manually test the game over scenario
2. Click the Main Menu button and verify it reloads the page
3. Ensure the game resets to initial state
4. Test both buttons (Restart Game and Main Menu) work correctly