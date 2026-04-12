/**
 * Browser-mode mock for window.api and window.electronAPI.
 * Injected by index.tsx when running outside Electron (e.g. `npm run dev:web`).
 */

import type { ElectronAPI, Settings, VideoFile } from '../shared/types';

const MOCK_SETTINGS: Settings = {
  recordingFolder: 'C:\\Users\\Dev\\Videos\\Steam Recordings',
  convertedFolder: 'C:\\Users\\Dev\\Videos\\SteamAutoUploader',
  youtubeClientId: '',
  youtubeClientSecret: '',
  youtubeRefreshToken: '',
  defaultPrivacy: 'unlisted',
};

const MOCK_FILES: VideoFile[] = [
  {
    id: 'mock-id-waiting-01',
    appId: '730',
    game: 'Counter-Strike 2',
    thumbnailUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg',
    sessionIndex: 1,
    duration: '45m 12s',
    durationSeconds: 2712,
    resolution: '2560x1440',
    codec: 'hev1.2.4.L123.B0',
    mpdPath: 'C:\\mock\\bg_730_20240315_183000\\session.mpd',
    videoDir: 'C:\\mock\\bg_730_20240315_183000',
    status: 'waiting',
    progress: 0,
    modifiedAt: Date.now() - 3600000,
  },
  {
    id: 'mock-id-converting-02',
    appId: '570',
    game: 'Dota 2',
    thumbnailUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/570/header.jpg',
    sessionIndex: 2,
    duration: '1h 10m 5s',
    durationSeconds: 4205,
    resolution: '1920x1080',
    codec: 'hev1.2.4.L123.B0',
    mpdPath: 'C:\\mock\\bg_570_20240315_200000\\session.mpd',
    videoDir: 'C:\\mock\\bg_570_20240315_200000',
    status: 'converting',
    progress: 0,
    conversionProgress: 47,
    modifiedAt: Date.now() - 1800000,
  },
  {
    id: 'mock-id-done-03',
    appId: '1172470',
    game: 'Apex Legends',
    thumbnailUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/1172470/header.jpg',
    sessionIndex: 1,
    duration: '32m 44s',
    durationSeconds: 1964,
    resolution: '2560x1440',
    codec: 'hev1.2.4.L123.B0',
    mpdPath: 'C:\\mock\\bg_1172470_20240314_153000\\session.mpd',
    videoDir: 'C:\\mock\\bg_1172470_20240314_153000',
    status: 'done',
    progress: 100,
    conversionProgress: 100,
    convertedPath: 'C:\\Users\\Dev\\Videos\\SteamAutoUploader\\mock-id-done-03.mp4',
    modifiedAt: Date.now() - 86400000,
  },
  {
    id: 'mock-id-error-04',
    appId: '252950',
    game: 'Rocket League',
    thumbnailUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/252950/header.jpg',
    sessionIndex: 3,
    duration: '18m 30s',
    durationSeconds: 1110,
    resolution: '1920x1080',
    codec: 'hev1.2.4.L123.B0',
    mpdPath: 'C:\\mock\\bg_252950_20240313_211500\\session.mpd',
    videoDir: 'C:\\mock\\bg_252950_20240313_211500',
    status: 'error',
    progress: 0,
    errorMessage: 'FFmpeg exited with code 1: Invalid data found when processing input',
    modifiedAt: Date.now() - 172800000,
  },
];

export const mockApi: ElectronAPI = {
  loadSettings: () => Promise.resolve(MOCK_SETTINGS),
  scanFiles: (_folder) => Promise.resolve(MOCK_FILES),
  saveSettings: (_settings) => Promise.resolve(),
  selectFolder: () => Promise.resolve('C:\\Users\\Dev\\Videos\\Steam Recordings'),
  updateSessionStatus: (_id, _status, _extra) => Promise.resolve(),
  getGameInfo: (appId) => Promise.resolve({ name: `Game ${appId}`, thumbnailUrl: `/assets/steam-placeholder.png` }),
  getMediaPort: () => Promise.resolve(49152),
  getPreviewUrl: (_sessionId, _videoDir) => Promise.resolve(''),
  startConversion: (_id, _mpdPath) => {
    console.log('[mock] startConversion', _id);
    return Promise.resolve({ status: 'started' });
  },
  startConversionForce: (_id, _mpdPath) => {
    console.log('[mock] startConversionForce', _id);
    return Promise.resolve({ status: 'started' });
  },
  cancelConversion: (_id) => {
    console.log('[mock] cancelConversion', _id);
    return Promise.resolve({ status: 'cancelled' });
  },
  pauseConversion: (_id) => {
    console.log('[mock] pauseConversion', _id);
    return Promise.resolve({ status: 'paused' });
  },
  resumeConversion: (_id) => {
    console.log('[mock] resumeConversion', _id);
    return Promise.resolve({ status: 'converting' });
  },
  getConversionProgress: (_id) => Promise.resolve({ progress: 0, isActive: false }),
  startUpload: (_id, _convertedPath, _title) => {
    console.log('[mock] startUpload', _id, _title);
    return Promise.resolve({ status: 'uploading' });
  },
  deleteProcessedFile: (_id, _path) => {
    console.log('[mock] deleteProcessedFile', _id);
    return Promise.resolve({ status: 'deleted' });
  },
  clearDB: () => Promise.resolve(),
  youtubeAuthorize: () => {
    console.log('[mock] youtubeAuthorize');
    return new Promise((resolve) => setTimeout(() => resolve({
      refreshToken: 'mock-refresh-token',
      channelId: 'UCmockChannelId',
      channelName: 'My Gaming Channel',
      channelThumbnail: 'https://yt3.googleusercontent.com/ytc/APkrFKZWeMCsx4Q9e_Hm6nhOOUQ3fv96QGUXiMr1-pPL=s88',
    }), 1500));
  },
  youtubeDisconnect: () => {
    console.log('[mock] youtubeDisconnect');
    return Promise.resolve();
  },
  youtubeCancel: () => {
    console.log('[mock] youtubeCancel');
    return Promise.resolve();
  },
};

export function injectMockApi() {
  (window as any).api = mockApi;
  (window as any).electronAPI = {
    minimizeWindow: () => console.log('[mock] minimizeWindow'),
    maximizeWindow: () => console.log('[mock] maximizeWindow'),
    closeWindow: () => console.log('[mock] closeWindow'),
  };
}
