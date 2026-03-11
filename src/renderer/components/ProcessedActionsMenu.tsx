import { useState } from 'react';
import { IconSettings } from './Icons';

export default function ProcessedActionsMenu({ file, onDelete, onDetails }: {
  file: any;
  onDelete: () => void;
  onDetails: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button className="btn-icon" title="Actions" onClick={() => setOpen(v => !v)}>
        <IconSettings />
      </button>
      {open && (
        <div className="actions-menu" style={{ position: 'absolute', zIndex: 10, right: 0, top: '100%', background: '#222', color: '#fff', borderRadius: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.2)', minWidth: 120 }}>
          <button className="menu-item" onClick={() => { setOpen(false); onDetails(); }} style={{ width: '100%', textAlign: 'left', padding: '6px 12px', background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>Details</button>
          <button className="menu-item" onClick={() => { setOpen(false); onDelete(); }} style={{ width: '100%', textAlign: 'left', padding: '6px 12px', background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>Delete</button>
        </div>
      )}
    </div>
  );
}
