import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AlertProvider } from './components/ui/Alerts';
import { ConfirmProvider } from './components/ui/Confirm';
import { useExperienceSettings } from './lib/experience';
import { sound } from './lib/sound';
import './index.css';

function Root() {
  useExperienceSettings();

  useEffect(() => sound.attachGlobalInteractions(), []);

  return (
    <AlertProvider>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </AlertProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  </React.StrictMode>
);
