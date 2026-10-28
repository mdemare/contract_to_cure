// auth.js - Handle authentication UI

export function initializeAuth() {
  // This will be called when game state is loaded
}

// Session metadata is optional on game responses. Omission leaves identity
// unchanged; an explicit null is the server's signed-out identity.
export function updateAuthFromResponse(response) {
  if (Object.prototype.hasOwnProperty.call(response, 'current_user')) {
    updateAuthUI(response.current_user);
  }
}

export function updateAuthUI(currentUser) {
  // Store current user globally for menu access
  window.currentUser = currentUser;
  
  // Update menu auth UI if the function exists
  if (window.updateMenuAuthUI) {
    window.updateMenuAuthUI();
  }
}
