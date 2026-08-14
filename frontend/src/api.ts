type AuthResponse = {
  token: string;
  user: {
    email: string;
    id: string;
  };
};

type Device = {
  _id?: string;
  deviceId: string;
  name: string;
  operatingSystem: string;
  lastSeen: string;
  securityStatus: string;
};

type Incident = {
  _id?: string;
  deviceId: string;
  incidentType: string;
  threatScore: number;
  severity: string;
  summary: string;
  createdAt: string;
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

export async function registerUser(email: string, password: string): Promise<AuthResponse> {
  return request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
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
