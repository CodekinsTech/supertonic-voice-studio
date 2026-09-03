import { loadTextToSpeech, loadVoiceStyle, loadVoiceStyleFromData, writeWavFile, getVoiceStyleURL, AVAILABLE_LANGS } from './helper.js';
import lamejs from 'lamejs';

const $ = id => document.getElementById(id);

const LANG_NAMES = {
  en:'English',ko:'한국어',ja:'日本語',ar:'العربية',bg:'Bulgarian',cs:'Czech',
  da:'Danish',de:'Deutsch',el:'Greek',es:'Español',et:'Estonian',fi:'Finnish',
  fr:'Français',hi:'Hindi',hr:'Croatian',hu:'Hungarian',id:'Indonesian',
  it:'Italian',lt:'Lithuanian',lv:'Latvian',nl:'Dutch',pl:'Polish',pt:'Português',
  ro:'Romanian',ru:'Russian',sk:'Slovak',sl:'Slovenian',sv:'Swedish',tr:'Turkish',
  uk:'Ukrainian',vi:'Vietnamese'
};

let tts = null;
let currentStyle = null;
let currentVoice = 'M1';
let currentLang = 'en';
let currentDSP = 'polished';
let currentFX = 'none';

const DSP_PRESETS = {
  raw:      { deEss:false, multiband:false, warmth:false, compress:false, normalize:false },
  polished: { deEss:true,  multiband:true,  warmth:false, compress:true,  normalize:true  },
  premium:  { deEss:true,  multiband:true,  warmth:true,  compress:true,  normalize:true  },
  propack:  { deEss:true,  multiband:true,  warmth:true,  compress:true,  normalize:true  }
};

const FX_PARAMS = {
  none:     { pitchSemis:0,   eqLow:0,  eqHigh:0,  breathy:false },
  happy:    { pitchSemis:1.5, eqLow:1,  eqHigh:4,  breathy:false },
  sad:      { pitchSemis:-2,  eqLow:3,  eqHigh:-3, breathy:false },
  calm:     { pitchSemis:-1,  eqLow:3,  eqHigh:-4, breathy:false },
  angry:    { pitchSemis:1,   eqLow:-2, eqHigh:7,  breathy:false },
  whisper:  { pitchSemis:0,   eqLow:-8, eqHigh:5,  breathy:true  },
  hero:     { pitchSemis:-2,  eqLow:6,  eqHigh:-1, breathy:false },
  cartoon:  { pitchSemis:5,   eqLow:-2, eqHigh:5,  breathy:false },
  cinematic:{ pitchSemis:-3,  eqLow:5,  eqHigh:2,  breathy:false },
  polish:   { pitchSemis:0,   eqLow:0,  eqHigh:3,  breathy:false }
};

// Sliders
function updateSlider(el) {
  const min = parseFloat(el.min), max = parseFloat(el.max);
  const pct = ((parseFloat(el.value) - min) / (max - min)) * 100;
  el.style.setProperty('--p', pct + '%');
}

