export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isValidThreatScore(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && value <= 100;
}

export function isValidSeverity(value: unknown): value is string {
  return typeof value === 'string' && ['low', 'medium', 'high', 'critical'].includes(value.toLowerCase());
}
