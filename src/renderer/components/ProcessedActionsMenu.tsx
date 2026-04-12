import { useState } from 'react';
import { IconSettings } from './Icons';

export default function ProcessedActionsMenu({ file, onDelete, onDetails, onShowInFolder }: {
  file: any;
  onDelete: () => void;
  onDetails: () => void;
  onShowInFolder: () => void;
}) {
  const [open, setOpen] = useState(false);

  const menuItemStyle: React.CSSProperties = {
    width: '100%',
    textAlign: 'left',
    padding: '6px 12px',
    background: 'none',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button className="btn-icon" title="Actions" onClick={() => setOpen(v => !v)}>
        <IconSettings />
      </button>
      {open && (
        <>
          {/* Backdrop to close menu when clicking outside */}
          <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setOpen(false)} />
          <div className="actions-menu" style={{ position: 'absolute', zIndex: 10, right: 0, top: '100%', background: '#222', color: '#fff', borderRadius: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.4)', minWidth: 160 }}>
            <button className="menu-item" style={menuItemStyle} onClick={() => { setOpen(false); onShowInFolder(); }}>
              📁 Show in Folder
            </button>
            <button className="menu-item" style={menuItemStyle} onClick={() => { setOpen(false); onDetails(); }}>
              Details
            </button>
            <div style={{ borderTop: '1px solid #444', margin: '2px 0' }} />
            <button className="menu-item" style={{ ...menuItemStyle, color: '#ff6b6b' }} onClick={() => { setOpen(false); onDelete(); }}>
              Delete File
            </button>
          </div>
        </>
      )}
    </div>
  );
}
