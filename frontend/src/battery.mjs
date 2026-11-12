import {Battery, BatteryCharging, BatteryLow, BatteryMedium, BatteryFull} from 'lucide-react';

export function getBatteryIcon(capacity, charging) {
  if (charging) return BatteryCharging;
  if (capacity === null || capacity === undefined) return Battery;
  if (capacity <= 15) return BatteryLow;
  if (capacity <= 50) return BatteryMedium;
  return BatteryFull;
}
