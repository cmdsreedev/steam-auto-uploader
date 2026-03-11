import React from 'react';

export default function TidyingPopup() {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(15,15,23,0.85)', // var(--bg-primary) with opacity
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      fontFamily: 'Segoe UI, Roboto, sans-serif',
      color: 'var(--text-primary)',
    }}>
      <div style={{
        background: 'var(--bg-card)',
        padding: '32px 48px',
        borderRadius: 16,
        boxShadow: '0 2px 16px rgba(0,0,0,0.25)',
        fontSize: 22,
        fontWeight: 600,
        color: 'var(--text-primary)',
        border: '1px solid var(--border)',
        letterSpacing: '0.02em',
        textAlign: 'center',
      }}>
        Tidying up, please wait...
      </div>
    </div>
  );
}
