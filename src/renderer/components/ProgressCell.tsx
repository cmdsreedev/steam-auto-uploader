import type { VideoFile } from '../../shared/types';

export default function ProgressCell({ file }: { file: VideoFile }) {
  if (file.status === 'waiting') {
    return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>;
  }

  const fillClass =
    file.status === 'done'      ? 'progress-fill-done' :
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