/**
 * Batch Voice Clone Script
 * Downloads WAVs from kyutai/tts-voices, runs clone pipeline, saves snapshots + metadata.
 * Output: voices-community.json + public/voice-snapshots/*.json
 */
import ort from 'onnxruntime-node';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public');
const CACHE_DIR = path.join(__dirname, '..', '.voice-cache');
const SNAP_DIR = path.join(OUT_DIR, 'voice-snapshots');
const META_FILE = path.join(OUT_DIR, 'voices-community.json');
const PROGRESS_FILE = path.join(CACHE_DIR, 'progress.json');

const HF_BASE = 'https://huggingface.co/KevinAHM/pocket-tts-onnx/resolve/main/onnx/english_2026-04/';
const VOICES_BASE = 'https://huggingface.co/kyutai/tts-voices/resolve/main/';
const VOICES_API = 'https://huggingface.co/api/models/kyutai/tts-voices/tree/main/';

const MODEL_FILES = [
  'flow_lm_main_int8.onnx',
  'mimi_encoder_int8.onnx',
  'bundle.json',
  'bos_before_voice.npy',
];

const VOICE_DIRS = [
  { dir: 'voice-donations', license: 'CC0' },
  { dir: 'vctk', license: 'CC-BY-4.0' },
  { dir: 'alba-mackenna', license: 'CC-BY-4.0' },
  { dir: 'voice-zero', license: 'CC0' },
];

const SAMPLE_RATE = 24000;
const LATENT_DIM = 32;
const COND_DIM = 1024;

// ─── Helpers ───

function parseNpy(buf) {
  const header = new TextDecoder().decode(new Uint8Array(buf, 0, 200));
  const match = header.match(/'shape': \(([^)]*)\)/);
  const shape = match ? match[1].split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)) : [1];
  const headerLen = new DataView(buf, 0).getUint16(8, true) + 10;
  const data = new Float32Array(buf.slice(headerLen));
  return { data, shape };
}

function prettyName(filename) {
  return filename.replace(/\.wav$/i, '').replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function detectPitch(pcm, sr) {
  const minLag = Math.floor(sr / 500);
  const maxLag = Math.ceil(sr / 60);
  const windowSize = Math.min(pcm.length, sr);
  const samples = pcm.subarray(0, windowSize);
  let bestLag = 0, bestCorr = 0;
  for (let lag = minLag; lag <= Math.min(maxLag, windowSize / 2); lag++) {
    let corr = 0, norm1 = 0, norm2 = 0;
    const len = windowSize - lag;
    for (let i = 0; i < len; i++) {
      corr += samples[i] * samples[i + lag];
      norm1 += samples[i] * samples[i];
      norm2 += samples[i + lag] * samples[i + lag];
    }
    const norm = Math.sqrt(norm1 * norm2);
    if (norm > 0) corr /= norm;
    if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
  }
  if (bestCorr < 0.3 || bestLag === 0) return { f0: 0, gender: 'unknown' };
  const f0 = sr / bestLag;
  return { f0: Math.round(f0), gender: f0 < 165 ? 'male' : 'female' };
}

function decodeWav(buffer) {
  const view = new DataView(buffer);
  let offset = 12;
  let channels = 1, sampleRate = 44100, bitsPerSample = 16;
  let dataOffset = 0, dataSize = 0;
  while (offset < buffer.byteLength - 8) {
    const chunkId = String.fromCharCode(view.getUint8(offset), view.getUint8(offset+1), view.getUint8(offset+2), view.getUint8(offset+3));
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === 'fmt ') {
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataSize = chunkSize;
      break;
    }
    offset += 8 + chunkSize;
    if (chunkSize % 2 !== 0) offset++;
  }
  if (!dataOffset) throw new Error('No data chunk');
  const numSamples = Math.floor(dataSize / (bitsPerSample / 8) / channels);
  const pcm = new Float32Array(numSamples);
  if (bitsPerSample === 16) {
    for (let i = 0; i < numSamples; i++) {
      let sum = 0;
      for (let c = 0; c < channels; c++) sum += view.getInt16(dataOffset + (i * channels + c) * 2, true) / 32768;
      pcm[i] = sum / channels;
    }
  } else if (bitsPerSample === 24) {
    for (let i = 0; i < numSamples; i++) {
      let sum = 0;
      for (let c = 0; c < channels; c++) {
        const off = dataOffset + (i * channels + c) * 3;
        sum += (view.getUint8(off) | (view.getUint8(off+1) << 8) | (view.getInt8(off+2) << 16)) / 8388608;
      }
      pcm[i] = sum / channels;
    }
  } else if (bitsPerSample === 32) {
    for (let i = 0; i < numSamples; i++) {
      let sum = 0;
      for (let c = 0; c < channels; c++) sum += view.getFloat32(dataOffset + (i * channels + c) * 4, true);
      pcm[i] = sum / channels;
    }
  }
  return { pcm, sampleRate };
}

