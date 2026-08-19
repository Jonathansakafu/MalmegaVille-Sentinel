type AuthResponse = {
  token: string;
  user: {
    email: string;
    id: string;
    username: string;
  };
};

export type Device = {
  _id?: string;
  deviceId: string;
  name: string;
  operatingSystem: string;
  lastSeen: string;
  securityStatus: string;
  isLost?: boolean;
  lostAt?: string | null;
};

export type Incident = {
  _id?: string;
  deviceId: string;
  incidentType: string;
  threatScore: number;
  severity: string;
  summary: string;
  createdAt: string;
};

export type Capture = {
  _id?: string;
  id?: string;
  deviceId: string;
  captureType: 'webcam_photo' | 'usb_file' | 'usb_manifest' | 'location';
  triggerEvent?: string;
  sessionId?: string;
  originalFileName?: string;
  originalPath?: string;
  sizeBytes?: number;
  skipped: boolean;
  skipReason?: string;
  capturedAtUtc: string;
  metadata?: Record<string, unknown>;
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, options);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = body?.message ?? response.statusText;
    throw new Error(message);
  }
  return response.json();
}

export async function loginUser(email: string, password: string): Promise<AuthResponse> {
  return request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
}

export async function registerUser(email: string, password: string, username: string): Promise<AuthResponse> {
  return request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, username })
  });
}

export async function updateUsername(token: string, username: string): Promise<{ username: string }> {
  return request('/api/auth/username', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ username })
  });
}

export async function fetchDevices(token: string): Promise<Device[]> {
  return request('/api/devices', {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function fetchIncidents(token: string): Promise<Incident[]> {
  return request('/api/incidents', {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function setDeviceLostStatus(token: string, id: string, isLost: boolean): Promise<Device> {
  return request(`/api/devices/${id}/lost-status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ isLost })
  });
}

export async function fetchCaptures(token: string, deviceId?: string): Promise<Capture[]> {
  const query = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : '';
  return request(`/api/captures${query}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function fetchCaptureBlobUrl(token: string, captureId: string): Promise<string> {
  const response = await fetch(`/api/captures/${captureId}/content`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    throw new Error('Unable to load capture content.');
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export type NotificationSettings = {
  alertEmailRecipient: string;
  telegramBotToken: string;
  telegramChatId: string;
};

export type NotificationChannelResult = { configured: boolean; sent: boolean; error?: string };
export type NotificationTestResult = { email: NotificationChannelResult; telegram: NotificationChannelResult };

export async function fetchNotificationSettings(token: string): Promise<NotificationSettings> {
  return request('/api/settings/notifications', {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function saveNotificationSettings(token: string, settings: NotificationSettings): Promise<NotificationSettings> {
  return request('/api/settings/notifications', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(settings)
  });
}

export async function sendTestAlert(token: string): Promise<NotificationTestResult> {
  return request('/api/settings/notifications/test', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
}
