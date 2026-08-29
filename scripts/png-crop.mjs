// Dependency-free PNG cropping, using only node:zlib.
//
// It exists because of a real defect. A desktop OS refuses to make a browser
// window narrower than roughly 480-500 CSS pixels, so `--window-size=390,844`
// lays the page out at ~496px and writes a 390px-wide PNG: a cropped desktop
// render that looks exactly like a broken mobile layout. Every mobile
// screenshot this tool took on Windows was that. The fix renders the page in
// an iframe of the true width inside a legal-sized window, which leaves a
// letterbox — and a letterbox an agent would read as dead space in the design.
// So the letterbox is cropped away here, and the image an agent looks at is
// exactly the viewport it asked for.

import zlib from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

// Reverses the per-scanline filters PNG applies before compression. Returns
// one flat buffer of raw pixel bytes, `height` rows of `width * bpp`.
function unfilter(raw, width, height, bpp) {
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  let pos = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const outStart = y * stride;
    const upStart = outStart - stride;

    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[outStart + x - bpp] : 0;
      const b = y > 0 ? out[upStart + x] : 0;
      const c = y > 0 && x >= bpp ? out[upStart + x - bpp] : 0;
      let value;
      switch (filter) {
        case 0: value = line[x]; break;
        case 1: value = line[x] + a; break;
        case 2: value = line[x] + b; break;
        case 3: value = line[x] + ((a + b) >> 1); break;
        case 4: value = line[x] + paeth(a, b, c); break;
        default: throw new Error(`unknown PNG filter type ${filter} on row ${y}`);
      }
      out[outStart + x] = value & 0xff;
    }
  }
  return out;
}

// Crops a PNG buffer to its top-left `width x height`. Returns a new PNG
// buffer. Throws rather than returning something subtly wrong -- an image that
// silently misrepresents the page is the defect this file exists to remove.
export function cropPng(buffer, cropWidth, cropHeight) {
  if (!Buffer.isBuffer(buffer) || !buffer.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('not a PNG buffer');
  }
  if (!Number.isInteger(cropWidth) || !Number.isInteger(cropHeight) ||
      cropWidth <= 0 || cropHeight <= 0) {
    throw new Error(`invalid crop size ${cropWidth}x${cropHeight}`);
  }

  let offset = 8;
  let ihdr = null;
  const idat = [];

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') ihdr = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }

  if (!ihdr) throw new Error('PNG has no IHDR chunk');

  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const interlace = ihdr[12];

  if (bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${bitDepth}; expected 8`);
  if (interlace !== 0) throw new Error('interlaced PNGs are not supported');
  const channels = CHANNELS[colorType];
  if (!channels) throw new Error(`unsupported PNG colour type ${colorType}`);
  if (cropWidth > width || cropHeight > height) {
    throw new Error(`crop ${cropWidth}x${cropHeight} is larger than the image ${width}x${height}`);
  }
  if (cropWidth === width && cropHeight === height) return buffer;

  const bpp = channels;
  const pixels = unfilter(zlib.inflateSync(Buffer.concat(idat)), width, height, bpp);

  const srcStride = width * bpp;
  const dstStride = cropWidth * bpp;
  // One filter byte per row, all filter type 0 (None): correctness over size.
  const filtered = Buffer.alloc((dstStride + 1) * cropHeight);
  for (let y = 0; y < cropHeight; y++) {
    filtered[y * (dstStride + 1)] = 0;
    pixels.copy(filtered, y * (dstStride + 1) + 1, y * srcStride, y * srcStride + dstStride);
  }

  const newIhdr = Buffer.from(ihdr);
  newIhdr.writeUInt32BE(cropWidth, 0);
  newIhdr.writeUInt32BE(cropHeight, 4);

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', newIhdr),
    chunk('IDAT', zlib.deflateSync(filtered)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
