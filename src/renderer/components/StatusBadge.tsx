import type { FileStatus } from '../../shared/types';

const STATUS_LABEL: Record<FileStatus, string> = {
  waiting: 'Waiting',
  converting: 'Converting',
  paused: 'Paused',
  uploading: 'Uploading',
  done: 'Processed',
  error: 'Error',
};

export default function StatusBadge({ status, errorMessage }: { status: FileStatus, errorMessage?: string }) {
  const tooltip = status === 'error' && errorMessage ? errorMessage : undefined;
  return (
    <span className={`badge badge-${status}`} title={tooltip} style={tooltip ? { cursor: 'help' } : {}}>
      <span className="badge-dot" />
      {STATUS_LABEL[status]}
    </span>
  );
}