function resample(pcm, fromRate, toRate) {
  if (fromRate === toRate) return pcm;
  const ratio = fromRate / toRate;
  const outLen = Math.ceil(pcm.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcIdx = i * ratio;
    const idx = Math.floor(srcIdx);
    const frac = srcIdx - idx;
    out[i] = idx + 1 < pcm.length ? pcm[idx] * (1 - frac) + pcm[idx + 1] * frac : pcm[idx] || 0;
  }
  return out;
}

async function downloadFile(url, cachePath) {
  if (fs.existsSync(cachePath)) return fs.readFileSync(cachePath).buffer;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const buf = await resp.arrayBuffer();
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, Buffer.from(buf));
  return buf;
}

// ─── StateRunner ───

class StateRunner {
  constructor(session, manifest) {
    this.sess = session;
    this.manifest = manifest;
    this.reset();
  }
  _createTensor(entry) {
    const shape = entry.shape.slice();
    const n = shape.reduce((a, b) => a * b, 1);
    if (n === 0 || shape.includes(0)) {
      if (entry.dtype === 'int64') return new ort.Tensor('int64', new BigInt64Array(0), shape);
      if (entry.dtype === 'bool') return new ort.Tensor('bool', new Uint8Array(0), shape);
      return new ort.Tensor('float32', new Float32Array(0), shape);
    }
    if (entry.dtype === 'int64') return new ort.Tensor('int64', new BigInt64Array(n), shape);
    if (entry.dtype === 'bool') {
      const d = new Uint8Array(n);
      if (entry.fill === 'ones') d.fill(1);
      return new ort.Tensor('bool', d, shape);
    }
    const d = new Float32Array(n);
    if (entry.fill === 'nan') for (let i = 0; i < n; i++) d[i] = NaN;
    return new ort.Tensor('float32', d, shape);
  }
  reset() {
    this.states = new Map();
    for (const entry of this.manifest) this.states.set(entry.input_name, this._createTensor(entry));
  }
  snapshot() {
    const snap = {};
    for (const [name, t] of this.states) {
      snap[name] = {
        data: t.type === 'int64' ? Array.from(t.data, v => v.toString()) : Array.from(t.data),
        dims: [...t.dims],
        type: t.type
      };
    }
    return snap;
  }
  async run(inputs) {
    const feeds = { ...inputs };
    for (const [name, t] of this.states) feeds[name] = t;
    const out = await this.sess.run(feeds);
    for (const key of Object.keys(out)) {
      if (key.startsWith('out_state_')) {
        const name = key.slice(4);
        if (this.states.has(name)) this.states.set(name, out[key]);
      }
    }
    return out;
  }
}

// ─── Main ───

