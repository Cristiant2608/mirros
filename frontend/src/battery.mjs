import {Battery, BatteryCharging, BatteryLow, BatteryMedium, BatteryFull} from 'lucide-react';

export function getBatteryIconName(capacity, charging) {
  if (charging) return 'BatteryCharging';
  if (capacity === null || capacity === undefined) return 'Battery';
  if (capacity <= 15) return 'BatteryLow';
  if (capacity <= 50) return 'BatteryMedium';
  return 'BatteryFull';
}

export function resolveBatteryIcon(icons, capacity, charging) {
  const name = getBatteryIconName(capacity, charging);
  return icons[name] || icons.Battery;
}

export function getBatteryIcon(capacity, charging) {
  return resolveBatteryIcon({Battery, BatteryCharging, BatteryLow, BatteryMedium, BatteryFull}, capacity, charging);
}
