export type FileStatus = 'waiting' | 'converting' | 'paused' | 'uploading' | 'done' | 'error';

export interface VideoFile {
  id: string;
  appId: string;          // Steam App ID extracted from folder name
  game: string;           // display name from Steam API, or folder name as fallback
  thumbnailUrl: string;   // Steam header image URL
  sessionIndex: number;
  duration: string;       // human-readable e.g. "50m 54s"
  durationSeconds: number;
  resolution: string;     // e.g. "2560x1440"
  codec: string;          // e.g. "hev1.2.4.L123.B0"
  mpdPath: string;        // absolute path to session.mpd
  videoDir: string;       // absolute path to the session folder with m4s chunks
  status: FileStatus;
  progress: number;       // 0-100
  conversionProgress?: number; // 0-100, for conversion progress tracking
  pauseTimemark?: string;      // e.g. "00:05:23" — checkpoint saved on pause for partial resume
  convertedPath?: string;      // path to converted MP4 file
  youtubeVideoId?: string;     // YouTube video ID after successful upload
  errorMessage?: string;       // human-readable error for status === 'error'
  modifiedAt: number;     // unix ms
}

export interface Settings {
  recordingFolder: string;
  convertedFolder?: string;
  ffmpegPath?: string;
  youtubeClientId: string;
  youtubeClientSecret: string;
  youtubeRefreshToken: string;
  youtubeChannelId?: string;
  youtubeChannelName?: string;
  youtubeChannelThumbnail?: string;
  defaultPrivacy: 'public' | 'unlisted' | 'private';
  gpuEncoder?: 'cpu' | 'nvidia' | 'amd' | 'intel' | 'videotoolbox';
}

export interface EncoderOption {
  type: 'cpu' | 'nvidia' | 'amd' | 'intel' | 'videotoolbox';
  name: string;
  supported: boolean;
  description: string;
}

export interface ElectronAPI {
  selectFolder: () => Promise<string | null>;
  scanFiles: (folder: string) => Promise<VideoFile[]>;
  loadSettings: () => Promise<Settings>;
  saveSettings: (settings: Settings) => Promise<void>;
  detectEncoders: () => Promise<EncoderOption[]>;
  updateSessionStatus: (id: string, status: FileStatus, extra?: { youtubeVideoId?: string; convertedPath?: string }) => Promise<void>;
  getGameInfo: (appId: string) => Promise<{ name: string; thumbnailUrl: string } | null>;
  getMediaPort: () => Promise<number>;
  getPreviewUrl: (sessionId: string, videoDir: string) => Promise<string>;
  startConversion: (sessionId: string, mpdPath: string) => Promise<{ status: string }>;
  startConversionForce: (sessionId: string, mpdPath: string) => Promise<{ status: string }>;
  cancelConversion: (sessionId: string) => Promise<{ status: string }>;
  pauseConversion: (sessionId: string) => Promise<{ status: string }>;
  resumeConversion: (sessionId: string, mpdPath: string) => Promise<{ status: string }>;
  getConversionProgress: (sessionId: string) => Promise<{ progress: number; isActive: boolean }>;
  startUpload: (sessionId: string, convertedPath: string, title: string, description?: string) => Promise<{ status: string }>;
  clearDB: () => Promise<any>;
  deleteProcessedFile: (sessionId: string, convertedPath: string) => Promise<{ status: string }>;
  youtubeAuthorize: () => Promise<{ refreshToken: string; channelId: string; channelName: string; channelThumbnail: string }>;
  youtubeDisconnect: () => Promise<void>;
  youtubeCancel: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  showItemInFolder: (filePath: string) => Promise<void>;
}
declare global {
  interface Window {
    electronAPI: {
      minimizeWindow: () => void;
      maximizeWindow: () => void;
      closeWindow: () => void;
    };
    api: ElectronAPI;
  }
}
