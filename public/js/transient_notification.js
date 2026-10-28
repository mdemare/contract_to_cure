import { reportNotification } from './error_reporting.js';

// Display a notification to the user
export function showNotification(message, type = 'info', cssClass = 'game-notification') {
  reportNotification(message, type);

  // Create notification element
  const notification = document.createElement('div');
  notification.classList.add(cssClass, type);
  notification.textContent = message;

  // Append to body
  document.body.appendChild(notification);

  // Remove after 3 seconds
  setTimeout(() => {
    notification.classList.add('fade-out');

    // Remove from DOM after fade animation
    setTimeout(() => {
      notification.remove();
    }, 500);
  }, 3000);
}

