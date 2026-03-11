  import React, { useState, useEffect } from 'react';
  import type { VideoFile } from '../../shared/types';
  import { IconFolder, IconUpload, IconRefresh, IconFilm } from './Icons';
  import { IconAbort } from './Icons';
  import StatusBadge from './StatusBadge';
  import ProgressCell from './ProgressCell';
  import ProcessedActionsMenu from './ProcessedActionsMenu';
  import VideoPreview from './VideoPreview';

  type Tab = 'recordings' | 'processed';

  const IconProcess = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  );

  const IconPlay = () => (
    <svg className="thumb-play" width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="none">
      <polygon points="6 3 20 12 6 21 6 3"/>
    </svg>
  );

  export default function MainPage({ files, folder, loading, onRefresh, onOpenSettings }: {
    files: VideoFile[];
    folder: string;
    loading: boolean;
    onRefresh: () => void;
    onOpenSettings: () => void;
  }) {
    const [tab, setTab] = useState<Tab>('recordings');
    // Removed gameNames cache, now use VideoFile.thumbnailUrl directly
    const [previewFile, setPreviewFile] = useState<VideoFile | null>(null);
    const [conversionProgress, setConversionProgress] = useState<Record<string, number>>({});

    const recordings = files;
    const processed = files.filter(f => f.convertedPath);
    const displayFiles = tab === 'recordings' ? recordings : processed;

    const getGameName = (file: VideoFile) => file.game;
    const getThumbnail = (file: VideoFile) => {
      // Show placeholder if thumbnail is missing or empty
      if (!file.thumbnailUrl) return '/assets/steam-placeholder.png';
      return file.thumbnailUrl;
    };

    const handleUploadClick = async (file: VideoFile) => {
      if (!file.convertedPath) return;
      try {
        await window.api.startUpload(file.id);
        onRefresh();
      } catch (error) {
        alert('Failed to upload file: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }
    };

    const handleConvertClick = async (file: VideoFile) => {
      if (file.status === 'converting') {
        console.log('Conversion already in progress');
        return;
      }
      try {
        await window.api.startConversion(file.id, file.mpdPath);
        onRefresh();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errorMessage.includes('already exists')) {
          const action = window.confirm(
            `A converted video already exists for this recording.\n\nPress OK to replace the file, or Cancel to skip conversion and mark as processed.`
          );
          if (action) {
            try {
              await window.api.startConversionForce(file.id, file.mpdPath);
              onRefresh();
            } catch (forceError) {
              alert(`Force conversion failed: ${forceError instanceof Error ? forceError.message : 'Unknown error'}`);
            }
          } else {
            await window.api.updateSessionStatus(file.id, 'done', { convertedPath: file.convertedPath });
            onRefresh();
          }
        } else {
          alert(`Conversion failed: ${errorMessage}`);
        }
      }
    };

    const handleCancelConversion = async (file: VideoFile) => {
      const confirmed = window.confirm('Abort conversion? This will delete any partially generated file.');
      if (!confirmed) return;
      try {
        await window.api.cancelConversion(file.id);
        onRefresh();
      } catch (error) {
        alert(`Failed to cancel conversion: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };

    const handleDeleteProcessed = async (file: VideoFile) => {
      if (!file.convertedPath) return;
      const confirmed = window.confirm('Delete the processed video file? This cannot be undone.');
      if (!confirmed) return;
      try {
        await window.api.deleteProcessedFile(file.id, file.convertedPath);
        onRefresh();
      } catch (error) {
        alert('Failed to delete processed file: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }
    };

    const handleShowDetails = (file: VideoFile) => {
      const specs = `Resolution: ${file.resolution}\nDuration: ${file.duration}\nCodec: ${file.codec}`;
      window.alert(`Processed file location:\n${file.convertedPath}\n\nVideo specs:\n${specs}`);
    };

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
            {/* Removed Clear DB button from toolbar-right */}
          </div>

          <div className="tabs">
            <button
              className={`tab ${tab === 'recordings' ? 'tab-active' : ''}`}
              onClick={() => setTab('recordings')}
            >
              Recordings ({recordings.length})
            </button>
            <button
              className={`tab ${tab === 'processed' ? 'tab-active' : ''}`}
              onClick={() => setTab('processed')}
            >
              Processed ({processed.length})
            </button>
          </div>

          <div className="table-wrapper">
            {loading ? (
              <div className="empty-state">
                <p style={{ color: 'var(--text-muted)' }}>Scanning folder...</p>
              </div>
            ) : displayFiles.length === 0 ? (
              <div className="empty-state">
                <IconFilm />
                <p>
                  {!folder
                    ? 'Open Settings and set your Steam recordings folder to get started.'
                    : tab === 'recordings'
                      ? 'No recordings found.'
                      : 'No processed recordings yet.'}
                </p>
              </div>
            ) : (
              <table className="files-table">
                <thead>
                  <tr>
                    <th className="col-thumb" />
                    <th className="col-game">Game</th>
                    <th className="col-duration">Duration</th>
                    <th className="col-resolution">Resolution</th>
                    <th className="col-status">Status</th>
                    <th className="col-progress">Progress</th>
                    <th className="col-actions" />
                  </tr>
                </thead>
                <tbody>
                  {displayFiles.map((file) => {
                    const thumb = getThumbnail(file);
                    // Use polled progress if available, otherwise use file data
                    const fileWithProgress = {
                      ...file,
                      conversionProgress: conversionProgress[file.id] ?? file.conversionProgress,
                    };
                    return (
                      <tr key={file.id}>
                        <td className="col-thumb">
                          <div className="thumb-container" onClick={() => setPreviewFile(file)}>
                            {thumb ? (
                              <img className="game-thumb" src={thumb} alt="" />
                            ) : (
                              <div className="game-thumb game-thumb-placeholder" />
                            )}
                            <IconPlay />
                          </div>
                        </td>
                        <td className="col-game">
                          <div className="game-name">{getGameName(file)}</div>
                          <div className="file-meta">Session #{file.sessionIndex}</div>
                        </td>
                        <td className="col-duration">{file.duration}</td>
                        <td className="col-resolution" style={{ color: 'var(--text-secondary)' }}>{file.resolution}</td>
                        <td className="col-status">
                          <StatusBadge status={file.status} errorMessage={file.status === 'error' && file.errorMessage ? file.errorMessage : undefined} />
                        </td>
                        <td className="col-progress"><ProgressCell file={fileWithProgress} /></td>
                        <td className="col-actions">
                          {!file.convertedPath ? (
                            file.status === 'converting' ? (
                              <button
                                className="btn-icon"
                                title="Abort Conversion"
                                onClick={() => handleCancelConversion(file)}
                                style={{ color: 'var(--danger)', opacity: 1 }}
                              >
                                <IconAbort />
                              </button>
                            ) : (
                              <button
                                className="btn-icon"
                                title={file.status === 'error' ? 'Retry' : 'Convert'}
                                onClick={() => handleConvertClick(file)}
                              >
                                {file.status === 'error' ? <IconRefresh /> : <IconProcess />}
                              </button>
                            )
                          ) : (
                            <>
                              <button 
                                className="btn-icon" 
                                title={file.status === 'uploading' ? 'Uploading...' : 'Upload'}
                                onClick={() => handleUploadClick(file)}
                                disabled={file.status === 'uploading'}
                                style={{ opacity: file.status === 'uploading' ? 0.6 : 1, cursor: file.status === 'uploading' ? 'not-allowed' : 'pointer' }}
                              >
                                {file.status === 'error' ? <IconRefresh /> : <IconUpload />}
                              </button>
                              {tab === 'processed' && (
                                <ProcessedActionsMenu
                                  file={file}
                                  onDelete={() => handleDeleteProcessed(file)}
                                  onDetails={() => handleShowDetails(file)}
                                />
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {previewFile && (
          <VideoPreview
            sessionId={previewFile.id}
            videoDir={previewFile.videoDir}
            title={`${getGameName(previewFile)} — Session #${previewFile.sessionIndex}`}
            onClose={() => setPreviewFile(null)}
          />
        )}
      </div>
    );
  }
