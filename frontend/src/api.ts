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
  details?: Record<string, unknown>;
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

export async function registerUser(email: string, password: string, username: string, phoneNumber?: string): Promise<AuthResponse> {
  return request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, username, phoneNumber })
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

export async function deleteDevice(token: string, id: string): Promise<void> {
  const response = await fetch(`/api/devices/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? 'Failed to remove device.');
  }
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
    let message = `Unable to load capture content (HTTP ${response.status}).`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body?.message) message = body.message;
    } catch {
      // Non-JSON error body - keep the status-code message.
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export async function deleteCapture(token: string, captureId: string): Promise<void> {
  const response = await fetch(`/api/captures/${captureId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? 'Failed to delete capture.');
  }
}

export type NotificationSettings = {
  alertEmailRecipient: string;
  alertPhoneNumber: string;
};

export type NotificationChannelResult = { configured: boolean; sent: boolean; error?: string };
export type NotificationTestResult = {
  email: NotificationChannelResult;
  push: NotificationChannelResult;
  sms: NotificationChannelResult;
  mobileRelay: NotificationChannelResult;
};

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

export type TrustedUsbDevice = {
  _id?: string;
  id?: string;
  identifier: string;
  label: string;
  createdAt: string;
};

export type UnrecognizedUsbEvent = {
  deviceName: string;
  description: string;
  timestampUtc: string;
};

export async function fetchTrustedUsbDevices(token: string): Promise<TrustedUsbDevice[]> {
  return request('/api/trusted-usb-devices', {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function addTrustedUsbDevice(token: string, identifier: string, label: string): Promise<TrustedUsbDevice> {
  return request('/api/trusted-usb-devices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ identifier, label })
  });
}

export async function removeTrustedUsbDevice(token: string, id: string): Promise<void> {
  const response = await fetch(`/api/trusted-usb-devices/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? response.statusText);
  }
}

export async function fetchUnrecognizedUsbEvents(token: string): Promise<UnrecognizedUsbEvent[]> {
  return request('/api/trusted-usb-devices/recent-unrecognized', {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export type ReverseGeocodeResult = {
  label: string;
  displayName: string | null;
  street: string | null;
  city: string | null;
  country: string | null;
};

export async function reverseGeocode(token: string, lat: number, lon: number): Promise<ReverseGeocodeResult> {
  return request(`/api/geocode/reverse?lat=${lat}&lon=${lon}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function changePassword(token: string, currentPassword: string, newPassword: string): Promise<{ message: string }> {
  return request('/api/auth/password', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ currentPassword, newPassword })
  });
}

export async function fetchPushPublicKey(): Promise<{ publicKey: string }> {
  return request('/api/push/public-key');
}

export async function subscribePush(
  token: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
): Promise<void> {
  await request('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(subscription)
  });
}

export async function unsubscribePush(token: string, endpoint: string): Promise<void> {
  await request('/api/push/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ endpoint })
  });
}

export type AuditLogEntry = {
  _id?: string;
  action: string;
  actorType: 'user' | 'agent' | 'system';
  description: string;
  targetType?: string;
  targetId?: string;
  createdAt: string;
};

