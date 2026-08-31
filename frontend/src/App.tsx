import { useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import AboutPage from './pages/AboutPage';
import ServicesPage from './pages/ServicesPage';
import DownloadPage from './pages/DownloadPage';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';

function App() {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem('userEmail') ?? '');
  const [username, setUsername] = useState(() => localStorage.getItem('username') ?? '');

  const handleAuthSuccess = (authToken: string, emailAddress: string, displayName: string) => {
    localStorage.setItem('token', authToken);
    localStorage.setItem('userEmail', emailAddress);
    localStorage.setItem('username', displayName);
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
            <DashboardPage
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
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
