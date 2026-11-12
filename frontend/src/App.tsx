import { useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import AboutPage from './pages/AboutPage';
import ServicesPage from './pages/ServicesPage';
import DownloadPage from './pages/DownloadPage';
import LoginPage from './pages/LoginPage';
import DashboardLayout from './pages/app/DashboardLayout';
import OverviewPage from './pages/app/OverviewPage';
import DevicesPage from './pages/app/DevicesPage';
import DeviceDetailPage from './pages/app/DeviceDetailPage';
import ThreatsPage from './pages/app/ThreatsPage';
import UsbPage from './pages/app/UsbPage';
import TimelinePage from './pages/app/TimelinePage';
import EvidencePage from './pages/app/EvidencePage';
import ReportsPage from './pages/app/ReportsPage';
import SettingsPage from './pages/app/SettingsPage';
import UnavailablePage from './pages/app/UnavailablePage';

function App() {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem('userEmail') ?? '');
  const [username, setUsername] = useState(() => localStorage.getItem('username') ?? '');

  const handleAuthSuccess = (authToken: string, emailAddress: string, displayName: string) => {
    localStorage.setItem('token', authToken);
    localStorage.setItem('userEmail', emailAddress);
    localStorage.setItem('username', displayName);
    sessionStorage.removeItem('sentinel_booted');
    setToken(authToken);
    setUserEmail(emailAddress);
    setUsername(displayName);
    navigate('/dashboard');
  };

  const handleUsernameChange = (newUsername: string) => {
    localStorage.setItem('username', newUsername);
    setUsername(newUsername);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('username');
    sessionStorage.removeItem('sentinel_booted');
    setToken(null);
    setUserEmail('');
    setUsername('');
    navigate('/');
  };

  const isAuthenticated = Boolean(token);

  return (
    <Routes>
      <Route path="/" element={<HomePage isAuthenticated={isAuthenticated} />} />
      <Route path="/about" element={<AboutPage isAuthenticated={isAuthenticated} />} />
      <Route path="/services" element={<ServicesPage isAuthenticated={isAuthenticated} />} />
      <Route path="/download" element={<DownloadPage isAuthenticated={isAuthenticated} />} />
      <Route
        path="/login"
        element={token ? <Navigate to="/dashboard" replace /> : <LoginPage onAuthSuccess={handleAuthSuccess} />}
      />
      <Route
        path="/dashboard"
        element={
          token ? (
            <DashboardLayout
              token={token}
              userEmail={userEmail}
              username={username}
              onUsernameChange={handleUsernameChange}
              onLogout={handleLogout}
            />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="devices" element={<DevicesPage />} />
        <Route path="devices/:deviceId" element={<DeviceDetailPage />} />
        <Route path="threats" element={<ThreatsPage />} />
        <Route path="usb" element={<UsbPage />} />
        <Route path="timeline" element={<TimelinePage />} />
        <Route path="evidence" element={<EvidencePage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="file-protection" element={<UnavailablePage moduleKey="file-protection" />} />
        <Route path="network" element={<UnavailablePage moduleKey="network" />} />
        <Route path="restore" element={<UnavailablePage moduleKey="restore" />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
