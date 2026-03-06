import type { VideoFile } from '../../shared/types';
import { IconFolder, IconUpload, IconRefresh, IconFilm } from './Icons';
import StatusBadge from './StatusBadge';
import ProgressCell from './ProgressCell';

export default function MainPage({ files, folder, loading, onRefresh, onOpenSettings }: {
  files: VideoFile[];
  folder: string;
  loading: boolean;
  onRefresh: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <div className="app">
      <div className="main-content">
        <div className="toolbar">
          <div className="toolbar-left">
            <IconFolder />
            <span className="folder-path">
              {folder || 'No folder configured — open Settings to set one'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" disabled={files.length === 0}>
              <IconUpload /> Upload All
            </button>
          </div>
        </div>

        <div className="table-wrapper">
          {loading ? (
            <div className="empty-state">
              <p style={{ color: 'var(--text-muted)' }}>Scanning folder...</p>
            </div>
          ) : files.length === 0 ? (
            <div className="empty-state">
              <IconFilm />
              <p>
                {folder
                  ? 'No video files found in the configured folder.'
                  : 'Open Settings and set your Steam recordings folder to get started.'}
              </p>
            </div>
          ) : (
            <table className="files-table">
              <thead>
                <tr>
                  <th className="col-name">File</th>
                  <th className="col-size">Size</th>
                  <th className="col-game">Game</th>
                  <th className="col-status">Status</th>
                  <th className="col-progress">Progress</th>
                  <th className="col-actions" />
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr key={file.id}>
                    <td className="col-name">
                      <div className="file-name">{file.name}</div>
                    </td>
                    <td className="col-size">{file.size}</td>
                    <td className="col-game" style={{ color: 'var(--text-secondary)' }}>{file.game}</td>
                    <td className="col-status"><StatusBadge status={file.status} /></td>
                    <td className="col-progress"><ProgressCell file={file} /></td>
                    <td className="col-actions">
                      <button className="btn-icon" title="Upload">
                        {file.status === 'error' ? <IconRefresh /> : <IconUpload />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}