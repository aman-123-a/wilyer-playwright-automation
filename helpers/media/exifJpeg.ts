// =============================================================================
//  Give a JPEG an EXIF Orientation tag — the way a phone saves a portrait shot:
//  landscape pixels plus "rotate on display". No image library needed.
//
//  The JFIF APP0 segment a canvas encoder writes (if any) is replaced by a
//  minimal APP1/EXIF segment holding one IFD0 entry: Orientation (0x0112).
//    1 = as stored · 3 = 180° · 6 = 90° CW (portrait phone shot) · 8 = 90° CCW
// =============================================================================

const SOI = 0xffd8;
const APP0 = 0xffe0;

/** A minimal little-endian APP1/EXIF segment with only the Orientation tag. */
function exifSegment(orientation: number): Buffer {
  const tiff = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // "II", 42, IFD0 at offset 8
    0x01, 0x00, //                                     1 entry
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, // tag 0x0112, SHORT, count 1
    orientation, 0x00, 0x00, 0x00, //                  value (padded to 4 bytes)
    0x00, 0x00, 0x00, 0x00, //                         no next IFD
  ]);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const header = Buffer.alloc(4);
  header.writeUInt16BE(0xffe1, 0);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}

export function withExifOrientation(jpeg: Buffer, orientation: number): Buffer {
  if (jpeg.readUInt16BE(0) !== SOI) throw new Error('not a JPEG (no SOI marker)');
  let rest = 2;
  if (jpeg.readUInt16BE(2) === APP0) rest = 4 + jpeg.readUInt16BE(4);
  return Buffer.concat([jpeg.subarray(0, 2), exifSegment(orientation), jpeg.subarray(rest)]);
}
