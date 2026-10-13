// auth.js - Handle authentication UI

export function initializeAuth() {
  // This will be called when game state is loaded
}

export function updateAuthUI(currentUser) {
  // Store current user globally for menu access
  window.currentUser = currentUser;
  
  // Update menu auth UI if the function exists
  if (window.updateMenuAuthUI) {
    window.updateMenuAuthUI();
  }
}
