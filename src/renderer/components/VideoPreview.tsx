import { useEffect, useRef, useState } from 'react';
// eslint-disable-next-line import/no-unresolved
import * as dashjs from 'dashjs';

export default function VideoPreview({ sessionId, videoDir, title, onClose }: {
  sessionId: string;
  videoDir: string;
  title: string;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let player: dashjs.MediaPlayerClass | null = null;

    window.api.getPreviewUrl(sessionId, videoDir)
      .then((mpdUrl) => {
        player = dashjs.MediaPlayer().create();
        player.initialize(video, mpdUrl, false);
      })
      .catch(() => setError('Failed to load video'));

    return () => {
      if (player) player.destroy();
    };
  }, [sessionId, videoDir]);

  return (
    <div className="preview-overlay" onClick={onClose}>
      <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="preview-header">
          <span className="preview-title">{title}</span>
          <button className="btn-icon" onClick={onClose} title="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        {error ? (
          <div className="preview-error">{error}</div>
        ) : (
          <video ref={videoRef} className="preview-video" controls />
        )}
      </div>
    </div>
  );
}
