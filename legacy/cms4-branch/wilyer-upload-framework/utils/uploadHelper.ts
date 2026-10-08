/**
 * File-fixture generation helper.
 *
 * Tests need a variety of files on disk: a normal valid file, an oversized file
 * (large-file-upload test), a corrupted file, files with long / special-char
 * names, and disallowed file types. Generating them at runtime keeps the repo
 * small and lets us parameterise sizes without committing binaries.
 *
 * All generated files live under `test-data/generated/` (git-ignored) and are
 * cleaned up by global teardown.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from './logger.js';

const log = createLogger('uploadHelper');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const GENERATED_DIR = path.resolve(__dirname, '..', 'test-data', 'generated');

/** Ensure the generated-files directory exists. */
function ensureDir(): void {
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
}

export interface GeneratedFile {
  path: string;
  name: string;
  sizeBytes: number;
}

export const UploadHelper = {
  /** A small, valid file of the given extension with deterministic content. */
  createValidFile(name = `valid-upload-${Date.now()}.png`): GeneratedFile {
    ensureDir();
    const filePath = path.join(GENERATED_DIR, name);
    // Minimal valid 1x1 PNG so MIME sniffing passes.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCA',
      'base64',
    );
    fs.writeFileSync(filePath, png);
    log.info(`Created valid file: ${name} (${png.length} bytes)`);
    return { path: filePath, name, sizeBytes: png.length };
  },

  /** A large file of approximately `sizeMb` megabytes (for size-limit tests). */
  createLargeFile(sizeMb = 60, name = `large-upload-${Date.now()}.bin`): GeneratedFile {
    ensureDir();
    const filePath = path.join(GENERATED_DIR, name);
    const chunk = Buffer.alloc(1024 * 1024, 0); // 1MB of zeros
    const fd = fs.openSync(filePath, 'w');
    try {
      for (let i = 0; i < sizeMb; i++) fs.writeSync(fd, chunk);
    } finally {
      fs.closeSync(fd);
    }
    const sizeBytes = sizeMb * 1024 * 1024;
    log.info(`Created large file: ${name} (${sizeMb}MB)`);
    return { path: filePath, name, sizeBytes };
  },

  /** A file whose bytes are deliberately invalid for its extension. */
  createCorruptedFile(name = `corrupted-${Date.now()}.png`): GeneratedFile {
    ensureDir();
    const filePath = path.join(GENERATED_DIR, name);
    // Random bytes with a .png extension — not a real PNG.
    const bytes = Buffer.from('this-is-not-a-real-png-file-\x00\x01\x02\xff');
    fs.writeFileSync(filePath, bytes);
    log.info(`Created corrupted file: ${name}`);
    return { path: filePath, name, sizeBytes: bytes.length };
  },

  /** A file with a disallowed extension (e.g. .exe) for type-validation tests. */
  createInvalidTypeFile(name = `malware-${Date.now()}.exe`): GeneratedFile {
    ensureDir();
    const filePath = path.join(GENERATED_DIR, name);
    const bytes = Buffer.from('MZ\x90\x00executable-stub');
    fs.writeFileSync(filePath, bytes);
    log.info(`Created invalid-type file: ${name}`);
    return { path: filePath, name, sizeBytes: bytes.length };
  },

  /** A valid file with a very long base name (filesystem-safe length). */
  createLongNameFile(length = 180): GeneratedFile {
    const base = 'L'.repeat(Math.max(1, length - '.png'.length));
    return this.createValidFile(`${base}.png`);
  },

  /** A valid file whose name contains URL/markup special characters. */
  createSpecialCharFile(): GeneratedFile {
    // Avoid characters illegal on Windows (\ / : * ? " < > |); keep the rest.
    return this.createValidFile(`spëcïål (name) #1 & {test}-${Date.now()}.png`);
  },

  /** Remove all generated files. Called by global teardown. */
  cleanup(): void {
    if (fs.existsSync(GENERATED_DIR)) {
      fs.rmSync(GENERATED_DIR, { recursive: true, force: true });
      log.info('Cleaned up generated files');
    }
  },
};
