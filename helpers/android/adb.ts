// =============================================================================
//  ADB wrapper — the low-level half of Android player testing.
//
//  Deliberately NOT Appium. A signage player spends its life rendering
//  full-screen video with no interactive UI at all, so for most of what matters
//  (did the media download, is the app alive, what is on screen, has memory
//  crept up over 12 hours) there is no element to query and Appium has nothing
//  to say. adb answers all of it, starts in milliseconds instead of seconds,
//  and keeps working while the app is mid-crash — which is exactly when a test
//  most needs to observe it.
//
//  Appium (see AppiumDriver) covers the other half: the pairing, settings and
//  configuration screens that DO have a UI worth asserting on.
// =============================================================================

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ANDROID } from '../../config/android';

const run = promisify(execFile);

/** A device as reported by `adb devices -l`. */
export interface AdbDevice {
  serial: string;
  /** `device` = ready. `unauthorized` / `offline` mean it cannot be driven. */
  state: string;
  model?: string;
}

export interface AdbResult {
  stdout: string;
  stderr: string;
  code: number;
}

const OUTPUT_LIMIT = 64 * 1024 * 1024; // screencap of a 4K panel is ~10 MB.

export class Adb {
  /** Serial this instance is pinned to. Empty = whichever device is attached. */
  readonly serial: string;

  constructor(serial: string = ANDROID.UDID) {
    this.serial = serial;
  }

  // ─── Plumbing ─────────────────────────────────────────────────────────────

  private args(rest: string[]): string[] {
    return this.serial ? ['-s', this.serial, ...rest] : rest;
  }