// Voice Presets — each is a named combo of voice + speed + FX + DSP
const VOICE_PRESETS = {
  narrator:    { voice:'M3', speed:0.95, fx:'cinematic', dsp:'premium' },
  storyteller: { voice:'F2', speed:1.0,  fx:'calm',      dsp:'premium' },
  newscaster:  { voice:'M2', speed:1.05, fx:'none',      dsp:'polished' },
  gentle:      { voice:'F4', speed:0.90, fx:'calm',      dsp:'premium' },
  energetic:   { voice:'M1', speed:1.15, fx:'happy',     dsp:'propack' },
  dramatic:    { voice:'M5', speed:0.85, fx:'hero',      dsp:'propack' },
  soothing:    { voice:'F3', speed:0.90, fx:'calm',      dsp:'premium' },
  child:       { voice:'F1', speed:1.25, fx:'cartoon',   dsp:'polished' },
  villain:     { voice:'M4', speed:0.80, fx:'angry',     dsp:'propack' },
  whispersoft: { voice:'F5', speed:0.95, fx:'whisper',   dsp:'polished' },
  bold:        { voice:'M1', speed:1.0,  fx:'hero',      dsp:'propack' },
  warmfem:     { voice:'F2', speed:0.95, fx:'polish',    dsp:'premium' },
  deeptone:    { voice:'M5', speed:0.85, fx:'cinematic', dsp:'propack' },
  bubbly:      { voice:'F1', speed:1.15, fx:'happy',     dsp:'polished' },
  professor:   { voice:'M3', speed:0.95, fx:'none',      dsp:'polished' },
  poetess:     { voice:'F4', speed:0.85, fx:'cinematic', dsp:'premium' },
  commander:   { voice:'M2', speed:1.0,  fx:'hero',      dsp:'propack' },
  lullaby:     { voice:'F3', speed:0.80, fx:'whisper',   dsp:'premium' },
  hype:        { voice:'M1', speed:1.20, fx:'happy',     dsp:'propack' },
  mystic:      { voice:'F5', speed:0.85, fx:'cinematic', dsp:'premium' }
};

function applyPreset(key) {
  const p = VOICE_PRESETS[key];
  if (!p) return;

  // Update voice
  currentVoice = p.voice;
  document.querySelectorAll('#voiceGrid .voice-chip').forEach(c => c.classList.toggle('active', c.dataset.voice === p.voice));

  // Update speed
  const speedEl = $('speed');
  speedEl.value = p.speed;
  $('speedVal').textContent = p.speed.toFixed(2) + 'x';
  updateSlider(speedEl);

  // Update DSP
  currentDSP = p.dsp;
  document.querySelectorAll('#dspStrip .voice-chip').forEach(c => c.classList.toggle('active', c.dataset.q === p.dsp));

  // Update FX
  currentFX = p.fx;
  document.querySelectorAll('#fxStrip .voice-chip').forEach(c => c.classList.toggle('active', c.dataset.fx === p.fx));

  loadStyle(p.voice);
}

// Build language grid
const langGrid = $('langGrid');
AVAILABLE_LANGS.forEach(code => {
  const chip = document.createElement('div');
  chip.className = 'lang-chip' + (code === 'en' ? ' active' : '');
  chip.dataset.lang = code;
  chip.textContent = LANG_NAMES[code] || code;
  chip.addEventListener('click', () => {
    document.querySelectorAll('.lang-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentLang = code;
    $('crumbLang').innerHTML = `Lang <b>${code.toUpperCase()}</b>`;
  });
  langGrid.appendChild(chip);
});

// Voice chips (only in voiceGrid)
document.querySelectorAll('#voiceGrid .voice-chip').forEach(chip => {
  chip.addEventListener('click', async () => {
    document.querySelectorAll('#voiceGrid .voice-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentVoice = chip.dataset.voice;
    await loadStyle(currentVoice);
  });
});

// Voice preview
const previewCache = {};
let previewAudio = null;
const PREVIEW_TEXT = 'Hello, how are you doing today?';

document.querySelectorAll('.preview-btn[data-preview]').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const voice = btn.dataset.preview;
    if (!tts) { showStatus('Models still loading…', 'error'); return; }

    if (previewAudio) { previewAudio.pause(); previewAudio = null; }
    document.querySelectorAll('.preview-btn').forEach(b => b.classList.remove('playing'));

    if (previewCache[voice]) {
      btn.classList.add('playing');
      previewAudio = new Audio(previewCache[voice]);
      previewAudio.onended = () => { btn.classList.remove('playing'); previewAudio = null; };
      previewAudio.play();
      return;
    }

    btn.classList.add('loading');
    showStatus(`Generating ${voice} preview…`);
    try {
      const style = await loadVoiceStyle([getVoiceStyleURL(voice)]);
      const { wav, duration } = await tts.call(PREVIEW_TEXT, 'en', style, 8, 1.0, 0.3);
      const wavLen = Math.floor(tts.sampleRate * duration[0]);
      const samples = new Float32Array(wav.slice(0, wavLen));
      const wavBuffer = writeWavFile(Array.from(samples), tts.sampleRate);
      const blob = new Blob([wavBuffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      previewCache[voice] = url;

      btn.classList.remove('loading');
      btn.classList.add('playing');
      previewAudio = new Audio(url);
      previewAudio.onended = () => { btn.classList.remove('playing'); previewAudio = null; };
      previewAudio.play();
      showStatus(`Voice ${voice} preview`, 'ok');
    } catch (err) {
      btn.classList.remove('loading');
      showStatus(`Preview failed: ${err.message}`, 'error');
    }
  });
});

