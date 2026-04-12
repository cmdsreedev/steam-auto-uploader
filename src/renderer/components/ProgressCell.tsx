import type { VideoFile } from '../../shared/types';

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

export default function ProgressCell({ file, gpuEncoder }: { file: VideoFile; gpuEncoder?: string }) {
  const isGpu = gpuEncoder && gpuEncoder !== 'cpu';

  // Active progress bar — converting or uploading
  if (file.conversionProgress !== undefined && file.conversionProgress > 0 && file.conversionProgress < 100) {
    const progress = file.conversionProgress;
    const isUploading = file.status === 'uploading';

    let estimatedSeconds = null;
    if (!isUploading) {
      const duration = file.durationSeconds || 0;
      if (progress > 0 && duration > 0) {
        const processed = (progress / 100) * duration;
        const remaining = duration - processed;
        const elapsed = processed / (progress / 100);
        estimatedSeconds = Math.round(remaining * (elapsed / processed));
      }
    }

    const fillClass = isUploading
      ? 'progress-fill progress-fill-uploading'
      : isGpu
        ? 'progress-fill progress-fill-gpu'
        : 'progress-fill progress-fill-converting';

    return (
      <div className="progress-wrap" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
          <div className="progress-bar" style={{ flex: 1 }}>
            <div className={fillClass} style={{ width: `${progress}%` }} />
          </div>
          <span className="progress-pct" style={{ marginLeft: 8 }}>{Math.round(progress)}%</span>
        </div>
        {estimatedSeconds !== null && estimatedSeconds > 0 && (
          <div className="progress-estimate" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, textAlign: 'left' }}>
            {isGpu ? '⚡ ' : ''}Estimated time left: {formatTime(estimatedSeconds)}
          </div>
        )}
      </div>
    );
  }

  if (file.status === 'paused') {
    const pct = file.conversionProgress ?? 0;
    const checkpoint = file.pauseTimemark ? file.pauseTimemark.split('.')[0] : null; // trim subseconds
    return (
      <div className="progress-wrap" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
          <div className="progress-bar" style={{ flex: 1 }}>
            <div className="progress-fill progress-fill-paused" style={{ width: `${pct}%` }} />
          </div>
          <span className="progress-pct" style={{ marginLeft: 8 }}>{Math.round(pct)}%</span>
        </div>
        {checkpoint && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
            ⏸ checkpoint @ {checkpoint}
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