  /**
   * Run an adb subcommand. Never throws on a non-zero exit: half the useful
   * probes here (`ls` on a directory the app has not created yet, `pidof` for a
   * process that died) fail by design, and a thrown error would turn a
   * legitimate assertion into an unreadable stack trace.
   */
  async raw(args: string[], timeoutMs = 60_000): Promise<AdbResult> {
    try {
      const { stdout, stderr } = await run(ANDROID.ADB_PATH, this.args(args), {
        timeout: timeoutMs,
        maxBuffer: OUTPUT_LIMIT,
        windowsHide: true,
      });
      return { stdout: stdout.toString(), stderr: stderr.toString(), code: 0 };
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string; code?: number; message?: string };
      return {
        stdout: e.stdout?.toString() ?? '',
        stderr: e.stderr?.toString() ?? e.message ?? '',
        code: typeof e.code === 'number' ? e.code : 1,
      };
    }
  }

  /** Same as `raw`, but fails the test loudly — for setup steps that must work. */
  async mustRun(args: string[], timeoutMs = 60_000): Promise<string> {
    const result = await this.raw(args, timeoutMs);
    if (result.code !== 0) {
      throw new Error(
        `adb ${args.join(' ')} failed (exit ${result.code})\n${result.stderr || result.stdout}`,
      );
    }
    return result.stdout;
  }

  /** Run a shell command on the device. Returns stdout, trimmed. */
  async shell(command: string, timeoutMs = 60_000): Promise<string> {
    const { stdout } = await this.raw(['shell', command], timeoutMs);
    return stdout.trim();
  }

  /** Binary-safe device output — `exec-out` skips adb's line-ending mangling. */
  async execOut(command: string, timeoutMs = 60_000): Promise<Buffer> {
    const { stdout } = await run(ANDROID.ADB_PATH, this.args(['exec-out', command]), {
      timeout: timeoutMs,
      maxBuffer: OUTPUT_LIMIT,
      encoding: 'buffer',
      windowsHide: true,
    });
    return stdout as unknown as Buffer;
  }

  // ─── Device state ─────────────────────────────────────────────────────────

  /** Every attached device, whatever its state. */
  static async devices(): Promise<AdbDevice[]> {
    const probe = new Adb('');
    const { stdout } = await probe.raw(['devices', '-l'], 20_000);
    return stdout
      .split(/\r?\n/)
      .slice(1) // drop the "List of devices attached" banner
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [serial, state, ...rest] = line.split(/\s+/);
        const model = rest.find((token) => token.startsWith('model:'))?.slice(6);
        return { serial, state, model };
      });
  }

  /** Is this instance's device attached AND authorised? */
  async isReady(): Promise<boolean> {
    const devices = await Adb.devices();
    const match = this.serial ? devices.find((d) => d.serial === this.serial) : devices[0];
    return match?.state === 'device';
  }

  /** Human description for skip messages and report attachments. */
  async describe(): Promise<string> {
    const devices = await Adb.devices();
    const match = this.serial ? devices.find((d) => d.serial === this.serial) : devices[0];
    if (!match) return this.serial ? `${this.serial} (not attached)` : 'no device attached';
    return `${match.serial} ${match.model ?? ''} [${match.state}]`.replace(/\s+/g, ' ').trim();
  }

  async androidVersion(): Promise<string> {
    return this.shell('getprop ro.build.version.release');
  }

  // ─── App lifecycle ────────────────────────────────────────────────────────

  async isInstalled(pkg = ANDROID.PACKAGE): Promise<boolean> {
    const out = await this.shell(`pm list packages ${pkg}`);
    return out.split(/\r?\n/).some((line) => line.trim() === `package:${pkg}`);
  }

  async appVersion(pkg = ANDROID.PACKAGE): Promise<string> {
    const out = await this.shell(`dumpsys package ${pkg} | grep versionName`);
    return out.split(/\r?\n/)[0]?.split('=')[1]?.trim() ?? '';
  }

  /** Process id of the player, or null when it is not running. */
  async pid(pkg = ANDROID.PACKAGE): Promise<number | null> {
    const out = await this.shell(`pidof ${pkg}`);
    const first = out.split(/\s+/).find(Boolean);
    const parsed = Number(first);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  async isRunning(pkg = ANDROID.PACKAGE): Promise<boolean> {
    return (await this.pid(pkg)) !== null;
  }

  /** Activity currently in the foreground — proves the player owns the screen. */
  async foregroundActivity(): Promise<string> {
    const out = await this.shell(
      'dumpsys activity activities | grep -E "mResumedActivity|topResumedActivity"',
    );
    return out.match(/[\w.]+\/[\w.$]+/)?.[0] ?? '';
  }

  async isForeground(pkg = ANDROID.PACKAGE): Promise<boolean> {
    return (await this.foregroundActivity()).startsWith(`${pkg}/`);
  }

  async startApp(pkg = ANDROID.PACKAGE): Promise<void> {
    // monkey launches the default activity without needing to know its name.
    await this.shell(`monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`);
  }

  async stopApp(pkg = ANDROID.PACKAGE): Promise<void> {
    await this.shell(`am force-stop ${pkg}`);
  }

  async restartApp(pkg = ANDROID.PACKAGE): Promise<void> {
    await this.stopApp(pkg);
    await this.startApp(pkg);
  }

  /** Clearing app data resets pairing too — the device will need re-enrolling. */
  async clearAppData(pkg = ANDROID.PACKAGE): Promise<void> {
    await this.shell(`pm clear ${pkg}`);
  }

  // ─── Content on disk ──────────────────────────────────────────────────────

  /** Files the player has cached, recursively. Empty when the dir is absent. */
  async mediaFiles(dir = ANDROID.MEDIA_DIR): Promise<string[]> {
    if (!dir) return [];
    const out = await this.shell(`find ${dir} -type f 2>/dev/null`);
    return out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  }

  /** Total bytes cached under `dir` — catches a sync that only half-ran. */
  async mediaBytes(dir = ANDROID.MEDIA_DIR): Promise<number> {
    if (!dir) return 0;
    const out = await this.shell(`du -sb ${dir} 2>/dev/null || du -sk ${dir} 2>/dev/null`);
    const value = Number(out.split(/\s+/)[0]);
    return Number.isFinite(value) ? value : 0;
  }

  /** Free space on /data in KB — a full disk is a top cause of failed syncs. */
  async freeSpaceKb(): Promise<number> {
    const out = await this.shell('df /data | tail -1');
    const value = Number(out.split(/\s+/)[3]);
    return Number.isFinite(value) ? value : 0;
  }

  // ─── Observation ──────────────────────────────────────────────────────────

  /** Wipe the log buffer — call before an action so the dump only shows it. */
  async clearLogcat(): Promise<void> {
    await this.raw(['logcat', '-c'], 20_000);
  }

  /**
   * Snapshot of the log buffer. `-d` dumps and exits rather than streaming, so
   * this always terminates. Filtered by ANDROID_LOG_TAG when one is configured.
   */
  async logcat(grep?: RegExp): Promise<string[]> {
    const filter = ANDROID.LOG_TAG ? `-s ${ANDROID.LOG_TAG}` : '';
    const { stdout } = await this.raw(
      ['logcat', '-d', ...filter.split(' ').filter(Boolean)],
      60_000,
    );
    const lines = stdout.split(/\r?\n/).filter(Boolean);
    return grep ? lines.filter((line) => grep.test(line)) : lines;
  }

  /** Crashes and ANRs since the last clear — the cheapest stability signal. */
  async crashes(pkg = ANDROID.PACKAGE): Promise<string[]> {
    const lines = await this.logcat();
    return lines.filter(
      (line) =>
        (/FATAL EXCEPTION|ANR in|Force finishing activity|has died/i.test(line) &&
          line.includes(pkg)) ||
        /FATAL EXCEPTION/i.test(line),
    );
  }

  /** PNG of the current screen — the only honest proof of what is displayed. */
  async screenshot(): Promise<Buffer> {
    return this.execOut('screencap -p', 60_000);
  }

  /** Total PSS in KB. Sample it over a soak run to catch a leak. */
  async memoryKb(pkg = ANDROID.PACKAGE): Promise<number> {
    const out = await this.shell(`dumpsys meminfo ${pkg} | grep -E "TOTAL(\\s|:)"`);
    const value = Number(out.match(/(\d+)/)?.[1]);
    return Number.isFinite(value) ? value : 0;
  }

  /** Raw UI hierarchy as XML — tells you whether Appium has anything to grab. */
  async uiDump(): Promise<string> {
    const dumped = await this.shell('uiautomator dump /sdcard/window_dump.xml');
    if (!/dumped/i.test(dumped)) return '';
    return this.shell('cat /sdcard/window_dump.xml');
  }

  // ─── Disruption (gated by ANDROID_ALLOW_DISRUPTIVE) ───────────────────────

  private assertDisruptiveAllowed(action: string): void {
    if (!ANDROID.ALLOW_DISRUPTIVE) {
      throw new Error(
        `Refusing to ${action}: set ANDROID_ALLOW_DISRUPTIVE=true to permit it. ` +
          `This device may be showing live content.`,
      );
    }
  }

  /** Cut or restore WiFi — the core of every offline-resilience test. */
  async setWifi(enabled: boolean): Promise<void> {
    this.assertDisruptiveAllowed(`turn WiFi ${enabled ? 'on' : 'off'}`);
    await this.shell(`svc wifi ${enabled ? 'enable' : 'disable'}`);
  }

  /** True when the device can actually reach the internet, not just associate. */
  async isOnline(): Promise<boolean> {
    const out = await this.shell('ping -c 1 -W 2 8.8.8.8');
    return /1 (packets )?received/.test(out);
  }

  /** Reboot and block until the device is back and boot has completed. */
  async reboot(timeoutMs = ANDROID.REBOOT_TIMEOUT_MS): Promise<void> {
    this.assertDisruptiveAllowed('reboot the device');
    await this.raw(['reboot'], 30_000);
    await this.waitForBoot(timeoutMs);
  }

  /** Poll until sys.boot_completed flips — `wait-for-device` returns too early. */
  async waitForBoot(timeoutMs = ANDROID.REBOOT_TIMEOUT_MS): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    await this.raw(['wait-for-device'], timeoutMs);
    while (Date.now() < deadline) {
      if ((await this.shell('getprop sys.boot_completed')) === '1') return;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    throw new Error(`Device did not finish booting within ${timeoutMs}ms`);
  }

  // ─── Polling ──────────────────────────────────────────────────────────────

  /**
   * Poll `probe` until it returns true. Used for anything with a real-world
   * latency the test should measure rather than sleep through — content
   * arriving after a publish, the app coming back after a restart.
   *
   * Returns how long it took, so a spec can assert on the SLA and report the
   * actual number instead of just pass/fail.
   */
  async waitFor(
    probe: () => Promise<boolean>,
    { timeoutMs = ANDROID.SYNC_TIMEOUT_MS, intervalMs = 2_000, what = 'condition' } = {},
  ): Promise<number> {
    const started = Date.now();
    const deadline = started + timeoutMs;
    while (Date.now() < deadline) {
      if (await probe()) return Date.now() - started;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error(`Timed out after ${timeoutMs}ms waiting for ${what}`);
  }
}

export default Adb;