// Preset chips
document.querySelectorAll('#presetGrid .preset-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#presetGrid .preset-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    applyPreset(chip.dataset.preset);
  });
});

// DSP chips
document.querySelectorAll('#dspStrip .voice-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#dspStrip .voice-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentDSP = chip.dataset.q;
  });
});

// FX chips
document.querySelectorAll('#fxStrip .voice-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#fxStrip .voice-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentFX = chip.dataset.fx;
  });
});

$('speed').addEventListener('input', e => {
  $('speedVal').textContent = parseFloat(e.target.value).toFixed(2) + 'x';
  updateSlider(e.target);
});
$('totalStep').addEventListener('input', e => {
  $('stepVal').textContent = e.target.value;
  updateSlider(e.target);
});
document.querySelectorAll('input[type=range]').forEach(updateSlider);

// Composer mode
let currentMode = 'single';
document.querySelectorAll('.mode-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentMode = tab.dataset.mode;
    $('scriptHint').style.display = currentMode === 'script' ? 'block' : 'none';
    $('abHint').style.display = currentMode === 'audiobook' ? 'block' : 'none';
    if (currentMode === 'script') {
      textArea.placeholder = 'M1: Hello, how are you?\nF2: I\'m doing great, thanks!\nM1: That\'s wonderful to hear.';
    } else if (currentMode === 'audiobook') {
      textArea.placeholder = 'Paste or import a long text here.\n\nEach paragraph separated by a blank line becomes a chapter.\n\nAll chapters will be generated with the selected voice and combined into one audio file.';
    } else {
      textArea.placeholder = 'Enter text to convert to speech…';
    }
  });
});

// Text import
$('importFileBtn').addEventListener('click', () => $('textFileInput').click());
$('textFileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => { textArea.value = ev.target.result; updateCounter(); showStatus(`Imported ${file.name}`, 'ok'); };
  reader.readAsText(file);
  e.target.value = '';
});
$('clearTextBtn').addEventListener('click', () => { textArea.value = ''; updateCounter(); });

// MP3 encoding
function encodeMP3(samples, sampleRate) {
  const mp3enc = new lamejs.Mp3Encoder(1, sampleRate, 128);
  const sampleBlockSize = 1152;
  const int16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  const mp3Data = [];
  for (let i = 0; i < int16.length; i += sampleBlockSize) {
    const chunk = int16.subarray(i, i + sampleBlockSize);
    const mp3buf = mp3enc.encodeBuffer(chunk);
    if (mp3buf.length > 0) mp3Data.push(mp3buf);
  }
  const end = mp3enc.flush();
  if (end.length > 0) mp3Data.push(end);
  return new Blob(mp3Data, { type: 'audio/mp3' });
}

