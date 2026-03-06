// Title bar button event handlers

// Window control buttons
document.getElementById('min-btn')?.addEventListener('click', () => {
  (window as any).electronAPI?.minimizeWindow();
});

document.getElementById('max-btn')?.addEventListener('click', () => {
  (window as any).electronAPI?.maximizeWindow();
});

document.getElementById('close-btn')?.addEventListener('click', () => {
  (window as any).electronAPI?.closeWindow();
});

// Action buttons - dispatch custom events
document.getElementById('refresh-btn')?.addEventListener('click', () => {
  window.dispatchEvent(new CustomEvent('titlebar-refresh'));
});

document.getElementById('settings-btn')?.addEventListener('click', () => {
  window.dispatchEvent(new CustomEvent('titlebar-settings'));
});
