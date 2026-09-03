import * as ort from 'onnxruntime-web';

const HF_BASE = 'https://huggingface.co/Supertone/supertonic-3/resolve/main/onnx';
const HF_VOICES = 'https://huggingface.co/Supertone/supertonic-3/resolve/main/voice_styles';

export const AVAILABLE_LANGS = ['en','ko','ja','ar','bg','cs','da','de','el','es','et','fi','fr','hi','hr','hu','id','it','lt','lv','nl','pl','pt','ro','ru','sk','sl','sv','tr','uk','vi'];

export function isValidLang(lang) {
  return AVAILABLE_LANGS.includes(lang);
}

export class UnicodeProcessor {
  constructor(indexer) { this.indexer = indexer; }

  call(textList, langList) {
    const processedTexts = textList.map((text, i) => this.preprocessText(text, langList[i]));
    const textIdsLengths = processedTexts.map(t => t.length);
    const maxLen = Math.max(...textIdsLengths);
    const textIds = processedTexts.map(text => {
      const row = new Array(maxLen).fill(0);
      for (let j = 0; j < text.length; j++) {
        const cp = text.codePointAt(j);
        row[j] = (cp < this.indexer.length) ? this.indexer[cp] : -1;
      }
      return row;
    });
    const textMask = this.getTextMask(textIdsLengths);
    return { textIds, textMask };
  }

  preprocessText(text, lang) {
    text = text.normalize('NFKD');
    text = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu, '');
    const rep = {'–':'-','‑':'-','—':'-','_':' ','“':'"','”':'"','‘':"'",'’':"'",'`':"'",'[':' ',']':' ','|':' ','/':' ','#':' ','→':' ','←':' '};
    for (const [k,v] of Object.entries(rep)) text = text.replaceAll(k,v);
    text = text.replace(/[♥☆♡©\\]/g, '');
    text = text.replaceAll('@',' at ').replaceAll('e.g.,','for example, ').replaceAll('i.e.,','that is, ');
    text = text.replace(/ ,/g,',').replace(/ \./g,'.').replace(/ !/g,'!').replace(/ \?/g,'?').replace(/ ;/g,';').replace(/ :/g,':').replace(/ '/g,"'");
    while (text.includes('""')) text = text.replace('""','"');
    while (text.includes("''")) text = text.replace("''","'");
    text = text.replace(/\s+/g,' ').trim();
    if (!/[.!?;:,'"')\]}…。」』】〉》›»]$/.test(text)) text += '.';
    if (!isValidLang(lang)) throw new Error(`Invalid language: ${lang}`);
    return `<${lang}>${text}</${lang}>`;
  }

  getTextMask(lengths) {
    const maxLen = Math.max(...lengths);
    return lengths.map(len => {
      const row = new Array(maxLen).fill(0.0);
      for (let j = 0; j < Math.min(len,maxLen); j++) row[j] = 1.0;
      return [row];
    });
  }
}

export class Style {
  constructor(ttl, dp) { this.ttl = ttl; this.dp = dp; }
}

export class TextToSpeech {
  constructor(cfgs, textProcessor, dpOrt, textEncOrt, vectorEstOrt, vocoderOrt) {
    this.cfgs = cfgs;
    this.textProcessor = textProcessor;
    this.dpOrt = dpOrt;
    this.textEncOrt = textEncOrt;
    this.vectorEstOrt = vectorEstOrt;
    this.vocoderOrt = vocoderOrt;
    this.sampleRate = cfgs.ae.sample_rate;
  }

  async _infer(textList, langList, style, totalStep, speed, progressCallback) {
    const bsz = textList.length;
    const { textIds, textMask } = this.textProcessor.call(textList, langList);

    const textIdsTensor = new ort.Tensor('int64', new BigInt64Array(textIds.flat().map(x => BigInt(x))), [bsz, textIds[0].length]);
    const textMaskTensor = new ort.Tensor('float32', new Float32Array(textMask.flat(2)), [bsz, 1, textMask[0][0].length]);

    const dpOutputs = await this.dpOrt.run({ text_ids: textIdsTensor, style_dp: style.dp, text_mask: textMaskTensor });
    const duration = Array.from(dpOutputs.duration.data);
    for (let i = 0; i < duration.length; i++) duration[i] /= speed;

    const textEncOutputs = await this.textEncOrt.run({ text_ids: textIdsTensor, style_ttl: style.ttl, text_mask: textMaskTensor });
    const textEmb = textEncOutputs.text_emb;

    let { xt, latentMask } = this.sampleNoisyLatent(duration, this.sampleRate, this.cfgs.ae.base_chunk_size, this.cfgs.ttl.chunk_compress_factor, this.cfgs.ttl.latent_dim);

    const latentMaskTensor = new ort.Tensor('float32', new Float32Array(latentMask.flat(2)), [bsz, 1, latentMask[0][0].length]);
    const totalStepTensor = new ort.Tensor('float32', new Float32Array(bsz).fill(totalStep), [bsz]);

    for (let step = 0; step < totalStep; step++) {
      if (progressCallback) progressCallback(step + 1, totalStep);
      const currentStepTensor = new ort.Tensor('float32', new Float32Array(bsz).fill(step), [bsz]);
      const xtTensor = new ort.Tensor('float32', new Float32Array(xt.flat(2)), [bsz, xt[0].length, xt[0][0].length]);

      const vectorEstOutputs = await this.vectorEstOrt.run({
        noisy_latent: xtTensor, text_emb: textEmb, style_ttl: style.ttl,
        latent_mask: latentMaskTensor, text_mask: textMaskTensor,
        current_step: currentStepTensor, total_step: totalStepTensor
      });
      const denoised = Array.from(vectorEstOutputs.denoised_latent.data);
      const latentDim = xt[0].length, latentLen = xt[0][0].length;
      xt = [];
      let idx = 0;
      for (let b = 0; b < bsz; b++) {
        const batch = [];
        for (let d = 0; d < latentDim; d++) {
          const row = [];
          for (let t = 0; t < latentLen; t++) row.push(denoised[idx++]);
          batch.push(row);
        }
        xt.push(batch);
      }
    }

    const finalXtTensor = new ort.Tensor('float32', new Float32Array(xt.flat(2)), [bsz, xt[0].length, xt[0][0].length]);
    const vocoderOutputs = await this.vocoderOrt.run({ latent: finalXtTensor });
    return { wav: Array.from(vocoderOutputs.wav_tts.data), duration };
  }

