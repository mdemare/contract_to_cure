// Keep transient failures available after their notification disappears.
const dsn = globalThis.document?.querySelector?.('meta[name="sentry-dsn"]')?.content;
let sentry = null;

if (dsn) {
  try {
    if (!globalThis.Sentry) throw new Error('Sentry browser SDK unavailable');
    globalThis.Sentry.init({
      dsn,
      environment: document.querySelector('meta[name="sentry-environment"]')?.content,
      sendDefaultPii: false
    });
    sentry = globalThis.Sentry;
  } catch (error) {
    console.error('Failed to initialize error reporting', error);
  }
}

export function reportNotification(message, type) {
  if (type !== 'error' && type !== 'warning') return;

  if (type === 'error') console.error(message);
  else console.warn(message);

  // A telemetry failure must never prevent the notification from appearing.
  try {
    sentry?.captureMessage(message, type);
  } catch (error) {
    console.error('Failed to report notification to Sentry', error);
  }
}