// History
const history = JSON.parse(localStorage.getItem('st_history') || '[]');
function addToHistory(entry) {
  history.unshift(entry);
  if (history.length > 20) history.pop();
  localStorage.setItem('st_history', JSON.stringify(history.map(h => ({ text: h.text, voice: h.voice, dsp: h.dsp, fx: h.fx, dur: h.dur, elapsed: h.elapsed, ts: h.ts }))));
  renderHistory();
}
function renderHistory() {
  const list = $('historyList');
  $('historyCount').textContent = `${history.length} items`;
  if (!history.length) { list.innerHTML = '<div class="history-empty">No generations yet</div>'; return; }
  list.innerHTML = history.map((h, i) => `
    <div class="history-item" data-idx="${i}">
      <span class="h-voice">${h.voice}</span>
      <span class="h-text">${h.text.slice(0, 60)}</span>
      <span class="h-dur">${h.dur}s</span>
      <button class="h-play" title="Play">&#9654;</button>
      <button class="h-dl" title="Download">&#8615;</button>
    </div>
  `).join('');
  list.querySelectorAll('.h-play').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.closest('.history-item').dataset.idx);
      if (history[idx].url) new Audio(history[idx].url).play();
    });
  });
  list.querySelectorAll('.h-dl').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.closest('.history-item').dataset.idx);
      if (history[idx].url) {
        const a = document.createElement('a');
        a.href = history[idx].url;
        a.download = `supertonic_${history[idx].voice}_${history[idx].ts}.wav`;
        a.click();
      }
    });
  });
}
renderHistory();

// Project save/load
$('saveProjectBtn').addEventListener('click', () => {
  const project = {
    text: textArea.value, voice: currentVoice, lang: currentLang, dsp: currentDSP,
    fx: currentFX, speed: $('speed').value, steps: $('totalStep').value, mode: currentMode
  };
  localStorage.setItem('st_project', JSON.stringify(project));
  showStatus('Project saved', 'ok');
});
$('loadProjectBtn').addEventListener('click', () => {
  const saved = localStorage.getItem('st_project');
  if (!saved) { showStatus('No saved project found', 'error'); return; }
  const p = JSON.parse(saved);
  textArea.value = p.text || '';
  if (p.voice) { currentVoice = p.voice; document.querySelectorAll('#voiceGrid .voice-chip').forEach(c => c.classList.toggle('active', c.dataset.voice === p.voice)); loadStyle(p.voice); }
  if (p.lang) { currentLang = p.lang; document.querySelectorAll('.lang-chip').forEach(c => c.classList.toggle('active', c.dataset.lang === p.lang)); }
  if (p.dsp) { currentDSP = p.dsp; document.querySelectorAll('#dspStrip .voice-chip').forEach(c => c.classList.toggle('active', c.dataset.q === p.dsp)); }
  if (p.fx) { currentFX = p.fx; document.querySelectorAll('#fxStrip .voice-chip').forEach(c => c.classList.toggle('active', c.dataset.fx === p.fx)); }
  if (p.speed) { $('speed').value = p.speed; $('speedVal').textContent = parseFloat(p.speed).toFixed(2) + 'x'; updateSlider($('speed')); }
  if (p.steps) { $('totalStep').value = p.steps; $('stepVal').textContent = p.steps; updateSlider($('totalStep')); }
  if (p.mode) { currentMode = p.mode; document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === p.mode)); }
  updateCounter();
  showStatus('Project loaded', 'ok');
});

// Multi-voice script parser
function parseScript(text) {
  const regex = /\b([MF]\d)\s*:\s*/gi;
  const segments = [];
  let lastIdx = 0, lastVoice = currentVoice;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      const chunk = text.slice(lastIdx, match.index).trim();
      if (chunk) segments.push({ voice: lastVoice, text: chunk });
    }
    lastVoice = match[1].toUpperCase();
    lastIdx = regex.lastIndex;
  }
  if (lastIdx < text.length) {
    const chunk = text.slice(lastIdx).trim();
    if (chunk) segments.push({ voice: lastVoice, text: chunk });
  }
  return segments.length ? segments : [{ voice: currentVoice, text }];
}

// Audiobook chapter splitter
function splitChapters(text) {
  return text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
}

// Concatenate Float32Arrays
function concatFloat32(arrays) {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Float32Array(total);
  let offset = 0;
  for (const a of arrays) { result.set(a, offset); offset += a.length; }
  return result;
}

