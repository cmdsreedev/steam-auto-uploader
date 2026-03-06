import { useState } from 'react';
import type { Settings } from '../../shared/types';
import { IconArrowLeft, IconFolder } from './Icons';

export default function SettingsPage({ settings, onSave, onBack }: {
  settings: Settings;
  onSave: (s: Settings) => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const handleBrowse = async () => {
    const folder = await window.api.selectFolder();
    if (folder) set('recordingFolder', folder);
  };

  const handleSave = async () => {
    setSaving(true);
    await window.api.saveSettings(draft);
    onSave(draft);
    setSaving(false);
    onBack();
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-title">
          <button className="btn-icon" onClick={onBack} title="Back" style={{ marginRight: 4 }}>
            <IconArrowLeft />
          </button>
          <span style={{ fontWeight: 'bold', fontSize: '1.2em' }}>Settings</span>
        </div>
      </header>

      <div className="settings-content">
        {/* Recording folder */}
        <div className="settings-section">
          <div className="settings-section-title">Recording Folder</div>
          <div className="form-field">
            <label className="form-label">Steam Recording Path</label>
            <div className="input-row">
              <input
                className="input"
                placeholder="C:\Users\You\Videos\Steam Recordings"
                value={draft.recordingFolder}
                onChange={(e) => set('recordingFolder', e.target.value)}
              />
              <button className="btn btn-secondary" onClick={handleBrowse}>
                <IconFolder /> Browse
              </button>
            </div>
            <span className="form-hint">
              Folder where Steam saves game recordings (usually inside your Videos library).
            </span>
          </div>
        </div>

        {/* YouTube credentials */}
        <div className="settings-section">
          <div className="settings-section-title">YouTube Credentials</div>

          <div className="form-field">
            <label className="form-label">OAuth Client ID</label>
            <input
              className="input input-mono"
              placeholder="123456789-abc.apps.googleusercontent.com"
              value={draft.youtubeClientId}
              onChange={(e) => set('youtubeClientId', e.target.value)}
            />
          </div>

          <div className="form-field">
            <label className="form-label">OAuth Client Secret</label>
            <input
              className="input input-mono"
              type="password"
              placeholder="GOCSPX-..."
              value={draft.youtubeClientSecret}
              onChange={(e) => set('youtubeClientSecret', e.target.value)}
            />
            <span className="form-hint">
              Create credentials at Google Cloud Console → APIs &amp; Services → Credentials.
              Enable the YouTube Data API v3 and create an OAuth 2.0 Client ID (Desktop app).
            </span>
          </div>

          <div className="form-field">
            <label className="form-label">Refresh Token</label>
            <div className="input-row">
              <input
                className="input input-mono"
                type="password"
                placeholder="Obtained after authorizing the app"
                value={draft.youtubeRefreshToken}
                onChange={(e) => set('youtubeRefreshToken', e.target.value)}
              />
              <button className="btn btn-secondary">Authorize</button>
            </div>
          </div>
        </div>

        {/* Upload defaults */}
        <div className="settings-section">
          <div className="settings-section-title">Upload Defaults</div>
          <div className="form-field">
            <label className="form-label">Default Privacy</label>
            <select
              className="input"
              value={draft.defaultPrivacy}
              onChange={(e) => set('defaultPrivacy', e.target.value as Settings['defaultPrivacy'])}
              style={{ cursor: 'pointer' }}
            >
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
              <option value="private">Private</option>
            </select>
          </div>
        </div>
      </div>

      <div className="settings-footer">
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
        <button className="btn btn-ghost" onClick={onBack}>Cancel</button>
      </div>
    </div>
  );
}