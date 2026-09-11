let handLimitHandler = null;
const pendingPrompts = [];

export function registerHandLimitHandler(handler) {
  handLimitHandler = handler;
  pendingPrompts.splice(0).forEach(({ playerIndex, discardCount, resolve, reject }) => {
    Promise.resolve(handLimitHandler(playerIndex, discardCount)).then(resolve, reject);
  });
}

export async function promptHandLimit(playerIndex, discardCount) {
  if (handLimitHandler) {
    await handLimitHandler(playerIndex, discardCount);
    return;
  }

  await new Promise((resolve, reject) => {
    pendingPrompts.push({ playerIndex, discardCount, resolve, reject });
  });
}
