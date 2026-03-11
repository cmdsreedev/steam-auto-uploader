import { useState, useEffect, useCallback } from 'react';
import type { VideoFile, Settings } from '../shared/types';
import MainPage from './components/MainPage';
import SettingsPage from './components/SettingsPage';
import TidyingPopup from './components/TidyingPopup';

// ── Types ─────────────────────────────────────────────────────────────────────

type Page = 'main' | 'settings';

// ── Default settings ──────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: Settings = {
  recordingFolder: '',
  youtubeClientId: '',
  youtubeClientSecret: '',
  youtubeRefreshToken: '',
  defaultPrivacy: 'unlisted',
};

// ── App root ──────────────────────────────────────────────────────────────────

export default function App() {
  const [page, setPage] = useState<Page>('main');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [files, setFiles] = useState<VideoFile[]>([]);
  const [loading, setLoading] = useState(true);

  // Load settings on mount, then scan the folder
  useEffect(() => {
    if (!window.api || typeof window.api.loadSettings !== 'function') {
      setLoading(false);
      return;
    }
    window.api.loadSettings().then((saved) => {
      setSettings(saved);
      return saved.recordingFolder
        ? window.api.scanFiles(saved.recordingFolder)
        : Promise.resolve([] as VideoFile[]);
    }).then((scanned) => {
      setFiles(scanned);
      setLoading(false);
    });
  }, []);

  const refresh = useCallback(() => {
    if (!settings.recordingFolder) return;
    setLoading(true);
    window.api.scanFiles(settings.recordingFolder).then((scanned) => {
      setFiles(scanned);
      setLoading(false);
    });
  }, [settings.recordingFolder]);

  // Re-scan whenever the folder changes after saving settings
  const handleSaveSettings = useCallback((updated: Settings) => {
    setSettings(updated);
    if (updated.recordingFolder) {
      setLoading(true);
      window.api.scanFiles(updated.recordingFolder).then((scanned) => {
        setFiles(scanned);
        setLoading(false);
      });
    } else {
      setFiles([]);
    }
  }, []);

  const [tidying, setTidying] = useState(false);

  // Handler for close button
  const handleClose = () => {
    setTidying(true);
    window.electronAPI.closeWindow();
    // Optionally hide popup after a delay if needed
    // setTimeout(() => setTidying(false), 3000);
  };

  const pageContent = page === 'settings' ? (
    <SettingsPage
      settings={settings}
      onSave={handleSaveSettings}
      onBack={() => setPage('main')}
    />
  ) : (
    <MainPage
      files={files}
      folder={settings.recordingFolder}
      loading={loading}
      onRefresh={refresh}
      onOpenSettings={() => setPage('settings')}
    />
  );

  return (
    <>
      <div className="bar">
        <div className="title-bar-content" style={{ WebkitAppRegion: 'drag' }}>
          <span className="title">Steam Auto Uploader</span>
        </div>
        <div className="title-bar-buttons" style={{ WebkitAppRegion: 'no-drag' }}>
          <button id="min-btn" className="title-bar-button" onClick={() => window.electronAPI.minimizeWindow()}>−</button>
          <button id="max-btn" className="title-bar-button" onClick={() => window.electronAPI.maximizeWindow()}>□</button>
          <button id="close-btn" className="title-bar-button close" onClick={handleClose}>✕</button>
        </div>
      </div>
      {page !== 'settings' && (
        <div className="action-bar" style={{ WebkitAppRegion: 'no-drag' }}>
          <button id="refresh-btn" className="action-button" title="Refresh" onClick={refresh}>⟳</button>
          <button id="settings-btn" className="action-button" title="Settings" onClick={() => setPage('settings')}>⚙</button>
        </div>
      )}
      {pageContent}
      {tidying && <TidyingPopup />}
    </>
  );
}
