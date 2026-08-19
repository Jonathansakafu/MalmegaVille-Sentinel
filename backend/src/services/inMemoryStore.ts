// Fallback data store used only when DBLESS_TEST_MODE is enabled, so the
// backend can be exercised (sign-in, notification settings) without a
// working MongoDB installation. Data lives only for the life of the process.

export interface InMemoryUser {
  id: string;
  email: string;
  username?: string;
  passwordHash: string;
}

const users: InMemoryUser[] = [];
let nextUserId = 1;

export function findUserByEmail(email: string): InMemoryUser | undefined {
  return users.find((user) => user.email === email);
}

export function findUserById(id: string): InMemoryUser | undefined {
  return users.find((user) => user.id === id);
}

export function findUserByUsername(username: string): InMemoryUser | undefined {
  return users.find((user) => user.username === username);
}

export function createUser(email: string, passwordHash: string, username?: string): InMemoryUser {
  const user: InMemoryUser = { id: String(nextUserId++), email, username, passwordHash };
  users.push(user);
  return user;
}

export function updateUsername(id: string, username: string): InMemoryUser | undefined {
  const user = findUserById(id);
  if (!user) return undefined;
  user.username = username;
  return user;
}

export interface InMemoryNotificationSettings {
  alertEmailRecipient: string;
  telegramBotToken: string;
  telegramChatId: string;
}

let notificationSettings: InMemoryNotificationSettings = {
  alertEmailRecipient: '',
  telegramBotToken: '',
  telegramChatId: ''
};

export function getNotificationSettings(): InMemoryNotificationSettings {
  return notificationSettings;
}

export function saveNotificationSettings(update: InMemoryNotificationSettings): InMemoryNotificationSettings {
  notificationSettings = { ...update };
  return notificationSettings;
}

export interface InMemoryDevice {
  id: string;
  userId: string;
  deviceId: string;
  name: string;
  operatingSystem: string;
  lastSeen: Date;
  securityStatus: string;
  isLost: boolean;
  lostAt: Date | null;
}

const devices: InMemoryDevice[] = [];
let nextDeviceId = 1;

export function listDevicesForUser(userId: string): InMemoryDevice[] {
  return devices.filter((device) => device.userId === userId);
}

export function findDeviceByDeviceId(deviceId: string): InMemoryDevice | undefined {
  return devices.find((device) => device.deviceId === deviceId);
}

export function findDeviceByIdForUser(id: string, userId: string): InMemoryDevice | undefined {
  return devices.find((device) => device.id === id && device.userId === userId);
}

export function upsertDevice(input: {
  userId: string;
  deviceId: string;
  name: string;
  operatingSystem: string;
}): InMemoryDevice {
  const existing = devices.find((device) => device.userId === input.userId && device.deviceId === input.deviceId);
  if (existing) {
    existing.name = input.name;
    existing.operatingSystem = input.operatingSystem;
    existing.lastSeen = new Date();
    return existing;
  }

  const device: InMemoryDevice = {
    id: String(nextDeviceId++),
    userId: input.userId,
    deviceId: input.deviceId,
    name: input.name,
    operatingSystem: input.operatingSystem,
    lastSeen: new Date(),
    securityStatus: 'safe',
    isLost: false,
    lostAt: null
  };
  devices.push(device);
  return device;
}

export function setDeviceLostStatus(id: string, userId: string, isLost: boolean): InMemoryDevice | undefined {
  const device = findDeviceByIdForUser(id, userId);
  if (!device) return undefined;
  device.isLost = isLost;
  device.lostAt = isLost ? new Date() : null;
  device.securityStatus = isLost ? 'stolen' : 'safe';
  return device;
}

export interface InMemoryCapture {
  id: string;
  userId: string;
  deviceId: string;
  captureType: 'webcam_photo' | 'usb_file' | 'usb_manifest' | 'location';
  triggerEvent?: string;
  sessionId?: string;
  originalFileName?: string;
  originalPath?: string;
  sizeBytes?: number;
  mimeType?: string;
  storagePath?: string;
  skipped: boolean;
  skipReason?: string;
  capturedAtUtc: Date;
  uploadedAtUtc: Date;
  metadata: Record<string, unknown>;
}

