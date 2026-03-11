import type { VideoFile } from '../../shared/types';

export default function ProgressCell({ file }: { file: VideoFile }) {
  // If currently converting, show progress bar, percentage, and estimated time
  if (file.conversionProgress !== undefined && file.conversionProgress > 0 && file.conversionProgress < 100) {
    const progress = file.conversionProgress;
    const duration = file.durationSeconds || 0;
    let estimatedSeconds = null;
    if (progress > 0 && duration > 0) {
      const processed = (progress / 100) * duration;
      const remaining = duration - processed;
      const elapsed = processed / (progress / 100);
      estimatedSeconds = Math.round(remaining * (elapsed / processed));
    }
    // Human readable time (hh:mm:ss)
    function formatTime(sec: number): string {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = Math.floor(sec % 60);
      return [
        h > 0 ? String(h).padStart(2, '0') : null,
        m > 0 || h > 0 ? String(m).padStart(2, '0') : null,
        String(s).padStart(2, '0')
      ].filter(Boolean).join(':');
    }
    return (
      <div className="progress-wrap" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
          <div className="progress-bar" style={{ flex: 1 }}>
            <div className="progress-fill progress-fill-converting" style={{ width: `${progress}%` }} />
          </div>
          <span className="progress-pct" style={{ marginLeft: 8 }}>{Math.round(progress)}%</span>
        </div>
        {estimatedSeconds !== null && estimatedSeconds > 0 && (
          <div className="progress-estimate" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, textAlign: 'left' }}>
            Estimated time left: {formatTime(estimatedSeconds)}
          </div>
        )}
      </div>
    );
  }

  if (file.status === 'waiting' || file.status === 'done') {
    return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>;
  }

  const fillClass =
    file.status === 'error'     ? 'progress-fill-error' :
    file.status === 'uploading' ? 'progress-fill-uploading' :
                                  'progress-fill-converting';

  return (
    <div className="progress-wrap">
      <div className="progress-bar">
        <div className={`progress-fill ${fillClass}`} style={{ width: `${file.progress}%` }} />
      </div>
      <span className="progress-pct">
        {file.status === 'error' ? 'Err' : `${file.progress}%`}
      </span>
    </div>
  );
}