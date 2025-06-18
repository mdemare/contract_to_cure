// auth.js - Handle authentication UI

export function initializeAuth() {
  // This will be called when game state is loaded
}

export function updateAuthUI(currentUser) {
  const authInfo = document.getElementById('auth-info');
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const userName = document.querySelector('.user-name');
  
  if (currentUser) {
    // User is logged in
    authInfo.style.display = 'flex';
    loginBtn.style.display = 'none';
    userName.textContent = currentUser.name || currentUser.email;
    
    // Add logout handler
    logoutBtn.addEventListener('click', handleLogout);
  } else {
    // User is not logged in
    authInfo.style.display = 'none';
    loginBtn.style.display = 'inline-block';
    
    // Add login handler
    loginBtn.addEventListener('click', handleLogin);
  }
}

async function handleLogin() {
  try {
    // Create a form and submit it as POST to /auth/google_oauth2
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/auth/google_oauth2';
    
    // Add CSRF token
    const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');
    const csrfInput = document.createElement('input');
    csrfInput.type = 'hidden';
    csrfInput.name = 'authenticity_token';
    csrfInput.value = csrfToken;
    form.appendChild(csrfInput);
    
    // Add form to body and submit
    document.body.appendChild(form);
    form.submit();
  } catch (error) {
    console.error('Error during login:', error);
  }
}

async function handleLogout() {
  try {
    const response = await fetch('/logout', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').getAttribute('content')
      }
    });
    
    if (response.ok) {
      // Reload the page to update UI
      window.location.reload();
    } else {
      console.error('Logout failed');
    }
  } catch (error) {
    console.error('Error during logout:', error);
  }
}