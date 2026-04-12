
import './index.css';
import { createRoot } from 'react-dom/client';
import App from './App';

async function init() {
  // Inject mock API before rendering when running outside Electron
  if (!(window as any).api) {
    const { injectMockApi } = await import('./mock-api');
    injectMockApi();
  }
  const root = createRoot(document.getElementById('root')!);
  root.render(<App />);
}

init();