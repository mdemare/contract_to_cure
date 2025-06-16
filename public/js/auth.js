// Authentication module for handling Google OAuth2 login/logout

class AuthManager {
  constructor() {
    this.currentUser = null;
    this.authContent = document.getElementById('auth-content');
    this.init();
  }

  async init() {
    await this.checkAuthStatus();
    this.renderAuthUI();
  }

  async checkAuthStatus() {
    try {
      const response = await fetch('/current_user.json');
      const data = await response.json();
      
      if (data.logged_in !== false) {
        this.currentUser = data;
      } else {
        this.currentUser = null;
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      this.currentUser = null;
    }
  }

  renderAuthUI() {
    if (this.currentUser) {
      this.renderLoggedInUI();
    } else {
      this.renderLoggedOutUI();
    }
  }

  renderLoggedInUI() {
    this.authContent.innerHTML = `
      <div class="user-info">
        <span class="welcome-text">Hello, ${this.currentUser.name}</span>
        <button class="logout-button" onclick="authManager.logout()">Logout</button>
      </div>
    `;
  }

  renderLoggedOutUI() {
    this.authContent.innerHTML = `
      <div class="login-section">
        <a href="/login" class="login-button">Login with Google</a>
      </div>
    `;
  }

  async logout() {
    try {
      // Redirect to logout endpoint
      window.location.href = '/logout';
    } catch (error) {
      console.error('Error logging out:', error);
    }
  }

  // Method to refresh auth status (useful after login)
  async refresh() {
    await this.checkAuthStatus();
    this.renderAuthUI();
  }
}

// Initialize auth manager when page loads
let authManager;
document.addEventListener('DOMContentLoaded', () => {
  authManager = new AuthManager();
});

// Check for auth status changes periodically
setInterval(() => {
  if (authManager) {
    authManager.checkAuthStatus().then(() => {
      authManager.renderAuthUI();
    });
  }
}, 30000); // Check every 30 seconds

export { AuthManager };