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
  }
}

async function handleLogout() {
  try {
    const response = await fetch('/logout', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
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