export async function fetchAuditLogs(token: string): Promise<AuditLogEntry[]> {
  return request('/api/audit-logs', {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export type ManifestChange = {
  type: 'added' | 'modified' | 'removed';
  relativePath: string;
  previousSha256?: string;
  sha256?: string;
  sizeBytes?: number;
};

export type ManifestSummary = {
  _id?: string;
  id?: string;
  deviceId: string;
  folderId: string;
  path: string;
  label?: string;
  fileCount: number;
  totalBytes: number;
  changeCount: number;
  integrityStatus: 'baseline' | 'unchanged' | 'changed';
  scannedAtUtc: string;
};

export type ManifestDetail = ManifestSummary & {
  changes?: ManifestChange[];
  entries: { relativePath: string; sha256: string; sizeBytes: number; lastModifiedUtc?: string }[];
};

export type ProtectedFolder = {
  _id?: string;
  id?: string;
  deviceId: string;
  path: string;
  label: string;
  enabled: boolean;
  createdAt?: string;
  latestManifest: (ManifestSummary & { changes?: ManifestChange[] }) | null;
};

export type ProtectionStatus = {
  stats: {
    folders: number;
    enabledFolders: number;
    protectedFiles: number;
    totalBytes: number;
    changedFiles: number;
    foldersWithChanges: number;
    lastScanUtc: string | null;
  };
  folders: ProtectedFolder[];
};

export type FileBackup = {
  id: string;
  folderId: string;
  deviceId: string;
  relativePath: string;
  sha256: string;
  sizeBytes: number;
  backedUpAtUtc: string;
};

export async function fetchProtectionStatus(token: string): Promise<ProtectionStatus> {
  return request('/api/protection/status', {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function addProtectedFolder(
  token: string,
  input: { deviceId: string; path: string; label: string }
): Promise<ProtectedFolder> {
  return request('/api/protection/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input)
  });
}

export async function updateProtectedFolder(
  token: string,
  id: string,
  update: { label?: string; enabled?: boolean }
): Promise<ProtectedFolder> {
  return request(`/api/protection/folders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(update)
  });
}

export async function removeProtectedFolder(token: string, id: string): Promise<void> {
  const response = await fetch(`/api/protection/folders/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? 'Failed to remove the protected folder.');
  }
}

export async function fetchManifest(token: string, id: string): Promise<ManifestDetail> {
  return request(`/api/protection/manifests/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function fetchFileBackups(token: string, folderId: string): Promise<FileBackup[]> {
  return request(`/api/protection/backups?folderId=${encodeURIComponent(folderId)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export type NetworkDestination = {
  _id?: string;
  id?: string;
  deviceId: string;
  remoteAddress: string;
  remotePort?: number;
  processName?: string;
  isPublic: boolean;
  verdict: 'unknown' | 'trusted';
  label?: string;
  seenCount: number;
  firstSeenUtc: string;
  lastSeenUtc: string;
};

export type NetworkOverview = {
  stats: {
    activeDevices: number;
    connections: number;
    publicConnections: number;
    destinations: number;
    unknownDestinations: number;
    trustedDestinations: number;
  };
  latest: {
    deviceId: string;
    deviceName: string;
    connectionCount: number;
    publicCount: number;
    unknownCount: number;
    capturedAtUtc: string;
    active: boolean;
  }[];
  destinations: NetworkDestination[];
};

export async function fetchNetworkOverview(token: string): Promise<NetworkOverview> {
  return request('/api/network', {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function setNetworkDestinationVerdict(
  token: string,
  id: string,
  verdict: 'unknown' | 'trusted',
  label?: string
): Promise<NetworkDestination> {
  return request(`/api/network/destinations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ verdict, label })
  });
}

export type RestoreJob = {
  _id?: string;
  id?: string;
  deviceId: string;
  sourceKind: 'capture' | 'protected_file';
  captureId?: string;
  backupId?: string;
  sourcePath?: string;
  restorePath?: string;
  fileName: string;
  sizeBytes?: number;
  status: 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled';
  verificationHash?: string;
  restoredPath?: string;
  error?: string;
  requestedAtUtc: string;
  startedAtUtc?: string;
  completedAtUtc?: string;
};

export type CreateRestoreJobInput = {
  deviceId: string;
  sourceKind: 'capture' | 'protected_file';
  captureId?: string;
  backupId?: string;
  sourcePath?: string;
  restorePath?: string;
  fileName?: string;
  sizeBytes?: number;
  verificationHash?: string;
};

export async function fetchRestoreJobs(token: string): Promise<RestoreJob[]> {
  return request('/api/restore/jobs', {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function createRestoreJob(token: string, input: CreateRestoreJobInput): Promise<RestoreJob> {
  return request('/api/restore/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input)
  });
}

export async function cancelRestoreJob(token: string, id: string): Promise<RestoreJob> {
  return request(`/api/restore/jobs/${id}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
}
