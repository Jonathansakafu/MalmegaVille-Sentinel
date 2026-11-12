import type { Capture, Device, Incident } from '../../api';

export type DashboardContext = {
  token: string;
  devices: Device[];
  incidents: Incident[];
  captures: Capture[];
  loading: boolean;
  error: string;
  reload: () => void;
  reloadCaptures: () => void;
  toggleLost: (device: Device) => Promise<void>;
  removeDevice: (device: Device) => Promise<void>;
  lostStatusPending: string | null;
  userEmail: string;
  username: string;
  onUsernameChange: (username: string) => void;
  onLogout: () => void;
};
