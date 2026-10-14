type PortalManager = {
  getPopupWindow(): { closed: boolean } | null;
  closeDialog(): void;
  emit(event: string, error: Error): unknown;
};

export async function signWithPopupRecovery<T>(manager: PortalManager, open: () => Promise<T>): Promise<T> {
  let monitor: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  const started = Date.now();
  let sawPopup = false;
  const recovery = new Promise<never>((_, reject) => {
    monitor = setInterval(() => {
      const popup = manager.getPopupWindow();
      if (popup) sawPopup = true;
      const cancelled = sawPopup && (!popup || popup.closed);
      if (!stopped && (cancelled || Date.now() - started >= 60_000)) {
        stopped = true;
        const error = new Error(cancelled
          ? 'Passkey approval was cancelled. You can try again.'
          : 'Passkey approval timed out. No command was submitted. You can try again.');
        reject(error);
        manager.emit('error', error);
        manager.closeDialog();
      }
    }, 250);
  });
  try {
    const pending = open();
    sawPopup = Boolean(manager.getPopupWindow());
    return await Promise.race([pending, recovery]);
  } catch (cause) {
    manager.closeDialog();
    const message = cause instanceof Error ? cause.message : String(cause);
    if (/popup was blocked/i.test(message)) {
      throw new Error('Your browser blocked the approval window. Allow popups for GAMESOL, then try again. No command was submitted.');
    }
    throw cause;
  } finally {
    stopped = true;
    if (monitor !== undefined) clearInterval(monitor);
  }
}

// Only use for reads/preparation, never submission or confirmation: a timeout
// must not permit retrying a transaction that may already have landed.
export async function withPreparationTimeout<T>(pending: Promise<T>, message = 'Wallet preparation timed out. No command was submitted. Please retry.'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([pending, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), 20_000);
    })]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// Reject through the SDK's own error listener so its connecting flag and dialog
// are cleaned up together, rather than racing a still-running wallet creation.
export async function connectWithPopupRecovery<T>(manager: PortalManager, open: () => Promise<T>): Promise<T> {
  const pending = open();
  let sawPopup = Boolean(manager.getPopupWindow());
  const monitor = setInterval(() => {
    const popup = manager.getPopupWindow();
    if (popup) sawPopup = true;
    if (sawPopup && (!popup || popup.closed)) {
      manager.emit('error', new Error('Sign-in was cancelled. Select Start playing to try again.'));
      manager.closeDialog();
    }
  }, 250);
  try {
    return await pending;
  } catch (cause) {
    manager.closeDialog();
    const message = cause instanceof Error ? cause.message : String(cause);
    if (/popup was blocked/i.test(message)) {
      throw new Error('Your browser blocked the sign-in window. Allow popups for GAMESOL, then try again.');
    }
    if (/timed out/i.test(message)) {
      throw new Error('Sign-in did not finish. Retry and complete the passkey prompt in the Lazor window. In an embedded browser, open GAMESOL directly in Chrome or Edge.');
    }
    throw cause;
  } finally {
    clearInterval(monitor);
  }
}
