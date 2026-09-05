/**
 * Pack JSON snapshots into compact binary .bin files.
 * Only stores the used KV cache positions (not the NaN padding).
 *
 * Binary format per file:
 *   4 bytes: magic "SNAP"
 *   2 bytes: uint16 number of state entries
 *   For each entry:
 *     1 byte: name length
 *     N bytes: name (utf8)
 *     1 byte: dtype (0=float32, 1=int64, 2=bool)
 *     1 byte: number of dims
 *     4 bytes * ndims: dims (uint32 each)
 *     4 bytes: data byte length
 *     N bytes: raw data
 *   For float32 KV caches with dim=1000 (seq axis):
 *     Only stores the used positions (trimmed from dim[2])
 */
import fs from 'fs';
import path from 'path';

const SNAP_DIR = path.join(import.meta.dirname, '..', 'public', 'voice-snapshots');
const BIN_DIR = path.join(import.meta.dirname, '..', 'public', 'voice-snapshots-bin');

fs.mkdirSync(BIN_DIR, { recursive: true });

const files = fs.readdirSync(SNAP_DIR).filter(f => f.endsWith('.json'));
console.log(`Packing ${files.length} snapshots...`);

let totalJsonBytes = 0, totalBinBytes = 0;

for (let i = 0; i < files.length; i++) {
  const file = files[i];
  const jsonPath = path.join(SNAP_DIR, file);
  const binPath = path.join(BIN_DIR, file.replace('.json', '.bin'));

  if (fs.existsSync(binPath)) continue;

  const jsonSize = fs.statSync(jsonPath).size;
  totalJsonBytes += jsonSize;

  const snap = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const entries = Object.entries(snap);

  // Find used length from int64 counter states
  let usedLen = 0;
  for (const [name, val] of entries) {
    if (val.type === 'int64' && val.data.length === 1) {
      const v = parseInt(val.data[0]);
      if (v > usedLen) usedLen = v;
    }
  }

  const chunks = [];
  // Magic + entry count
  const header = Buffer.alloc(6);
  header.write('SNAP', 0);
  header.writeUInt16LE(entries.length, 4);
  chunks.push(header);

  for (const [name, val] of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const dtype = val.type === 'int64' ? 1 : val.type === 'bool' ? 2 : 0;

    // Determine trimmed dims and data
    let dims = val.dims;
    let rawData;

    if (val.type === 'float32' && dims.length === 5 && dims[2] === 1000 && usedLen > 0) {
      // KV cache: trim seq dimension from 1000 to usedLen
      const trimmedDims = [dims[0], dims[1], usedLen, dims[3], dims[4]];
      const posSize = dims[3] * dims[4]; // 16 * 64 = 1024
      const batchHeadSize = dims[2] * posSize; // 1000 * 1024
      const trimmedBatchHeadSize = usedLen * posSize;
      const totalHeads = dims[0] * dims[1]; // 2 * 1
      const buf = Buffer.alloc(totalHeads * trimmedBatchHeadSize * 4);

      for (let h = 0; h < totalHeads; h++) {
        for (let p = 0; p < usedLen; p++) {
          const srcOffset = h * batchHeadSize + p * posSize;
          const dstOffset = h * trimmedBatchHeadSize + p * posSize;
          for (let k = 0; k < posSize; k++) {
            const v = val.data[srcOffset + k];
            buf.writeFloatLE(v === null ? NaN : v, (dstOffset + k) * 4);
          }
        }
      }
      dims = trimmedDims;
      rawData = buf;
    } else if (val.type === 'float32') {
      rawData = Buffer.alloc(val.data.length * 4);
      for (let j = 0; j < val.data.length; j++) {
        const v = val.data[j];
        rawData.writeFloatLE(v === null ? NaN : v, j * 4);
      }
    } else if (val.type === 'int64') {
      rawData = Buffer.alloc(val.data.length * 8);
      for (let j = 0; j < val.data.length; j++) {
        rawData.writeBigInt64LE(BigInt(val.data[j]), j * 8);
      }
    } else if (val.type === 'bool') {
      rawData = Buffer.from(val.data);
    } else {
      rawData = Buffer.alloc(0);
    }

    // Entry header: nameLen(1) + name + dtype(1) + ndims(1) + dims(4*n) + dataLen(4) + data
    const entryHeader = Buffer.alloc(1 + nameBuf.length + 1 + 1 + dims.length * 4 + 4);
    let off = 0;
    entryHeader.writeUInt8(nameBuf.length, off); off += 1;
    nameBuf.copy(entryHeader, off); off += nameBuf.length;
    entryHeader.writeUInt8(dtype, off); off += 1;
    entryHeader.writeUInt8(dims.length, off); off += 1;
    for (const d of dims) { entryHeader.writeUInt32LE(d, off); off += 4; }
    entryHeader.writeUInt32LE(rawData.length, off);

    chunks.push(entryHeader);
    chunks.push(rawData);
  }

  const bin = Buffer.concat(chunks);
  fs.writeFileSync(binPath, bin);
  totalBinBytes += bin.length;

  if ((i + 1) % 50 === 0 || i === files.length - 1) {
    process.stdout.write(`\r[${i + 1}/${files.length}] ${file}                    `);
  }
}

console.log(`\n\nDone!`);
console.log(`JSON total: ${(totalJsonBytes / 1024 / 1024 / 1024).toFixed(2)} GB`);
console.log(`BIN total: ${(totalBinBytes / 1024 / 1024).toFixed(1)} MB`);
console.log(`Compression ratio: ${(totalJsonBytes / totalBinBytes).toFixed(1)}x`);
