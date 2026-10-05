import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
export interface UsbSetupResult {
  ok: boolean;
  status: 'ready' | 'unauthorized' | 'no-device' | 'multiple-devices' | 'missing-adb' | 'error';
  message: string;
}
type AdbRunner = (args: string[]) => Promise<{ stdout: string; stderr: string }>;

async function runAdb(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const candidates = [
    process.env.ADB_PATH,
    process.env.ANDROID_HOME && join(process.env.ANDROID_HOME, 'platform-tools', 'adb'),
    process.env.ANDROID_SDK_ROOT && join(process.env.ANDROID_SDK_ROOT, 'platform-tools', 'adb'),
    join(homedir(), 'Library', 'Android', 'sdk', 'platform-tools', 'adb'),
    'adb',
  ].filter((candidate): candidate is string => !!candidate);
  for (const executable of candidates) {
    if (executable !== 'adb') {
      try { await access(executable, constants.X_OK); } catch { continue; }
    }
    try { return await exec(executable, args, { timeout: 8000, maxBuffer: 16_384, encoding: 'utf8' }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
  }
  throw Object.assign(new Error('ADB not found'), { code: 'ADB_NOT_FOUND' });
}

export async function setupUsbForward(port: number, run: AdbRunner = runAdb): Promise<UsbSetupResult> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, status: 'error', message: 'The trainer port is invalid.' };
  try {
    // -d explicitly selects a USB transport, never a wireless ADB connection.
    const state = await run(['-d', 'get-state']);
    if (state.stdout.trim() !== 'device') return { ok: false, status: 'no-device', message: 'Connect your Android phone with a data cable and enable USB debugging.' };
    const address = `tcp:${port}`;
    await run(['-d', 'reverse', address, address]);
    const forwards = await run(['-d', 'reverse', '--list']);
    const verified = forwards.stdout.split('\n').some((line) => {
      const fields = line.trim().split(/\s+/); return fields.at(-2) === address && fields.at(-1) === address;
    });
    return verified
      ? { ok: true, status: 'ready', message: 'USB connection ready. Scan the code or open the pairing URL on your phone. Wi-Fi is not needed.' }
      : { ok: false, status: 'error', message: 'USB forwarding could not be confirmed. Reconnect the cable and try again.' };
  } catch (error) {
    const e = error as Error & { stderr?: string; code?: string };
    const detail = `${e.message} ${e.stderr ?? ''}`.toLowerCase();
    if (e.code === 'ADB_NOT_FOUND') return { ok: false, status: 'missing-adb', message: 'Install Android SDK platform tools on the Mac, then try again. ADB_PATH can specify your adb executable.' };
    if (detail.includes('unauthorized')) return { ok: false, status: 'unauthorized', message: 'Unlock your phone and accept “Allow USB debugging?”, then click Connect USB phone again.' };
    if (detail.includes('more than one') || detail.includes('multiple devices')) return { ok: false, status: 'multiple-devices', message: 'More than one USB device is connected. Leave only the intended phone connected, then try again.' };
    if (detail.includes('no devices') || detail.includes('no device') || detail.includes('device offline')) return { ok: false, status: 'no-device', message: 'No ready USB phone found. Check the data cable, enable USB debugging, and unlock the phone.' };
    return { ok: false, status: 'error', message: 'USB setup failed. Check the phone authorization and cable, then try again.' };
  }
}