  async call(text, lang, style, totalStep, speed = 1.05, silenceDuration = 0.3, progressCallback = null) {
    if (style.ttl.dims[0] !== 1) throw new Error('Single speaker only');
    const maxLen = (lang === 'ko' || lang === 'ja') ? 120 : 300;
    const textList = chunkText(text, maxLen);
    const langList = new Array(textList.length).fill(lang);
    let wavCat = [], durCat = 0;
    for (let i = 0; i < textList.length; i++) {
      const { wav, duration } = await this._infer([textList[i]], [langList[i]], style, totalStep, speed, progressCallback);
      if (wavCat.length === 0) { wavCat = wav; durCat = duration[0]; }
      else {
        const silence = new Array(Math.floor(silenceDuration * this.sampleRate)).fill(0);
        wavCat = [...wavCat, ...silence, ...wav];
        durCat += duration[0] + silenceDuration;
      }
    }
    return { wav: wavCat, duration: [durCat] };
  }

  sampleNoisyLatent(duration, sampleRate, baseChunkSize, chunkCompress, latentDim) {
    const bsz = duration.length;
    const maxDur = Math.max(...duration);
    const wavLengths = duration.map(d => Math.floor(d * sampleRate));
    const chunkSize = baseChunkSize * chunkCompress;
    const latentLen = Math.floor((Math.floor(maxDur * sampleRate) + chunkSize - 1) / chunkSize);
    const latentDimVal = latentDim * chunkCompress;

    const xt = [];
    for (let b = 0; b < bsz; b++) {
      const batch = [];
      for (let d = 0; d < latentDimVal; d++) {
        const row = [];
        for (let t = 0; t < latentLen; t++) {
          const u1 = Math.max(0.0001, Math.random()), u2 = Math.random();
          row.push(Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2));
        }
        batch.push(row);
      }
      xt.push(batch);
    }

    const latentLengths = wavLengths.map(len => Math.floor((len + chunkSize - 1) / chunkSize));
    const latentMask = latentLengths.map(len => {
      const row = new Array(latentLen).fill(0.0);
      for (let j = 0; j < Math.min(len, latentLen); j++) row[j] = 1.0;
      return [row];
    });

    for (let b = 0; b < bsz; b++)
      for (let d = 0; d < latentDimVal; d++)
        for (let t = 0; t < latentLen; t++)
          xt[b][d][t] *= latentMask[b][0][t];

    return { xt, latentMask };
  }
}

function chunkText(text, maxLen = 300) {
  const paragraphs = text.trim().split(/\n\s*\n+/).filter(p => p.trim());
  const chunks = [];
  for (let paragraph of paragraphs) {
    paragraph = paragraph.trim();
    if (!paragraph) continue;
    const sentences = paragraph.split(/(?<!Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.|Sr\.|Jr\.|Ph\.D\.|etc\.|e\.g\.|i\.e\.|vs\.|Inc\.|Ltd\.|Co\.|Corp\.|St\.|Ave\.|Blvd\.)(?<!\b[A-Z]\.)(?<=[.!?])\s+/);
    let cur = '';
    for (const s of sentences) {
      if (cur.length + s.length + 1 <= maxLen) cur += (cur ? ' ' : '') + s;
      else { if (cur) chunks.push(cur.trim()); cur = s; }
    }
    if (cur) chunks.push(cur.trim());
  }
  return chunks;
}

export function writeWavFile(audioData, sampleRate) {
  const dataSize = audioData.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  ws(0,'RIFF'); view.setUint32(4,36+dataSize,true); ws(8,'WAVE'); ws(12,'fmt ');
  view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true);
  view.setUint32(24,sampleRate,true); view.setUint32(28,sampleRate*2,true);
  view.setUint16(32,2,true); view.setUint16(34,16,true); ws(36,'data'); view.setUint32(40,dataSize,true);
  const int16 = new Int16Array(audioData.length);
  for (let i = 0; i < audioData.length; i++) int16[i] = Math.floor(Math.max(-1,Math.min(1,audioData[i])) * 32767);
  new Uint8Array(buffer, 44).set(new Uint8Array(int16.buffer));
  return buffer;
}

