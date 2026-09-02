import { loadTextToSpeech, loadVoiceStyle, writeWavFile, getVoiceStyleURL, AVAILABLE_LANGS } from './helper.js';

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

// Generate
$('goBtn').addEventListener('click', async () => {
  const text = textArea.value.trim();
  if (!text) { showStatus('Type some text first', 'error'); return; }
  if (!tts || !currentStyle) { showStatus('Models still loading…', 'error'); return; }

  $('goBtn').disabled = true;
  $('goBtn').classList.add('generating');
  const overlay = $('genOverlay');
  const genText = $('genText');
  if (overlay) { overlay.classList.add('show'); genText.textContent = 'Generating speech…'; }
  const bar = $('progressBar');
  const fill = $('progressFill');
  bar.classList.add('show');
  fill.style.width = '0%';

  const t0 = performance.now();
  showStatus('Generating speech…');

  try {
    const speed = parseFloat($('speed').value);
    const steps = parseInt($('totalStep').value);

    const { wav, duration } = await tts.call(text, currentLang, currentStyle, steps, speed, 0.3, (step, total) => {
      const pct = Math.round((step / total) * 100);
      fill.style.width = pct + '%';
      showStatus(`Denoising step ${step}/${total}…`);
      if (genText) genText.textContent = `Denoising ${pct}%…`;
    });

    fill.style.width = '100%';
    showStatus('Applying DSP…');
    if (genText) genText.textContent = 'Applying DSP…';

    const wavLen = Math.floor(tts.sampleRate * duration[0]);
    const rawSamples = new Float32Array(wav.slice(0, wavLen));

    // Apply DSP + FX post-processing
    const processed = await applyDSP(rawSamples, tts.sampleRate);
    const finalSamples = processed.getChannelData(0);

    const wavBuffer = writeWavFile(Array.from(finalSamples), tts.sampleRate);
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);

    const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
    const audioDur = duration[0].toFixed(2);
    const sizeKB = (blob.size / 1024).toFixed(0);

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
      </div>
    `;

    $('dlWav').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = url;
      a.download = `supertonic_${currentVoice}_${currentLang}_${currentDSP}_${currentFX}.wav`;
      a.click();
    });

    showStatus(`Done — ${audioDur}s audio in ${elapsed}s · ${currentDSP} · ${currentFX}`);

  } catch (e) {
    showStatus(`Generation failed: ${e.message}`, 'error');
    $('outputArea').innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${e.message}</p></div>`;
  } finally {
    $('goBtn').disabled = false;
    $('goBtn').classList.remove('generating');
    if (overlay) overlay.classList.remove('show');
    setTimeout(() => bar.classList.remove('show'), 1500);
  }
});

window.addEventListener('load', init);
