import React, { useState, useEffect } from 'react';
import type { VideoFile } from '../../shared/types';
import { IconUpload, IconRefresh, IconFilm } from './Icons';
import { IconAbort } from './Icons';
import ProcessedActionsMenu from './ProcessedActionsMenu';
import VideoPreview from './VideoPreview';

const IconProcess = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="5 3 19 12 5 21 5 3"/>
  </svg>
);

const IconPlay = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="white" stroke="none">
    <polygon points="6 3 20 12 6 21 6 3"/>
  </svg>
);

const VC_STATUS_LABEL: Record<string, string> = {
  waiting: 'Ready',
  converting: 'Processing',
  paused: 'Paused',
  uploading: 'Uploading',
  done: 'Processed',
  error: 'Error',
};

export default function MainPage({ files, folder, loading, onRefresh, onSilentRefresh, onOpenSettings, gpuEncoder }: {
  files: VideoFile[];
  folder: string;
  loading: boolean;
  onRefresh: () => void;
  onSilentRefresh: () => void;
  onOpenSettings: () => void;
  gpuEncoder?: string;
}) {
  const [previewFile, setPreviewFile] = useState<VideoFile | null>(null);
  const [conversionProgress, setConversionProgress] = useState<Record<string, number>>({});

  const displayFiles = files;

  const getGameName = (file: VideoFile) => file.game;

  const formatRecordingDate = (ms: number) => {
    const d = new Date(ms);
    const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return `${date} · ${time}`;
  };

  const getThumbnail = (file: VideoFile) => {
    if (!file.thumbnailUrl) return '/assets/steam-placeholder.png';
    return file.thumbnailUrl;
  };

  const handleUploadClick = async (file: VideoFile) => {
    if (!file.convertedPath) return;
    try {
      const title = `${file.game} - ${formatRecordingDate(file.modifiedAt)}`;
      const description = [
        `Game: ${file.game}`,
        `Duration: ${file.duration}`,
        `Resolution: ${file.resolution}`,
        '',
        'Recorded with Steam and uploaded with Steam Auto Uploader.',
      ].join('\n');
      await window.api.startUpload(file.id, file.convertedPath, title, description);
      onRefresh();
    } catch (error) {
      alert('Failed to upload: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleConvertClick = async (file: VideoFile) => {
    if (file.status === 'converting') return;
    try {
      await window.api.startConversion(file.id, file.mpdPath);
      onRefresh();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('already exists')) {
        const action = window.confirm(
          `A converted video already exists.\n\nOK to replace the file, or Cancel to mark as processed.`
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
      alert(`Failed to abort: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handlePauseConversion = async (file: VideoFile) => {
    try {
      await window.api.pauseConversion(file.id);
      onRefresh();
    } catch (error) {
      alert(`Failed to pause: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleResumeConversion = async (file: VideoFile) => {
    try {
      await window.api.resumeConversion(file.id, file.mpdPath);
      onRefresh();
    } catch (error) {
      alert(`Failed to resume: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      alert('Failed to delete: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleShowDetails = (file: VideoFile) => {
    const specs = `Resolution: ${file.resolution}\nDuration: ${file.duration}\nCodec: ${file.codec}`;
    window.alert(`Processed file:\n${file.convertedPath}\n\nSpecs:\n${specs}`);
  };

  // Poll progress for active jobs every second — only updates the progress bar,
  // never triggers a full list re-scan so the list never flickers.
  // When a job finishes (isActive=false) we do a single silent refresh to pick up the status change.
  useEffect(() => {
    const activeFiles = files.filter(f => f.status === 'converting' || f.status === 'uploading');
    if (activeFiles.length === 0) return;

    const interval = setInterval(async () => {
      const updates: Record<string, number> = {};
      let jobFinished = false;

      await Promise.all(activeFiles.map(async (file) => {
        try {
          const result = await window.api.getConversionProgress(file.id);
          updates[file.id] = result.progress;
          if (!result.isActive) jobFinished = true;
        } catch {
          // ignore transient errors
        }
      }));

      setConversionProgress(prev => ({ ...prev, ...updates }));
      if (jobFinished) onSilentRefresh();
    }, 1000);

    return () => clearInterval(interval);
  }, [files, onSilentRefresh]);

  return (
    <div className="app">
      <div className="main-content">

        {/* Header */}
        <div className="toolbar">
          <div className="toolbar-left">
            <div className="toolbar-title">Game Recordings</div>
            {!loading && (
              <div className="toolbar-subtitle">
                {displayFiles.length > 0
                  ? `${displayFiles.length} recording${displayFiles.length !== 1 ? 's' : ''} found`
                  : folder
                    ? 'No recordings found'
                    : 'No folder configured — open Settings to get started'}
              </div>
            )}
          </div>
          <div className="toolbar-right">
            {folder && (
              <span className="folder-path" title={folder}>{folder}</span>
            )}
            <button
              className="btn btn-secondary"
              onClick={onRefresh}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <IconRefresh />
              {loading ? 'Scanning…' : 'Scan Folders'}
            </button>
          </div>
        </div>

        {/* List */}
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
                  : 'No recordings found.'}
              </p>
            </div>
          ) : (
            <div className="video-list">
              {displayFiles.map((file) => {
                const thumb = getThumbnail(file);
                const progress = conversionProgress[file.id] ?? file.conversionProgress ?? 0;
                const isGpu = gpuEncoder && gpuEncoder !== 'cpu';

                return (
                  <div className="video-card" key={file.id} data-status={file.status}>

                    {/* Thumbnail */}
                    <div className="vc-thumb" onClick={() => setPreviewFile(file)}>
                      <img
                        className="vc-img"
                        src={thumb}
                        alt=""
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/assets/steam-placeholder.png';
                        }}
                      />
                      <span className="vc-duration">{file.duration}</span>
                      <div className="vc-play"><IconPlay /></div>
                    </div>

                    {/* Body */}
                    <div className="vc-body">
                      <div className="vc-title">{getGameName(file)}</div>
                      <div className="vc-meta">
                        <span>{file.resolution}</span>
                        <span className="vc-sep">•</span>
                        <span>{formatRecordingDate(file.modifiedAt)}</span>
                        <span className="vc-sep">•</span>
                        <span className={`vc-status-${file.status}`}>
                          {VC_STATUS_LABEL[file.status] ?? file.status}
                        </span>
                      </div>
                      {(file.convertedPath || file.mpdPath) && (
                        <div className="vc-path">{file.convertedPath || file.mpdPath}</div>
                      )}

                      {/* Progress bar (converting / uploading) */}
                      {(file.status === 'converting' || file.status === 'uploading') && (
                        <div className="vc-progress">
                          <div className="vc-progress-top">
                            <span className="vc-progress-label">
                              {file.status === 'uploading'
                                ? 'Uploading to YouTube'
                                : isGpu ? '⚡ Processing (GPU)' : 'Processing video'}
                            </span>
                            <span className="vc-progress-pct">{Math.round(progress)}%</span>
                          </div>
                          <div className="vc-progress-bar">
                            <div
                              className={`vc-progress-fill ${
                                file.status === 'uploading'
                                  ? 'progress-fill-uploading'
                                  : isGpu ? 'progress-fill-gpu' : 'progress-fill-converting'
                              }`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Paused checkpoint note */}
                      {file.status === 'paused' && (
                        <div className="vc-paused-note">
                          ⏸{' '}
                          {file.pauseTimemark
                            ? `Checkpoint at ${file.pauseTimemark.split('.')[0]}`
                            : 'Paused'}
                          {progress > 0 && ` — ${Math.round(progress)}% complete`}
                        </div>
                      )}

                      {/* Error message */}
                      {file.status === 'error' && file.errorMessage && (
                        <div className="vc-error-msg">{file.errorMessage}</div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="vc-actions">
                      {file.status === 'converting' ? (
                        <div className="vc-active-btns">
                          <button className="btn-icon" title="Pause Conversion" onClick={() => handlePauseConversion(file)}>⏸</button>
                          <button className="btn-icon" title="Abort Conversion" onClick={() => handleCancelConversion(file)} style={{ color: 'var(--error)' }}><IconAbort /></button>
                        </div>
                      ) : file.status === 'paused' ? (
                        <div className="vc-active-btns">
                          <button
                            className="btn-action btn-action-primary"
                            title={file.pauseTimemark ? `Resume from ${file.pauseTimemark.split('.')[0]}` : 'Resume'}
                            onClick={() => handleResumeConversion(file)}
                          >
                            ▶ Resume
                          </button>
                          <button className="btn-icon" title="Abort Conversion" onClick={() => handleCancelConversion(file)} style={{ color: 'var(--error)' }}><IconAbort /></button>
                        </div>
                      ) : file.status === 'uploading' ? (
                        <span className="vc-uploading-chip">Uploading…</span>
                      ) : file.status === 'done' && file.youtubeVideoId ? (
                        <>
                          <button
                            className="btn-action btn-action-youtube"
                            onClick={() => window.api.openExternal(`https://www.youtube.com/watch?v=${file.youtubeVideoId}`)}
                          >
                            ▶ View on YouTube
                          </button>
                          <ProcessedActionsMenu
                            file={file}
                            onDelete={() => handleDeleteProcessed(file)}
                            onDetails={() => handleShowDetails(file)}
                            onShowInFolder={() => file.convertedPath && window.api.showItemInFolder(file.convertedPath)}
                          />
                        </>
                      ) : file.status === 'done' && file.convertedPath ? (
                        <>
                          <button
                            className="btn-action btn-action-primary"
                            onClick={() => handleUploadClick(file)}
                          >
                            <IconUpload /> Upload to YouTube
                          </button>
                          <ProcessedActionsMenu
                            file={file}
                            onDelete={() => handleDeleteProcessed(file)}
                            onDetails={() => handleShowDetails(file)}
                            onShowInFolder={() => file.convertedPath && window.api.showItemInFolder(file.convertedPath)}
                          />
                        </>
                      ) : file.status === 'error' ? (
                        <button
                          className="btn-action btn-action-danger"
                          onClick={() => handleConvertClick(file)}
                        >
                          <IconRefresh /> Retry
                        </button>
                      ) : (
                        <button
                          className="btn-action btn-action-primary"
                          onClick={() => handleConvertClick(file)}
                        >
                          <IconProcess /> Convert
                        </button>
                      )}
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {previewFile && (
        <VideoPreview
          sessionId={previewFile.id}
          videoDir={previewFile.videoDir}
          title={`${getGameName(previewFile)} — ${formatRecordingDate(previewFile.modifiedAt)}`}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
}