export async function loadVoiceStyle(voiceStylePaths) {
  const bsz = voiceStylePaths.length;
  const firstResponse = await fetch(voiceStylePaths[0]);
  const firstStyle = await firstResponse.json();
  const [,ttlDim1,ttlDim2] = firstStyle.style_ttl.dims;
  const [,dpDim1,dpDim2] = firstStyle.style_dp.dims;

  const ttlFlat = new Float32Array(bsz * ttlDim1 * ttlDim2);
  const dpFlat = new Float32Array(bsz * dpDim1 * dpDim2);

  for (let i = 0; i < bsz; i++) {
    const vs = i === 0 ? firstStyle : await (await fetch(voiceStylePaths[i])).json();
    ttlFlat.set(vs.style_ttl.data.flat(Infinity), i * ttlDim1 * ttlDim2);
    dpFlat.set(vs.style_dp.data.flat(Infinity), i * dpDim1 * dpDim2);
  }

  return new Style(
    new ort.Tensor('float32', ttlFlat, [bsz, ttlDim1, ttlDim2]),
    new ort.Tensor('float32', dpFlat, [bsz, dpDim1, dpDim2])
  );
}

async function fetchWithProgress(url, name, progressCallback) {
  const resp = await fetch(url);
  const total = parseInt(resp.headers.get('content-length') || '0');
  if (!total || !resp.body) return resp.arrayBuffer();

  const reader = resp.body.getReader();
  const chunks = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (progressCallback) progressCallback(name, loaded, total);
  }
  const buf = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) { buf.set(chunk, offset); offset += chunk.length; }
  return buf.buffer;
}

export async function loadTextToSpeech(progressCallback, downloadCallback) {
  let executionProvider = 'wasm';

  let hasWebGPU = false;
  try { hasWebGPU = !!navigator.gpu && !!(await navigator.gpu.requestAdapter()); } catch {}
  const providers = hasWebGPU ? ['webgpu'] : ['wasm'];
  if (hasWebGPU) executionProvider = 'webgpu';

  const opts = { executionProviders: providers, graphOptimizationLevel: 'all' };

  const models = [
    { name: 'Duration Predictor', file: 'duration_predictor.onnx' },
    { name: 'Text Encoder', file: 'text_encoder.onnx' },
    { name: 'Vector Estimator', file: 'vector_estimator.onnx' },
    { name: 'Vocoder', file: 'vocoder.onnx' }
  ];

  if (progressCallback) progressCallback('Downloading models…', 0, models.length);

  // Download all models in parallel
  const buffers = await Promise.all(
    models.map(m => fetchWithProgress(`${HF_BASE}/${m.file}`, m.name, downloadCallback))
  );

  // Create ONNX sessions (sequential — each needs GPU/WASM init)
  const sessions = [];
  for (let i = 0; i < models.length; i++) {
    if (progressCallback) progressCallback(`Initializing ${models[i].name}`, i + 1, models.length);
    try {
      sessions.push(await ort.InferenceSession.create(new Uint8Array(buffers[i]), opts));
    } catch {
      if (hasWebGPU) {
        executionProvider = 'wasm';
        const wasmOpts = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
        sessions.length = 0;
        for (let j = 0; j <= i; j++) {
          sessions.push(await ort.InferenceSession.create(new Uint8Array(buffers[j]), wasmOpts));
        }
        opts.executionProviders = ['wasm'];
        hasWebGPU = false;
      } else throw new Error(`Failed to init ${models[i].name}`);
    }
  }

  const [cfgsResp, indexerResp] = await Promise.all([
    fetch(`${HF_BASE}/tts.json`),
    fetch(`${HF_BASE}/unicode_indexer.json`)
  ]);
  const cfgs = await cfgsResp.json();
  const indexer = await indexerResp.json();
  const tp = new UnicodeProcessor(indexer);
  const textToSpeech = new TextToSpeech(cfgs, tp, sessions[0], sessions[1], sessions[2], sessions[3]);

  return { textToSpeech, cfgs, executionProvider };
}

export function getVoiceStyleURL(name) {
  return `${HF_VOICES}/${name}.json`;
}

export function loadVoiceStyleFromData(jsonData) {
  const [,ttlDim1,ttlDim2] = jsonData.style_ttl.dims;
  const [,dpDim1,dpDim2] = jsonData.style_dp.dims;
  const ttlFlat = new Float32Array(jsonData.style_ttl.data.flat(Infinity));
  const dpFlat = new Float32Array(jsonData.style_dp.data.flat(Infinity));
  return new Style(
    new ort.Tensor('float32', ttlFlat, [1, ttlDim1, ttlDim2]),
    new ort.Tensor('float32', dpFlat, [1, dpDim1, dpDim2])
  );
}