async function listVoices(dir) {
  const resp = await fetch(VOICES_API + dir);
  if (!resp.ok) throw new Error(`API ${resp.status}`);
  const files = await resp.json();
  return files.filter(f => f.path.endsWith('.wav')).map(f => ({
    name: f.path.split('/').pop(), path: f.path, size: f.size || 0
  }));
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(SNAP_DIR, { recursive: true });

  // Load lightweight progress (just keys of processed voices + metadata)
  let progress = {};
  if (fs.existsSync(PROGRESS_FILE)) {
    progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    console.log(`Resuming — ${Object.keys(progress).length} voices already processed`);
  }

  // Step 1: Download models
  console.log('\n=== Step 1: Downloading model files ===');
  const modelCache = path.join(CACHE_DIR, 'models');
  for (const f of MODEL_FILES) await downloadFile(HF_BASE + f, path.join(modelCache, f));

  // Step 2: Load ONNX sessions
  console.log('\n=== Step 2: Loading ONNX sessions ===');
  const bundleData = JSON.parse(fs.readFileSync(path.join(modelCache, 'bundle.json'), 'utf-8'));
  const bosNpy = parseNpy(fs.readFileSync(path.join(modelCache, 'bos_before_voice.npy')).buffer);
  const opts = { executionProviders: ['cpu'], graphOptimizationLevel: 'all' };

  console.log('  Loading mimi_encoder...');
  const encoderSession = await ort.InferenceSession.create(path.join(modelCache, 'mimi_encoder_int8.onnx'), opts);
  console.log('  Loading flow_lm_main...');
  const mainSession = await ort.InferenceSession.create(path.join(modelCache, 'flow_lm_main_int8.onnx'), opts);
  const mainRunner = new StateRunner(mainSession, bundleData.flow_lm_state_manifest);

  // Step 3: List all voices
  console.log('\n=== Step 3: Listing voices ===');
  const allVoices = [];
  for (const { dir, license } of VOICE_DIRS) {
    try {
      const voices = await listVoices(dir);
      for (const v of voices) allVoices.push({ ...v, dir, license });
      console.log(`  ${dir}: ${voices.length} WAV files`);
    } catch (e) {
      console.warn(`  ${dir}: FAILED (${e.message})`);
    }
  }
  console.log(`Total: ${allVoices.length} voices to process`);

  // Step 4: Process each voice
  console.log('\n=== Step 4: Processing voices ===');
  const wavCache = path.join(CACHE_DIR, 'wavs');
  let processed = 0, skipped = 0, failed = 0;

  for (const voice of allVoices) {
    const key = voice.dir + '/' + voice.name;
    const snapFile = voice.name.replace(/\.wav$/i, '') + '.json';

    if (progress[key]) {
      skipped++;
      continue;
    }

    processed++;
    const total = processed + skipped;
    const pct = (total / allVoices.length * 100).toFixed(1);
    process.stdout.write(`\r[${pct}%] ${total}/${allVoices.length} — ${key}                    `);

    try {
      // Download WAV
      const wavPath = path.join(wavCache, voice.dir, voice.name);
      const wavBuf = await downloadFile(VOICES_BASE + voice.path, wavPath);

      // Decode and resample
      const { pcm, sampleRate } = decodeWav(wavBuf);
      let audio24k = resample(pcm, sampleRate, SAMPLE_RATE);
      if (audio24k.length > 30 * SAMPLE_RATE) audio24k = audio24k.subarray(0, 30 * SAMPLE_RATE);

      // Detect pitch/gender
      const { f0, gender } = detectPitch(audio24k, SAMPLE_RATE);

      // Run mimi_encoder
      const audioTensor = new ort.Tensor('float32', new Float32Array(audio24k), [1, 1, audio24k.length]);
      const encOut = await encoderSession.run({ audio: audioTensor });
      const emb = encOut[encoderSession.outputNames[0]];

      // Prepend BOS
      const embData = new Float32Array(bosNpy.data.length + emb.data.length);
      embData.set(bosNpy.data);
      embData.set(emb.data, bosNpy.data.length);
      const T = (emb.dims.length === 3 ? emb.dims[1] : emb.dims[0]) + 1;

      // Run conditioning pass
      mainRunner.reset();
      await mainRunner.run({
        sequence: new ort.Tensor('float32', new Float32Array(0), [1, 0, LATENT_DIM]),
        text_embeddings: new ort.Tensor('float32', embData, [1, T, COND_DIM]),
      });

      // Save snapshot to individual file
      const snap = mainRunner.snapshot();
      fs.writeFileSync(path.join(SNAP_DIR, snapFile), JSON.stringify(snap));

      // Track metadata in progress (no snapshot data)
      progress[key] = {
        name: voice.name,
        pretty: prettyName(voice.name),
        dir: voice.dir,
        license: voice.license,
        gender, f0,
        snapFile,
      };

      // Save progress every 20 voices
      if (processed % 20 === 0) {
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));
      }

    } catch (e) {
      console.log(`\n  FAILED ${key}: ${e.message}`);
      failed++;
    }
  }

  // Save final progress + metadata
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));

  const metadata = Object.values(progress);
  fs.writeFileSync(META_FILE, JSON.stringify(metadata, null, 2));

  console.log(`\n\n=== Done! ===`);
  console.log(`Processed: ${processed}, Skipped: ${skipped}, Failed: ${failed}`);
  console.log(`Total voices: ${metadata.length}`);
  console.log(`Males: ${metadata.filter(r => r.gender === 'male').length}`);
  console.log(`Females: ${metadata.filter(r => r.gender === 'female').length}`);
  console.log(`Unknown: ${metadata.filter(r => r.gender === 'unknown').length}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
