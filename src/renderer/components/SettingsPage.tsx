import { useState, useEffect } from 'react';
import type { Settings, EncoderOption } from '../../shared/types';
import { IconArrowLeft, IconFolder } from './Icons';

export default function SettingsPage({ settings, onSave, onBack }: {
  settings: Settings;
  onSave: (s: Settings) => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [saving, setSaving] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [availableEncoders, setAvailableEncoders] = useState<EncoderOption[]>([]);
  const [detectingEncoders, setDetectingEncoders] = useState(false);

  const detectEncoders = () => {
    setDetectingEncoders(true);
    window.api.detectEncoders()
      .then(setAvailableEncoders)
      .catch(console.error)
      .finally(() => setDetectingEncoders(false));
  };

  useEffect(() => { detectEncoders(); }, []);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const handleBrowseRecording = async () => {
    const folder = await window.api.selectFolder();
    if (folder) set('recordingFolder', folder);
  };

  const handleBrowseConverted = async () => {
    const folder = await window.api.selectFolder();
    if (folder) set('convertedFolder', folder);
  };

  const handleSave = async () => {
    setSaving(true);
    await window.api.saveSettings(draft);
    onSave(draft);
    setSaving(false);
    onBack();
  };

  const handleAuthorize = async () => {
    setAuthorizing(true);
    try {
      const result = await window.api.youtubeAuthorize();
      const updated: Settings = {
        ...draft,
        youtubeRefreshToken: result.refreshToken,
        youtubeChannelId: result.channelId,
        youtubeChannelName: result.channelName,
        youtubeChannelThumbnail: result.channelThumbnail,
      };
      setDraft(updated);
      await window.api.saveSettings(updated);
      onSave(updated);
    } catch (err) {
      alert(`Authorization failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setAuthorizing(false);
    }
  };

  const handleCancel = async () => {
    try { await window.api.youtubeCancel(); }
    catch (err) { console.error(err); }
    finally { setAuthorizing(false); }
  };

  const handleDisconnect = async () => {
    await window.api.youtubeDisconnect();
    const updated: Settings = {
      ...draft,
      youtubeRefreshToken: '',
      youtubeChannelId: undefined,
      youtubeChannelName: undefined,
      youtubeChannelThumbnail: undefined,
    };
    setDraft(updated);
    onSave(updated);
  };

  const isConnected = !!(draft.youtubeRefreshToken && draft.youtubeChannelName);

  // Normalize protocol-relative URLs (//lh3.googleusercontent.com) that break in Electron
  const normalizeUrl = (url?: string) => {
    if (!url) return undefined;
    if (url.startsWith('//')) return 'https:' + url;
    return url;
  };
  const isGpu = !!(draft.gpuEncoder && draft.gpuEncoder !== 'cpu');
  const gpuEncoders = availableEncoders.filter(e => e.type !== 'cpu' && e.supported);

  const handleGpuToggle = () => {
    if (gpuEncoders.length > 0) {
      set('gpuEncoder', gpuEncoders[0].type);
    }
  };

  return (
    <div className="app">
      <div className="main-content">

        {/* Page header */}
        <div className="settings-page-header">
          <button className="btn-icon" onClick={onBack} title="Back to Videos">
            <IconArrowLeft />
          </button>
          <div className="toolbar-title">Settings</div>
        </div>

        {/* Scrollable card stack */}
        <div className="settings-scroll">

          {/* ── Google Authentication ── */}
          <div className="settings-card">
            <div className="settings-card-header">
              <div>
                <div className="settings-card-title">Google Authentication</div>
                <div className="settings-card-subtitle">Connect your Google account to upload videos to YouTube</div>
              </div>
            </div>
            <div className="settings-card-body">
              {isConnected ? (
                <div className="youtube-auth-status">
                  {draft.youtubeChannelThumbnail ? (
                    <img
                      className="youtube-avatar"
                      src={normalizeUrl(draft.youtubeChannelThumbnail)}
                      alt=""
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="youtube-avatar" style={{ background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                      {draft.youtubeChannelName?.[0]?.toUpperCase() ?? 'Y'}
                    </div>
                  )}
                  <div className="youtube-auth-info">
                    <span className="youtube-auth-label">Connected</span>
                    <span className="youtube-channel-name">{draft.youtubeChannelName}</span>
                  </div>
                  <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={handleDisconnect}>
                    Disconnect
                  </button>
                </div>
              ) : authorizing ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary" disabled style={{ flex: 1 }}>
                    Waiting for browser authorization…
                  </button>
                  <button className="btn btn-ghost" onClick={handleCancel}>Cancel</button>
                </div>
              ) : (
                <>
                  <button className="btn btn-primary" onClick={handleAuthorize} style={{ alignSelf: 'flex-start' }}>
                    Connect Google Account
                  </button>
                  <p className="form-hint" style={{ marginTop: 0 }}>
                    Make sure <code style={{ fontFamily: 'monospace', fontSize: 11, background: 'var(--bg-card)', padding: '1px 4px', borderRadius: 3 }}>GOOGLE_OAUTH_CLIENT_ID</code> and <code style={{ fontFamily: 'monospace', fontSize: 11, background: 'var(--bg-card)', padding: '1px 4px', borderRadius: 3 }}>GOOGLE_OAUTH_CLIENT_SECRET</code> are set in your .env file before connecting.
                  </p>
                </>
              )}
            </div>
          </div>

          {/* ── Folders to Scan ── */}
          <div className="settings-card">
            <div className="settings-card-header">
              <div>
                <div className="settings-card-title">Folders to Scan</div>
                <div className="settings-card-subtitle">Directories where game recordings are stored</div>
              </div>
              <button className="btn btn-secondary settings-card-header-btn" onClick={handleBrowseRecording}>
                <IconFolder /> Browse
              </button>
            </div>
            <div className="settings-card-body">
              <div className="settings-folder-row">
                <span className="settings-folder-path">
                  {draft.recordingFolder || 'No folder selected — click Browse'}
                </span>
              </div>
              <div className="settings-field">
                <label className="settings-field-label">Converted Videos Destination</label>
                <div className="settings-browse-row">
                  <input
                    className="input"
                    placeholder="Leave blank for default (Videos/SteamAutoUploader)"
                    value={draft.convertedFolder || ''}
                    onChange={e => set('convertedFolder', e.target.value)}
                  />
                  <button className="btn btn-secondary" onClick={handleBrowseConverted}>Browse</button>
                </div>
                <span className="form-hint">Where converted MP4 files are saved.</span>
              </div>
            </div>
          </div>

          {/* ── Processing Settings ── */}
          <div className="settings-card">
            <div className="settings-card-header">
              <div>
                <div className="settings-card-title">Processing Settings</div>
                <div className="settings-card-subtitle">FFmpeg encoding configuration</div>
              </div>
              <button
                className="btn btn-secondary settings-card-header-btn"
                onClick={detectEncoders}
                disabled={detectingEncoders}
                title="Re-scan for GPU encoders"
              >
                {detectingEncoders ? 'Detecting…' : '↺ Detect'}
              </button>
            </div>
            <div className="settings-card-body">
              <div className="settings-field">
                <div className="settings-field-label">Encoding Type</div>
                <div className="settings-toggle-group">
                  <button
                    className={`settings-toggle-option${isGpu ? ' settings-toggle-active' : ''}`}
                    onClick={handleGpuToggle}
                    disabled={gpuEncoders.length === 0}
                    title={gpuEncoders.length === 0 ? 'No GPU encoders detected' : undefined}
                  >
                    <div className="settings-toggle-title">
                      GPU Encoding
                      {gpuEncoders.length === 0 && <span style={{ opacity: 0.45, fontWeight: 400 }}> (none detected)</span>}
                    </div>
                    <div className="settings-toggle-desc">Faster, uses graphics card</div>
                  </button>
                  <button
                    className={`settings-toggle-option${!isGpu ? ' settings-toggle-active' : ''}`}
                    onClick={() => set('gpuEncoder', 'cpu')}
                  >
                    <div className="settings-toggle-title">Software Encoding</div>
                    <div className="settings-toggle-desc">Better quality, slower</div>
                  </button>
                </div>
                {isGpu && gpuEncoders.length > 1 && (
                  <select
                    className="input"
                    value={draft.gpuEncoder || ''}
                    onChange={(e) => set('gpuEncoder', e.target.value as Settings['gpuEncoder'])}
                    style={{ cursor: 'pointer', marginTop: 4 }}
                  >
                    {gpuEncoders.map(e => (
                      <option key={e.type} value={e.type}>{e.name}</option>
                    ))}
                  </select>
                )}
                {draft.gpuEncoder && (
                  <span className="form-hint">
                    {availableEncoders.find(e => e.type === draft.gpuEncoder)?.description}
                  </span>
                )}
              </div>

              <div className="settings-field">
                <label className="settings-field-label">FFmpeg Binary Path</label>
                <input
                  className="input"
                  placeholder="Leave blank to auto-detect bundled FFmpeg"
                  value={draft.ffmpegPath || ''}
                  onChange={e => set('ffmpegPath', e.target.value)}
                />
                <span className="form-hint">
                  Path to FFmpeg bin folder (e.g. C:\ffmpeg\bin). Leave blank to auto-detect.
                </span>
              </div>
            </div>
          </div>

          {/* ── YouTube Settings ── */}
          <div className="settings-card">
            <div className="settings-card-header">
              <div>
                <div className="settings-card-title">YouTube Settings</div>
                <div className="settings-card-subtitle">Upload preferences and defaults</div>
              </div>
            </div>
            <div className="settings-card-body">
              <div className="settings-field">
                <div className="settings-field-label">Default Video Privacy</div>
                <div className="settings-toggle-group">
                  {(['public', 'unlisted', 'private'] as const).map((p) => (
                    <button
                      key={p}
                      className={`settings-toggle-option${draft.defaultPrivacy === p ? ' settings-toggle-active' : ''}`}
                      onClick={() => set('defaultPrivacy', p)}
                    >
                      <div className="settings-toggle-title" style={{ textTransform: 'capitalize' }}>{p}</div>
                      <div className="settings-toggle-desc">
                        {p === 'public' ? 'Anyone can see' : p === 'unlisted' ? 'Only via link' : 'Only you'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── App Data Cleanup ── */}
          <div className="settings-card" style={{ borderColor: 'rgba(245,91,91,0.25)' }}>
            <div className="settings-card-header">
              <div>
                <div className="settings-card-title" style={{ color: 'var(--error)' }}>App Data Cleanup</div>
                <div className="settings-card-subtitle">Clears all session records and workflow state. Cannot be undone.</div>
              </div>
            </div>
            <div className="settings-card-body">
              <button
                className="btn btn-danger"
                style={{ alignSelf: 'flex-start' }}
                onClick={async () => {
                  const confirmed = window.confirm('Clear all session records? This cannot be undone.');
                  if (!confirmed) return;
                  await window.api.clearDB();
                  window.alert('App data cleared.');
                }}
              >
                Clear App Data
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Footer */}
      <div className="settings-footer">
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
        <button className="btn btn-ghost" onClick={onBack}>Cancel</button>
      </div>
    </div>
  );
}