const captures: InMemoryCapture[] = [];
let nextCaptureId = 1;

export function addInMemoryCapture(input: Omit<InMemoryCapture, 'id' | 'uploadedAtUtc'>): InMemoryCapture {
  const capture: InMemoryCapture = { ...input, id: String(nextCaptureId++), uploadedAtUtc: new Date() };
  captures.push(capture);
  return capture;
}

export function listCapturesForUser(
  userId: string,
  filter: { deviceId?: string; captureType?: string } = {}
): InMemoryCapture[] {
  return captures
    .filter((capture) => capture.userId === userId)
    .filter((capture) => !filter.deviceId || capture.deviceId === filter.deviceId)
    .filter((capture) => !filter.captureType || capture.captureType === filter.captureType)
    .sort((a, b) => b.capturedAtUtc.getTime() - a.capturedAtUtc.getTime());
}

export function findCaptureByIdForUser(id: string, userId: string): InMemoryCapture | undefined {
  return captures.find((capture) => capture.id === id && capture.userId === userId);
}

export interface InMemoryIncident {
  id: string;
  deviceId: string;
  userId: string;
  incidentType: string;
  threatScore: number;
  severity: string;
  summary: string;
  createdAt: Date;
  details: Record<string, unknown>;
}

const incidents: InMemoryIncident[] = [];
let nextIncidentId = 1;

export function listIncidentsForUser(userId: string): InMemoryIncident[] {
  return incidents.filter((incident) => incident.userId === userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function addIncident(input: Omit<InMemoryIncident, 'id' | 'createdAt'>): InMemoryIncident {
  const incident: InMemoryIncident = { ...input, id: String(nextIncidentId++), createdAt: new Date() };
  incidents.push(incident);
  return incident;
}

export function sumSessionBytes(deviceId: string, sessionId: string, captureType: 'usb_file'): number {
  return captures
    .filter((capture) => capture.deviceId === deviceId && capture.sessionId === sessionId && capture.captureType === captureType)
    .reduce((total, capture) => total + (capture.sizeBytes ?? 0), 0);
}

export interface InMemoryTrustedUsbDevice {
  id: string;
  identifier: string;
  label: string;
  createdAt: Date;
}

const trustedUsbDevices: InMemoryTrustedUsbDevice[] = [];
let nextTrustedUsbDeviceId = 1;

export function listTrustedUsbDevices(): InMemoryTrustedUsbDevice[] {
  return trustedUsbDevices;
}

export function findTrustedUsbDeviceByIdentifier(identifier: string): InMemoryTrustedUsbDevice | undefined {
  return trustedUsbDevices.find((device) => device.identifier === identifier);
}

export function addTrustedUsbDevice(identifier: string, label: string): InMemoryTrustedUsbDevice {
  const device: InMemoryTrustedUsbDevice = { id: String(nextTrustedUsbDeviceId++), identifier, label, createdAt: new Date() };
  trustedUsbDevices.push(device);
  return device;
}

export function removeTrustedUsbDevice(id: string): boolean {
  const index = trustedUsbDevices.findIndex((device) => device.id === id);
  if (index === -1) return false;
  trustedUsbDevices.splice(index, 1);
  return true;
}

const recentUsbEvents: { deviceName: string; description: string; timestampUtc: Date }[] = [];
const MAX_RECENT_USB_EVENTS = 30;

export function recordUsbConnectEvent(deviceName: string, description: string, timestampUtc: Date): void {
  recentUsbEvents.unshift({ deviceName, description, timestampUtc });
  recentUsbEvents.length = Math.min(recentUsbEvents.length, MAX_RECENT_USB_EVENTS);
}

export function listRecentUsbEvents(): { deviceName: string; description: string; timestampUtc: Date }[] {
  return recentUsbEvents;
}