// Generate a single segment and return processed samples
async function generateSegment(text, voice, lang, speed, steps) {
  const style = customVoices[voice] ? loadVoiceStyleFromData(customVoices[voice]) : await loadVoiceStyle([getVoiceStyleURL(voice)]);
  const { wav, duration } = await tts.call(text, lang, style, steps, speed, 0.3);
  const wavLen = Math.floor(tts.sampleRate * duration[0]);
  const rawSamples = new Float32Array(wav.slice(0, wavLen));
  const processed = await applyDSP(rawSamples, tts.sampleRate);
  return { samples: processed.getChannelData(0), duration: duration[0] };
}

// Char counter
const textArea = $('text');
const charCounter = $('charCounter');
function updateCounter() {
  const n = textArea.value.length;
  charCounter.textContent = `${n} / 2000`;
  charCounter.className = 'char-counter' + (n > 2000 ? ' over' : n > 1200 ? ' warn' : '');
}
textArea.addEventListener('input', updateCounter);
updateCounter();

function showStatus(msg, type) {
  $('statusText').innerHTML = msg;
  $('statusBar').className = 'status-bar' + (type === 'error' ? ' error' : '');
}

async function loadStyle(voice) {
  showStatus(`Loading voice ${voice}…`);
  try {
    currentStyle = await loadVoiceStyle([getVoiceStyleURL(voice)]);
    showStatus(`Voice ${voice} ready`, 'ok');
  } catch (e) {
    showStatus(`Failed to load voice: ${e.message}`, 'error');
  }
}

// Audio post-processing (DSP + Emotion FX)
async function applyDSP(rawSamples, sampleRate) {
  const dsp = DSP_PRESETS[currentDSP] || DSP_PRESETS.polished;
  const fx = FX_PARAMS[currentFX] || FX_PARAMS.none;

  const pitchRate = Math.pow(2, fx.pitchSemis / 12);
  const outLen = Math.max(1, Math.floor(rawSamples.length / pitchRate));
  const ctx = new OfflineAudioContext(1, outLen + sampleRate, sampleRate);

  const buf = ctx.createBuffer(1, rawSamples.length, sampleRate);
  buf.getChannelData(0).set(rawSamples);

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = pitchRate;

  const gain = ctx.createGain();
  gain.gain.value = 0.72;
  src.connect(gain);
  let chain = gain;

  if (fx.eqLow) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowshelf'; f.frequency.value = 200; f.gain.value = fx.eqLow;
    chain.connect(f); chain = f;
  }
  if (fx.eqHigh) {
    const f = ctx.createBiquadFilter();
    f.type = 'highshelf'; f.frequency.value = 4000; f.gain.value = fx.eqHigh;
    chain.connect(f); chain = f;
  }
  if (dsp.deEss) {
    const f = ctx.createBiquadFilter();
    f.type = 'peaking'; f.frequency.value = 6500; f.Q.value = 4; f.gain.value = -6;
    chain.connect(f); chain = f;
  }
  if (dsp.multiband) {
    const lo = ctx.createBiquadFilter();
    lo.type = 'lowshelf'; lo.frequency.value = 120; lo.gain.value = 2;
    const hi = ctx.createBiquadFilter();
    hi.type = 'highshelf'; hi.frequency.value = 8000; hi.gain.value = 1.5;
    chain.connect(lo); lo.connect(hi); chain = hi;
  }
  if (dsp.warmth) {
    const ws = ctx.createWaveShaper();
    const curve = new Float32Array(2048);
    for (let i = 0; i < 2048; i++) {
      const x = i / 2048 * 2 - 1;
      curve[i] = 0.96 * Math.tanh(1.4 * x);
    }
    ws.curve = curve; ws.oversample = '2x';
    chain.connect(ws); chain = ws;
  }
  if (dsp.compress) {
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = -22; c.knee.value = 22; c.ratio.value = 3;
    c.attack.value = 0.005; c.release.value = 0.12;
    chain.connect(c); chain = c;
  }

  const outGain = ctx.createGain();
  outGain.gain.value = 1;
  chain.connect(outGain);
  outGain.connect(ctx.destination);
  src.start(0);

  let rendered = await ctx.startRendering();

  // Breath noise for whisper
  if (fx.breathy) {
    const ch = rendered.getChannelData(0);
    const out = new AudioBuffer({ length: ch.length, sampleRate, numberOfChannels: 1 });
    const od = out.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < ch.length; i++) {
      prev = 0.92 * prev + 0.08 * (2 * Math.random() - 1) * 0.08;
      od[i] = ch[i] + prev * 0.6;
    }
    rendered = out;
  }

  // Normalize
  if (dsp.normalize) {
    const ch = rendered.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < ch.length; i++) { const a = Math.abs(ch[i]); if (a > peak) peak = a; }
    if (peak > 1e-6) { const s = 0.97 / peak; for (let i = 0; i < ch.length; i++) ch[i] *= s; }
  }

  return rendered;
}

