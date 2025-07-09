let menuOpen = false;

function getCurrentUser() {
  return window.currentUser || null;
}

function initializeMenu() {
  const menuToggle = document.getElementById('menu-toggle');
  const dropdownMenu = document.getElementById('dropdown-menu');
  const newGameBtn = document.getElementById('new-game-btn');
  const loginBtn = document.getElementById('login-menu-btn');
  const logoutBtn = document.getElementById('logout-menu-btn');

  if (!menuToggle || !dropdownMenu) return;

  menuToggle.addEventListener('click', function(e) {
    e.stopPropagation();
    toggleMenu();
  });

  document.addEventListener('click', function(e) {
    if (menuOpen && !dropdownMenu.contains(e.target) && !menuToggle.contains(e.target)) {
      closeMenu();
    }
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && menuOpen) {
      closeMenu();
    }
  });

  if (newGameBtn) {
    newGameBtn.addEventListener('click', handleNewGame);
  }

  if (loginBtn) {
    loginBtn.addEventListener('click', handleLogin);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }
}

function toggleMenu() {
  const menuToggle = document.getElementById('menu-toggle');
  const dropdownMenu = document.getElementById('dropdown-menu');
  
  menuOpen = !menuOpen;
  
  if (menuOpen) {
    menuToggle.classList.add('active');
    dropdownMenu.classList.add('show');
    menuToggle.setAttribute('aria-expanded', 'true');
  } else {
    menuToggle.classList.remove('active');
    dropdownMenu.classList.remove('show');
    menuToggle.setAttribute('aria-expanded', 'false');
  }
}

function closeMenu() {
  const menuToggle = document.getElementById('menu-toggle');
  const dropdownMenu = document.getElementById('dropdown-menu');
  
  menuOpen = false;
  menuToggle.classList.remove('active');
  dropdownMenu.classList.remove('show');
  menuToggle.setAttribute('aria-expanded', 'false');
}

function handleNewGame() {
  closeMenu();
  
  if (confirm('Are you sure you want to start a new game? Your current progress will be lost.')) {
    fetch('/restart_game', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content
      },
      credentials: 'same-origin'
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to restart game');
      }
      return response.json();
    })
    .then(data => {
      if (data.success) {
        window.location.reload();
      } else {
        alert('Failed to start new game. Please try again.');
      }
    })
    .catch(error => {
      console.error('Error restarting game:', error);
      alert('An error occurred while starting a new game.');
    });
  }
}

function handleLogin() {
  closeMenu();
  
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = '/auth/google_oauth2';
  
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
  if (csrfToken) {
    const csrfInput = document.createElement('input');
    csrfInput.type = 'hidden';
    csrfInput.name = 'authenticity_token';
    csrfInput.value = csrfToken;
    form.appendChild(csrfInput);
  }
  
  document.body.appendChild(form);
  form.submit();
}

function handleLogout() {
  closeMenu();
  
  fetch('/logout', {
    method: 'DELETE',
    headers: {
      'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content
    },
    credentials: 'same-origin'
  })
  .then(response => {
    if (response.ok) {
      window.location.reload();
    } else {
      alert('Failed to logout. Please try again.');
    }
  })
  .catch(error => {
    console.error('Logout error:', error);
    alert('An error occurred during logout.');
  });
}

function updateMenuAuthUI() {
  const authInfo = document.getElementById('auth-info-menu');
  const loginBtn = document.getElementById('login-menu-btn');
  const logoutBtn = document.getElementById('logout-menu-btn');
  
  const currentUser = getCurrentUser();
  
  if (currentUser) {
    if (authInfo) {
      authInfo.style.display = 'block';
      const userName = authInfo.querySelector('.user-name-menu');
      const userEmail = authInfo.querySelector('.user-email');
      if (userName) userName.textContent = currentUser.name || 'User';
      if (userEmail) userEmail.textContent = currentUser.email || '';
    }
    if (loginBtn) loginBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'block';
  } else {
    if (authInfo) authInfo.style.display = 'none';
    if (loginBtn) loginBtn.style.display = 'block';
    if (logoutBtn) logoutBtn.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', function() {
  initializeMenu();
  updateMenuAuthUI();
});

window.updateMenuAuthUI = updateMenuAuthUI;