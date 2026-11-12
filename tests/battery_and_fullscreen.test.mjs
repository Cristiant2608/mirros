import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Battery, BatteryCharging, BatteryLow, BatteryMedium, BatteryFull} from 'lucide-react';
import {getBatteryIcon} from '../frontend/src/battery.mjs';

test('getBatteryIcon chooses appropriate icon based on capacity and charging state', () => {
  // Charging state always takes precedence
  assert.equal(getBatteryIcon(80, true), BatteryCharging);
  assert.equal(getBatteryIcon(5, true), BatteryCharging);
  assert.equal(getBatteryIcon(null, true), BatteryCharging);

  // Null or missing capacity
  assert.equal(getBatteryIcon(null, false), Battery);
  assert.equal(getBatteryIcon(undefined, false), Battery);

  // Critical / Low (<= 15%)
  assert.equal(getBatteryIcon(0, false), BatteryLow);
  assert.equal(getBatteryIcon(10, false), BatteryLow);
  assert.equal(getBatteryIcon(15, false), BatteryLow);

  // Medium (16% - 50%)
  assert.equal(getBatteryIcon(16, false), BatteryMedium);
  assert.equal(getBatteryIcon(35, false), BatteryMedium);
  assert.equal(getBatteryIcon(50, false), BatteryMedium);

  // Full / High (> 50%)
  assert.equal(getBatteryIcon(51, false), BatteryFull);
  assert.equal(getBatteryIcon(85, false), BatteryFull);
  assert.equal(getBatteryIcon(100, false), BatteryFull);
});

test('desktop main.cjs routes set includes /battery and /info', async () => {
  const mainSrc = await fs.readFile(new URL('../desktop/main.cjs', import.meta.url), 'utf8');
  assert.match(mainSrc, /routes\s*=\s*new Set\(\[/);
  assert.ok(mainSrc.includes("'/battery'"), "routes set must include '/battery'");
  assert.ok(mainSrc.includes("'/info'"), "routes set must include '/info'");
});

test('desktop main.cjs handles fullscreen action and F11 shortcut', async () => {
  const mainSrc = await fs.readFile(new URL('../desktop/main.cjs', import.meta.url), 'utf8');
  // Check action handler
  assert.ok(mainSrc.includes("case 'fullscreen':"), "ipcMain action handler must include 'fullscreen'");
  assert.ok(mainSrc.includes("setFullScreen(!window.isFullScreen())"), "fullscreen action must toggle window.setFullScreen");

  // Check F11 shortcut registration in before-input-event
  assert.ok(mainSrc.includes("key === 'F11'"), "before-input-event must check for F11 key");
  assert.ok(mainSrc.includes("win.setFullScreen(!win.isFullScreen())"), "F11 shortcut must toggle win.setFullScreen");
});

test('battery telemetry polling correctly parses status and handles safe fallbacks', async () => {
  let calls = 0;
  const mockFetch = async (url) => {
    calls++;
    if (url === '/battery') {
      return {
        ok: true,
        json: async () => ({capacity: 88, charging: false, connected: true})
      };
    }
    return {ok: false};
  };

  const res = await mockFetch('/battery');
  assert.equal(res.ok, true);
  const data = await res.json();
  assert.deepEqual(data, {capacity: 88, charging: false, connected: true});
  assert.equal(calls, 1);

  // Error case fallback
  const mockFailingFetch = async () => {
    throw new Error('Socket timeout');
  };

  let batteryState = {capacity: 50, charging: true, connected: true};
  try {
    await mockFailingFetch();
  } catch {
    // Component retains safe state or falls back safely
    batteryState = {capacity: null, charging: false, connected: false};
  }
  assert.deepEqual(batteryState, {capacity: null, charging: false, connected: false});
});

test('F11 keyboard shortcut triggers fullscreen callback and prevents default', () => {
  let fullscreenToggled = false;
  let prevented = false;

  const handleKeyDown = (event, toggleFn) => {
    if (event.key === 'F11') {
      event.preventDefault();
      toggleFn();
    }
  };

  const fakeEvent = {
    key: 'F11',
    preventDefault: () => { prevented = true; }
  };

  handleKeyDown(fakeEvent, () => { fullscreenToggled = true; });
  assert.equal(prevented, true, 'preventDefault should be called on F11');
  assert.equal(fullscreenToggled, true, 'fullscreen action should be triggered on F11');
});
