type PortalManager = {
  getPopupWindow(): { closed: boolean } | null;
  closeDialog(): void;
  emit(event: string, error: Error): unknown;
};

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
