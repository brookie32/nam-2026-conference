import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConferenceProvider } from './lib/store.jsx';
import { Toaster } from './components/Toaster.jsx';
import { App } from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Toaster>
        <ConferenceProvider>
          <App />
        </ConferenceProvider>
      </Toaster>
    </BrowserRouter>
  </StrictMode>,
);

// Production only: a worker in dev would serve stale modules from Vite.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
