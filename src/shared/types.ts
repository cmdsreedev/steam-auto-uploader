export type FileStatus = 'waiting' | 'converting' | 'uploading' | 'done' | 'error';

export interface VideoFile {
  id: string;       // sha1-ish unique key (just filename hash)
  name: string;     // basename
  filePath: string; // absolute path
  size: string;     // human-readable e.g. "2.4 GB"
  sizeMB: number;
  game: string;     // parent folder name, or "Unknown"
  status: FileStatus;
  progress: number; // 0-100
  modifiedAt: number; // unix ms
}

export interface Settings {
  recordingFolder: string;
  youtubeClientId: string;
  youtubeClientSecret: string;
  youtubeRefreshToken: string;
  defaultPrivacy: 'public' | 'unlisted' | 'private';
}

export interface ElectronAPI {
  selectFolder: () => Promise<string | null>;
  scanFiles: (folder: string) => Promise<VideoFile[]>;
  loadSettings: () => Promise<Settings>;
  saveSettings: (settings: Settings) => Promise<void>;
}