// Init
async function init() {
  $('goBtn').disabled = true;
  try {
    const { textToSpeech, executionProvider } = await loadTextToSpeech(
      (name, cur, total) => showStatus(`${name} (${cur}/${total})…`),
      (name, loaded, total) => {
        const mb = (loaded / 1048576).toFixed(1);
        const tmb = (total / 1048576).toFixed(0);
        showStatus(`Downloading ${name} — ${mb}/${tmb} MB`);
      }
    );
    tts = textToSpeech;

    const badge = $('runtimeBadge');
    badge.textContent = executionProvider.toUpperCase();
    badge.className = 'badge ok';
    badge.style.display = '';
    $('crumbRuntime').innerHTML = `Runtime <b>${executionProvider.toUpperCase()}</b>`;

    await loadStyle(currentVoice);
    showStatus('Ready — enter text and generate');
    $('goBtn').disabled = false;
  } catch (e) {
    showStatus(`Model load failed: ${e.message}`, 'error');
  }
}

// Show output with MP3+WAV download and add to history
function showOutput(finalSamples, totalDuration, elapsed, voiceLabel) {
  const wavBuffer = writeWavFile(Array.from(finalSamples), tts.sampleRate);
  const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
  const url = URL.createObjectURL(wavBlob);
  const audioDur = totalDuration.toFixed(2);
  const sizeKB = (wavBlob.size / 1024).toFixed(0);

  $('outputArea').innerHTML = `
    <audio controls src="${url}"></audio>
    <div class="result-stats">
      <span class="stat">Audio <b>${audioDur}s</b></span>
      <span class="stat">Generated in <b>${elapsed}s</b></span>
      <span class="stat">Size <b>${sizeKB} KB</b></span>
      <span class="stat">DSP <b>${currentDSP}</b></span>
      <span class="stat">FX <b>${currentFX}</b></span>
    </div>
    <div class="dl-row">
      <button class="dl-btn" id="dlWav">Download WAV</button>
      <button class="dl-btn" id="dlMp3">Download MP3</button>
    </div>
  `;

  $('dlWav').addEventListener('click', () => {
    const a = document.createElement('a'); a.href = url;
    a.download = `supertonic_${voiceLabel}_${currentLang}.wav`; a.click();
  });
  $('dlMp3').addEventListener('click', () => {
    showStatus('Encoding MP3…');
    const mp3Blob = encodeMP3(finalSamples, tts.sampleRate);
    const mp3Url = URL.createObjectURL(mp3Blob);
    const a = document.createElement('a'); a.href = mp3Url;
    a.download = `supertonic_${voiceLabel}_${currentLang}.mp3`; a.click();
    showStatus('MP3 downloaded', 'ok');
  });

  addToHistory({
    text: textArea.value.slice(0, 100), voice: voiceLabel, dsp: currentDSP, fx: currentFX,
    dur: audioDur, elapsed, ts: Date.now(), url
  });
}

