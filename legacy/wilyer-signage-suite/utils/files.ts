// =============================================================================
//  On-the-fly test-file generator for upload tests.
// =============================================================================
//  Writes throwaway files into <suite>/.tmp-uploads and returns absolute paths.
//  Covers: valid images/videos at various sizes, oversized files, disallowed
//  extensions (exe/bat/php), corrupt files, and tricky file names.
// =============================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP = path.resolve(__dirname, '..', '.tmp-uploads');

function ensureDir() {
  fs.mkdirSync(TMP, { recursive: true });
}

/** Smallest valid 1x1 PNG (transparent). */
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** Minimal valid JPEG header + EOI. */
const JPEG_MIN = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');

export interface MadeFile {
  path: string;
  name: string;
  bytes: number;
}

function write(name: string, buf: Buffer): MadeFile {
  ensureDir();
  const p = path.join(TMP, name);
  fs.writeFileSync(p, buf);
  return { path: p, name, bytes: buf.length };
}

/** A small valid PNG. */
export function smallImage(name = 'small.png'): MadeFile {
  return write(name, PNG_1x1);
}

/** A valid JPEG padded to `mb` megabytes (trailing pad bytes after EOI). */
export function sizedImage(mb: number, name = `image-${mb}mb.jpg`): MadeFile {
  const pad = Buffer.alloc(Math.max(0, mb * 1024 * 1024 - JPEG_MIN.length), 0x20);
  return write(name, Buffer.concat([JPEG_MIN, pad]));
}

/** A pseudo-video file padded to `mb` megabytes with a tiny MP4 ftyp box. */
export function sizedVideo(mb: number, name = `video-${mb}mb.mp4`): MadeFile {
  const ftyp = Buffer.from('0000001c66747970697336', 'hex'); // 'ftyp' box start
  const pad = Buffer.alloc(Math.max(0, mb * 1024 * 1024 - ftyp.length), 0);
  return write(name, Buffer.concat([ftyp, pad]));
}

/** A disallowed executable / script file with the given extension. */
export function disallowed(ext: 'exe' | 'bat' | 'php' | 'sh', name?: string): MadeFile {
  const bodies: Record<string, Buffer> = {
    exe: Buffer.from('4d5a90000300000004000000ffff', 'hex'), // 'MZ' DOS header
    bat: Buffer.from('@echo off\r\ndel /f /q *.*\r\n'),
    php: Buffer.from("<?php system($_GET['c']); ?>"),
    sh: Buffer.from('#!/bin/sh\nrm -rf /\n'),
  };
  return write(name ?? `payload.${ext}`, bodies[ext]);
}

/** A file with an image extension but garbage/corrupt bytes. */
export function corruptImage(name = 'corrupt.png'): MadeFile {
  return write(name, Buffer.from('not really a png at all', 'utf8'));
}

/** A valid PNG saved under a tricky file name. */
export function trickyName(kind: 'spaces' | 'special' | 'unicode' | 'long'): MadeFile {
  const names: Record<string, string> = {
    spaces: 'my holiday photo final.png',
    special: "weird@name#%&{}$!.png",
    unicode: 'スクリーン_画像_Ñoño.png',
    long: `${'long-name-segment-'.repeat(15)}.png`,
  };
  return write(names[kind], PNG_1x1);
}

/** Remove all generated temp files. Call from an afterAll / teardown. */
export function cleanup() {
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

export const TMP_DIR = TMP;
