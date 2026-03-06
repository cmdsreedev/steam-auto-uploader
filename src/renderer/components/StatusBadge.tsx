import type { FileStatus } from '../../shared/types';

const STATUS_LABEL: Record<FileStatus, string> = {
  waiting: 'Waiting',
  converting: 'Converting',
  uploading: 'Uploading',
  done: 'Done',
  error: 'Error',
};

export default function StatusBadge({ status }: { status: FileStatus }) {
  return (
    <span className={`badge badge-${status}`}>
      <span className="badge-dot" />
      {STATUS_LABEL[status]}
    </span>
  );
}