// Generate
$('goBtn').addEventListener('click', async () => {
  const text = textArea.value.trim();
  if (!text) { showStatus('Type some text first', 'error'); return; }
  if (!tts) { showStatus('Models still loading…', 'error'); return; }

  $('goBtn').disabled = true;
  $('goBtn').classList.add('generating');
  const overlay = $('genOverlay');
  const genText = $('genText');
  if (overlay) { overlay.classList.add('show'); genText.textContent = 'Generating speech…'; }
  const bar = $('progressBar');
  const fill = $('progressFill');
  bar.classList.add('show');
  fill.style.width = '0%';
  const abProgress = $('abProgress');

  const t0 = performance.now();
  const speed = parseFloat($('speed').value);
  const steps = parseInt($('totalStep').value);

  try {
    let finalSamples, totalDuration, voiceLabel;

    if (currentMode === 'single') {
      // Single voice mode
      if (!currentStyle) { showStatus('Select a voice first', 'error'); return; }
      showStatus('Generating speech…');
      const { wav, duration } = await tts.call(text, currentLang, currentStyle, steps, speed, 0.3, (step, total) => {
        const pct = Math.round((step / total) * 100);
        fill.style.width = pct + '%';
        if (genText) genText.textContent = `Denoising ${pct}%…`;
      });
      fill.style.width = '100%';
      if (genText) genText.textContent = 'Applying DSP…';
      const wavLen = Math.floor(tts.sampleRate * duration[0]);
      const rawSamples = new Float32Array(wav.slice(0, wavLen));
      const processed = await applyDSP(rawSamples, tts.sampleRate);
      finalSamples = processed.getChannelData(0);
      totalDuration = duration[0];
      voiceLabel = currentVoice;

    } else if (currentMode === 'script') {
      // Multi-voice script mode
      const segments = parseScript(text);
      const allSamples = [];
      totalDuration = 0;
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        showStatus(`Generating segment ${i + 1}/${segments.length} (${seg.voice})…`);
        if (genText) genText.textContent = `Segment ${i + 1}/${segments.length} — ${seg.voice}`;
        fill.style.width = Math.round(((i) / segments.length) * 100) + '%';
        const result = await generateSegment(seg.text, seg.voice, currentLang, speed, steps);
        allSamples.push(result.samples);
        // Add 0.3s silence between segments
        allSamples.push(new Float32Array(Math.floor(tts.sampleRate * 0.3)));
        totalDuration += result.duration + 0.3;
      }
      fill.style.width = '100%';
      finalSamples = concatFloat32(allSamples);
      voiceLabel = 'multi';

    } else if (currentMode === 'audiobook') {
      // Audiobook mode — split by paragraphs
      const chapters = splitChapters(text);
      if (!chapters.length) { showStatus('No paragraphs found', 'error'); return; }
      if (!currentStyle) { showStatus('Select a voice first', 'error'); return; }
      abProgress.style.display = 'block';
      const allSamples = [];
      totalDuration = 0;
      for (let i = 0; i < chapters.length; i++) {
        abProgress.textContent = `Chapter ${i + 1}/${chapters.length}`;
        showStatus(`Generating chapter ${i + 1}/${chapters.length}…`);
        if (genText) genText.textContent = `Chapter ${i + 1}/${chapters.length}`;
        fill.style.width = Math.round(((i) / chapters.length) * 100) + '%';
        const result = await generateSegment(chapters[i], currentVoice, currentLang, speed, steps);
        allSamples.push(result.samples);
        // Add 1s silence between chapters
        allSamples.push(new Float32Array(Math.floor(tts.sampleRate * 1.0)));
        totalDuration += result.duration + 1.0;
      }
      fill.style.width = '100%';
      finalSamples = concatFloat32(allSamples);
      voiceLabel = `audiobook_${currentVoice}`;
      abProgress.style.display = 'none';
    }

    const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
    showOutput(finalSamples, totalDuration, elapsed, voiceLabel);
    showStatus(`Done — ${totalDuration.toFixed(2)}s audio in ${elapsed}s`);

  } catch (e) {
    showStatus(`Generation failed: ${e.message}`, 'error');
    $('outputArea').innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${e.message}</p></div>`;
  } finally {
    $('goBtn').disabled = false;
    $('goBtn').classList.remove('generating');
    if (overlay) overlay.classList.remove('show');
    if (abProgress) abProgress.style.display = 'none';
    setTimeout(() => bar.classList.remove('show'), 1500);
  }
});

// Custom voice upload
const customVoices = {};
let customVoiceCount = 0;

$('uploadVoiceBtn').addEventListener('click', () => $('voiceFileInput').click());

$('voiceFileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.name.endsWith('.json')) { showStatus('Please upload a .json voice style file', 'error'); return; }

  showStatus(`Loading custom voice: ${file.name}…`);
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    if (!json.style_ttl || !json.style_dp) { showStatus('Invalid voice style file — missing style_ttl or style_dp', 'error'); return; }

    customVoiceCount++;
    const id = `C${customVoiceCount}`;
    const label = file.name.replace(/\.json$/i, '').slice(0, 12);
    customVoices[id] = json;

    const chip = document.createElement('div');
    chip.className = 'voice-chip';
    chip.dataset.voice = id;
    chip.dataset.custom = '1';
    chip.innerHTML = `${label}<span class="gender">Custom</span><button class="preview-btn" data-preview="${id}" title="Preview voice">&#9654;</button>`;
    chip.style.paddingBottom = '22px';
    chip.style.position = 'relative';
    $('customVoiceGrid').appendChild(chip);
    $('customVoiceGrid').style.display = 'grid';
    $('noCustom').style.display = 'none';

    chip.addEventListener('click', async () => {
      document.querySelectorAll('#voiceGrid .voice-chip').forEach(c => c.classList.remove('active'));
      document.querySelectorAll('#customVoiceGrid .voice-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentVoice = id;
      currentStyle = loadVoiceStyleFromData(customVoices[id]);
      showStatus(`Custom voice "${label}" selected`, 'ok');
    });

    const previewBtn = chip.querySelector('.preview-btn');
    previewBtn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      if (!tts) { showStatus('Models still loading…', 'error'); return; }
      if (previewAudio) { previewAudio.pause(); previewAudio = null; }
      document.querySelectorAll('.preview-btn').forEach(b => b.classList.remove('playing'));

      if (previewCache[id]) {
        previewBtn.classList.add('playing');
        previewAudio = new Audio(previewCache[id]);
        previewAudio.onended = () => { previewBtn.classList.remove('playing'); previewAudio = null; };
        previewAudio.play();
        return;
      }

      previewBtn.classList.add('loading');
      showStatus(`Generating ${label} preview…`);
      try {
        const style = loadVoiceStyleFromData(customVoices[id]);
        const { wav, duration } = await tts.call(PREVIEW_TEXT, 'en', style, 8, 1.0, 0.3);
        const wavLen = Math.floor(tts.sampleRate * duration[0]);
        const samples = new Float32Array(wav.slice(0, wavLen));
        const wavBuffer = writeWavFile(Array.from(samples), tts.sampleRate);
        const blob = new Blob([wavBuffer], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        previewCache[id] = url;
        previewBtn.classList.remove('loading');
        previewBtn.classList.add('playing');
        previewAudio = new Audio(url);
        previewAudio.onended = () => { previewBtn.classList.remove('playing'); previewAudio = null; };
        previewAudio.play();
        showStatus(`Custom voice "${label}" preview`, 'ok');
      } catch (err) {
        previewBtn.classList.remove('loading');
        showStatus(`Preview failed: ${err.message}`, 'error');
      }
    });

    // Also deselect built-in voices when custom is picked
    document.querySelectorAll('#voiceGrid .voice-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentVoice = id;
    currentStyle = loadVoiceStyleFromData(json);
    showStatus(`Custom voice "${label}" loaded and selected`, 'ok');
  } catch (err) {
    showStatus(`Failed to load voice file: ${err.message}`, 'error');
  }
  e.target.value = '';
});

// Re-attach built-in voice clicks to also deselect custom voices
document.querySelectorAll('#voiceGrid .voice-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#customVoiceGrid .voice-chip').forEach(c => c.classList.remove('active'));
  });
});

window.addEventListener('load', init);
