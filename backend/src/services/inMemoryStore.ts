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

export function removeDeviceByIdForUser(id: string, userId: string): boolean {
  const index = devices.findIndex((device) => device.id === id && device.userId === userId);
  if (index === -1) return false;
  devices.splice(index, 1);
  return true;
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

export interface InMemoryProtectedFolder {
  id: string;
  userId: string;
  deviceId: string;
  path: string;
  label: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const protectedFolders: InMemoryProtectedFolder[] = [];
let nextProtectedFolderId = 1;

export function listProtectedFolders(userId: string, deviceId?: string): InMemoryProtectedFolder[] {
  return protectedFolders
    .filter((folder) => folder.userId === userId)
    .filter((folder) => !deviceId || folder.deviceId === deviceId)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export function findProtectedFolderByIdForUser(id: string, userId: string): InMemoryProtectedFolder | undefined {
  return protectedFolders.find((folder) => folder.id === id && folder.userId === userId);
}

export function findProtectedFolderByPath(userId: string, deviceId: string, path: string): InMemoryProtectedFolder | undefined {
  return protectedFolders.find(
    (folder) => folder.userId === userId && folder.deviceId === deviceId && folder.path.toLowerCase() === path.toLowerCase()
  );
}

export function addProtectedFolder(input: {
  userId: string;
  deviceId: string;
  path: string;
  label: string;
}): InMemoryProtectedFolder {
  const folder: InMemoryProtectedFolder = {
    ...input,
    id: String(nextProtectedFolderId++),
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  protectedFolders.push(folder);
  return folder;
}

export function updateProtectedFolder(
  id: string,
  userId: string,
  update: { label?: string; enabled?: boolean }
): InMemoryProtectedFolder | undefined {
  const folder = findProtectedFolderByIdForUser(id, userId);
  if (!folder) return undefined;
  if (typeof update.label === 'string') folder.label = update.label;
  if (typeof update.enabled === 'boolean') folder.enabled = update.enabled;
  folder.updatedAt = new Date();
  return folder;
}

export function removeProtectedFolder(id: string, userId: string): boolean {
  const index = protectedFolders.findIndex((folder) => folder.id === id && folder.userId === userId);
  if (index === -1) return false;
  protectedFolders.splice(index, 1);
  return true;
}

export interface InMemoryManifestEntry {
  relativePath: string;
  sha256: string;
  sizeBytes: number;
  lastModifiedUtc?: Date;
}

export interface InMemoryManifestChange {
  type: 'added' | 'modified' | 'removed';
  relativePath: string;
  previousSha256?: string;
  sha256?: string;
  sizeBytes?: number;
}

export interface InMemoryFileManifest {
  id: string;
  userId: string;
  deviceId: string;
  folderId: string;
  path: string;
  label?: string;
  entries: InMemoryManifestEntry[];
  fileCount: number;
  totalBytes: number;
  changes: InMemoryManifestChange[];
  changeCount: number;
  integrityStatus: 'baseline' | 'unchanged' | 'changed';
  scannedAtUtc: Date;
  createdAt: Date;
}

const fileManifests: InMemoryFileManifest[] = [];
let nextFileManifestId = 1;

export function findLatestManifestForFolder(userId: string, folderId: string): InMemoryFileManifest | undefined {
  return fileManifests
    .filter((manifest) => manifest.userId === userId && manifest.folderId === folderId)
    .sort((a, b) => b.scannedAtUtc.getTime() - a.scannedAtUtc.getTime())[0];
}

export function addFileManifest(
  input: Omit<InMemoryFileManifest, 'id' | 'createdAt'>
): InMemoryFileManifest {
  const manifest: InMemoryFileManifest = { ...input, id: String(nextFileManifestId++), createdAt: new Date() };
  fileManifests.push(manifest);
  return manifest;
}

export function listManifestsForUser(userId: string, folderId?: string, limit = 50): InMemoryFileManifest[] {
  return fileManifests
    .filter((manifest) => manifest.userId === userId)
    .filter((manifest) => !folderId || manifest.folderId === folderId)
    .sort((a, b) => b.scannedAtUtc.getTime() - a.scannedAtUtc.getTime())
    .slice(0, limit);
}

export interface InMemoryNetworkDestination {
  id: string;
  userId: string;
  deviceId: string;
  remoteAddress: string;
  remotePort?: number;
  processName?: string;
  isPublic: boolean;
  verdict: 'unknown' | 'trusted';
  label?: string;
  seenCount: number;
  firstSeenUtc: Date;
  lastSeenUtc: Date;
}

const networkDestinations: InMemoryNetworkDestination[] = [];
let nextNetworkDestinationId = 1;

export function findNetworkDestination(
  userId: string,
  deviceId: string,
  remoteAddress: string
): InMemoryNetworkDestination | undefined {
  return networkDestinations.find(
    (destination) =>
      destination.userId === userId && destination.deviceId === deviceId && destination.remoteAddress === remoteAddress
  );
}

export function upsertNetworkDestination(input: {
  userId: string;
  deviceId: string;
  remoteAddress: string;
  remotePort?: number;
  processName?: string;
  isPublic: boolean;
}): { destination: InMemoryNetworkDestination; created: boolean } {
  const existing = findNetworkDestination(input.userId, input.deviceId, input.remoteAddress);
  if (existing) {
    existing.seenCount += 1;
    existing.lastSeenUtc = new Date();
    if (input.remotePort) existing.remotePort = input.remotePort;
    if (input.processName) existing.processName = input.processName;
    return { destination: existing, created: false };
  }

  const destination: InMemoryNetworkDestination = {
    ...input,
    id: String(nextNetworkDestinationId++),
    verdict: 'unknown',
    seenCount: 1,
    firstSeenUtc: new Date(),
    lastSeenUtc: new Date()
  };
  networkDestinations.push(destination);
  return { destination, created: true };
}

export function listNetworkDestinations(userId: string): InMemoryNetworkDestination[] {
  return networkDestinations
    .filter((destination) => destination.userId === userId)
    .sort((a, b) => b.lastSeenUtc.getTime() - a.lastSeenUtc.getTime());
}

export function updateNetworkDestination(
  id: string,
  userId: string,
  update: { verdict?: 'unknown' | 'trusted'; label?: string }
): InMemoryNetworkDestination | undefined {
  const destination = networkDestinations.find((entry) => entry.id === id && entry.userId === userId);
  if (!destination) return undefined;
  if (update.verdict) destination.verdict = update.verdict;
  if (typeof update.label === 'string') destination.label = update.label;
  return destination;
}

export interface InMemoryNetworkConnection {
  remoteAddress: string;
  remotePort?: number;
  processName?: string;
  state?: string;
}

export interface InMemoryNetworkSnapshot {
  id: string;
  userId: string;
  deviceId: string;
  deviceName?: string;
  connections: InMemoryNetworkConnection[];
  connectionCount: number;
  publicCount: number;
  unknownCount: number;
  capturedAtUtc: Date;
  createdAt: Date;
}

const networkSnapshots: InMemoryNetworkSnapshot[] = [];
let nextNetworkSnapshotId = 1;

export function addNetworkSnapshot(
  input: Omit<InMemoryNetworkSnapshot, 'id' | 'createdAt'>
): InMemoryNetworkSnapshot {
  const snapshot: InMemoryNetworkSnapshot = { ...input, id: String(nextNetworkSnapshotId++), createdAt: new Date() };
  networkSnapshots.push(snapshot);
  if (networkSnapshots.length > 2000) networkSnapshots.splice(0, networkSnapshots.length - 2000);
  return snapshot;
}

export function listNetworkSnapshots(userId: string, deviceId?: string, limit = 100): InMemoryNetworkSnapshot[] {
  return networkSnapshots
    .filter((snapshot) => snapshot.userId === userId)
    .filter((snapshot) => !deviceId || snapshot.deviceId === deviceId)
    .sort((a, b) => b.capturedAtUtc.getTime() - a.capturedAtUtc.getTime())
    .slice(0, limit);
}

export interface InMemoryRestoreJob {
  id: string;
  userId: string;
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
  requestedAtUtc: Date;
  startedAtUtc?: Date;
  completedAtUtc?: Date;
}

const restoreJobs: InMemoryRestoreJob[] = [];
let nextRestoreJobId = 1;

export function addRestoreJob(
  input: Omit<InMemoryRestoreJob, 'id' | 'requestedAtUtc' | 'status'>
): InMemoryRestoreJob {
  const job: InMemoryRestoreJob = {
    ...input,
    id: String(nextRestoreJobId++),
    status: 'queued',
    requestedAtUtc: new Date()
  };
  restoreJobs.push(job);
  return job;
}

export function listRestoreJobsForUser(userId: string): InMemoryRestoreJob[] {
  return restoreJobs
    .filter((job) => job.userId === userId)
    .sort((a, b) => b.requestedAtUtc.getTime() - a.requestedAtUtc.getTime());
}

export function findRestoreJobByIdForUser(id: string, userId: string): InMemoryRestoreJob | undefined {
  return restoreJobs.find((job) => job.id === id && job.userId === userId);
}

export function findRestoreJobById(id: string): InMemoryRestoreJob | undefined {
  return restoreJobs.find((job) => job.id === id);
}

export function findQueuedRestoreJobsForDevice(deviceId: string): InMemoryRestoreJob[] {
  return restoreJobs
    .filter((job) => job.deviceId === deviceId && job.status === 'queued')
    .sort((a, b) => a.requestedAtUtc.getTime() - b.requestedAtUtc.getTime());
}

export function updateRestoreJob(
  id: string,
  update: Partial<
    Pick<InMemoryRestoreJob, 'status' | 'startedAtUtc' | 'completedAtUtc' | 'verificationHash' | 'restoredPath' | 'error'>
  >
): InMemoryRestoreJob | undefined {
  const job = findRestoreJobById(id);
  if (!job) return undefined;
  Object.assign(job, update);
  return job;
}

export interface InMemoryFileBackup {
  id: string;
  userId: string;
  deviceId: string;
  folderId: string;
  relativePath: string;
  sha256: string;
  sizeBytes: number;
  storagePath: string;
  backedUpAtUtc: Date;
}

const fileBackups: InMemoryFileBackup[] = [];
let nextFileBackupId = 1;

export function listFileBackupsForFolder(userId: string, folderId: string): InMemoryFileBackup[] {
  return fileBackups.filter((backup) => backup.userId === userId && backup.folderId === folderId);
}

export function findFileBackup(
  userId: string,
  folderId: string,
  relativePath: string,
  sha256: string
): InMemoryFileBackup | undefined {
  return fileBackups.find(
    (backup) =>
      backup.userId === userId &&
      backup.folderId === folderId &&
      backup.relativePath === relativePath &&
      backup.sha256 === sha256
  );
}

export function addFileBackup(
  input: Omit<InMemoryFileBackup, 'id' | 'backedUpAtUtc'>
): InMemoryFileBackup {
  const backup: InMemoryFileBackup = { ...input, id: String(nextFileBackupId++), backedUpAtUtc: new Date() };
  fileBackups.push(backup);
  return backup;
}

export function findFileBackupByIdForUser(id: string, userId: string): InMemoryFileBackup | undefined {
  return fileBackups.find((backup) => backup.id === id && backup.userId === userId);
}
