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

export function updatePasswordHash(id: string, passwordHash: string): InMemoryUser | undefined {
  const user = findUserById(id);
  if (!user) return undefined;
  user.passwordHash = passwordHash;
  return user;
}

export interface InMemoryNotificationSettings {
  alertEmailRecipient: string;
  alertPhoneNumber: string;
}

const notificationSettingsByUser = new Map<string, InMemoryNotificationSettings>();

const EMPTY_NOTIFICATION_SETTINGS: InMemoryNotificationSettings = {
  alertEmailRecipient: '',
  alertPhoneNumber: ''
};

export function getNotificationSettingsForUser(userId: string): InMemoryNotificationSettings {
  return notificationSettingsByUser.get(userId) ?? EMPTY_NOTIFICATION_SETTINGS;
}

export function saveNotificationSettingsForUser(
  userId: string,
  update: InMemoryNotificationSettings
): InMemoryNotificationSettings {
  const settings = { ...update };
  notificationSettingsByUser.set(userId, settings);
  return settings;
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

export function removeCaptureByIdForUser(id: string, userId: string): boolean {
  const index = captures.findIndex((capture) => capture.id === id && capture.userId === userId);
  if (index === -1) return false;
  captures.splice(index, 1);
  return true;
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
  userId: string;
  identifier: string;
  label: string;
  createdAt: Date;
}

const trustedUsbDevices: InMemoryTrustedUsbDevice[] = [];
let nextTrustedUsbDeviceId = 1;

export function listTrustedUsbDevices(userId: string): InMemoryTrustedUsbDevice[] {
  return trustedUsbDevices.filter((device) => device.userId === userId);
}

export function findTrustedUsbDeviceByIdentifier(userId: string, identifier: string): InMemoryTrustedUsbDevice | undefined {
  return trustedUsbDevices.find((device) => device.userId === userId && device.identifier === identifier);
}

export function addTrustedUsbDevice(userId: string, identifier: string, label: string): InMemoryTrustedUsbDevice {
  const device: InMemoryTrustedUsbDevice = {
    id: String(nextTrustedUsbDeviceId++),
    userId,
    identifier,
    label,
    createdAt: new Date()
  };
  trustedUsbDevices.push(device);
  return device;
}

export function removeTrustedUsbDevice(userId: string, id: string): boolean {
  const index = trustedUsbDevices.findIndex((device) => device.id === id && device.userId === userId);
  if (index === -1) return false;
  trustedUsbDevices.splice(index, 1);
  return true;
}

interface InMemoryUsbEvent {
  userId: string;
  deviceName: string;
  description: string;
  timestampUtc: Date;
}

const recentUsbEvents: InMemoryUsbEvent[] = [];
const MAX_RECENT_USB_EVENTS_PER_USER = 30;

export function recordUsbConnectEvent(userId: string, deviceName: string, description: string, timestampUtc: Date): void {
  recentUsbEvents.unshift({ userId, deviceName, description, timestampUtc });
  const seenForUser = recentUsbEvents.filter((event) => event.userId === userId);
  if (seenForUser.length > MAX_RECENT_USB_EVENTS_PER_USER) {
    const overflow = seenForUser.slice(MAX_RECENT_USB_EVENTS_PER_USER);
    for (const event of overflow) {
      const index = recentUsbEvents.indexOf(event);
      if (index !== -1) recentUsbEvents.splice(index, 1);
    }
  }
}

export function listRecentUsbEvents(userId: string): { deviceName: string; description: string; timestampUtc: Date }[] {
  return recentUsbEvents
    .filter((event) => event.userId === userId)
    .map(({ deviceName, description, timestampUtc }) => ({ deviceName, description, timestampUtc }));
}

export interface InMemoryPushSubscription {
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

const pushSubscriptions: InMemoryPushSubscription[] = [];

export function listPushSubscriptionsForUser(userId: string): InMemoryPushSubscription[] {
  return pushSubscriptions.filter((subscription) => subscription.userId === userId);
}

export function addPushSubscription(subscription: InMemoryPushSubscription): void {
  const existingIndex = pushSubscriptions.findIndex((existing) => existing.endpoint === subscription.endpoint);
  if (existingIndex !== -1) {
    pushSubscriptions[existingIndex] = subscription;
    return;
  }
  pushSubscriptions.push(subscription);
}

export function removePushSubscription(endpoint: string): void {
  const index = pushSubscriptions.findIndex((subscription) => subscription.endpoint === endpoint);
  if (index !== -1) {
    pushSubscriptions.splice(index, 1);
  }
}

export interface InMemoryAuditLog {
  id: string;
  userId: string;
  action: string;
  actorType: 'user' | 'agent' | 'system';
  description: string;
  targetType?: string;
  targetId?: string;
  ipAddress?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

const auditLogs: InMemoryAuditLog[] = [];
let nextAuditLogId = 1;
const MAX_AUDIT_LOGS_PER_USER = 200;

export function addAuditLog(input: Omit<InMemoryAuditLog, 'id' | 'createdAt'>): InMemoryAuditLog {
  const entry: InMemoryAuditLog = { ...input, id: String(nextAuditLogId++), createdAt: new Date() };
  auditLogs.unshift(entry);

  const forUser = auditLogs.filter((log) => log.userId === input.userId);
  if (forUser.length > MAX_AUDIT_LOGS_PER_USER) {
    for (const overflowLog of forUser.slice(MAX_AUDIT_LOGS_PER_USER)) {
      const index = auditLogs.indexOf(overflowLog);
      if (index !== -1) auditLogs.splice(index, 1);
    }
  }

  return entry;
}

export function listAuditLogsForUser(userId: string, limit: number): InMemoryAuditLog[] {
  return auditLogs.filter((log) => log.userId === userId).slice(0, limit);
}

export interface InMemoryMobileDevice {
  id: string;
  userId: string;
  platform: 'android';
  fcmToken: string;
  deviceLabel: string;
  lastSeenAt: Date;
}

const mobileDevices: InMemoryMobileDevice[] = [];
let nextMobileDeviceId = 1;

export function listMobileDevicesForUser(userId: string): InMemoryMobileDevice[] {
  return mobileDevices.filter((device) => device.userId === userId);
}

export function upsertMobileDevice(input: {
  userId: string;
  platform: 'android';
  fcmToken: string;
  deviceLabel: string;
}): InMemoryMobileDevice {
  const existing = mobileDevices.find((device) => device.fcmToken === input.fcmToken);
  if (existing) {
    existing.userId = input.userId;
    existing.deviceLabel = input.deviceLabel;
    existing.lastSeenAt = new Date();
    return existing;
  }

  const device: InMemoryMobileDevice = { ...input, id: String(nextMobileDeviceId++), lastSeenAt: new Date() };
  mobileDevices.push(device);
  return device;
}

export function removeMobileDeviceByToken(fcmToken: string): void {
  const index = mobileDevices.findIndex((device) => device.fcmToken === fcmToken);
  if (index !== -1) {
    mobileDevices.splice(index, 1);
  }
}
