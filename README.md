<div align="center">

# 🎙️ Supertonic Voice Studio

### Free, browser-based voice studio — no API keys, no servers, no sign-up

**Generate natural speech in 31 languages, clone any voice, and apply cinematic audio effects — all running 100% in your browser.**

[![Live Demo](https://img.shields.io/badge/🔗_Live_Demo-Try_Now-2563FF?style=for-the-badge)](https://codekinstech.github.io/supertonic-voice-studio/)
[![Open In Colab](https://img.shields.io/badge/🧬_Voice_Cloning-Open_in_Colab-F9AB00?style=for-the-badge)](https://colab.research.google.com/github/CodekinsTech/supertonic-voice-studio/blob/main/voice_cloner.ipynb)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
[![Stars](https://img.shields.io/github/stars/CodekinsTech/supertonic-voice-studio?style=for-the-badge&color=yellow)](https://github.com/CodekinsTech/supertonic-voice-studio/stargazers)

<br/>

**ElevenLabs charges $5-22/mo. We do it for free. In your browser. No account needed.**

<br/>

</div>

---

## ✨ What Makes This Different

| | Supertonic Voice Studio | ElevenLabs | Google TTS | Amazon Polly |
|---|---|---|---|---|
| **Price** | Free forever | $5-22/mo | Pay per char | Pay per char |
| **Privacy** | 100% local — nothing leaves your browser | Cloud-based | Cloud-based | Cloud-based |
| **Sign-up required** | No | Yes | Yes | Yes |
| **API key needed** | No | Yes | Yes | Yes |
| **Voice cloning** | Yes (free via Colab) | Yes (paid) | No | No |
| **Languages** | 31 | 29 | 40+ | 30+ |
| **Emotion effects** | 10 built-in | Limited | No | No |
| **Audio post-processing** | Full DSP pipeline | Basic | No | No |
| **Works offline** | Yes (after first load) | No | No | No |
| **Open source** | Yes | No | No | No |

---

## 🚀 Features

### 🎤 Two TTS Engines

- **Supertonic** — 31-language, 10 voices (M1-M5, F1-F5), powered by Supertonic 3 ONNX models via WebGPU/WASM
- **Kokoro** — Ultra-natural English TTS with 80+ voices, powered by Kokoro.js

### 🧬 Voice Cloning (Free)

Clone any voice from a 5-30 second recording — no GPU required on your end. Our Google Colab notebook handles the training on free cloud GPUs.

**How it works:**
1. Open the Colab notebook (one click from the app)
2. Upload a voice recording
3. Train (~10-20 min on free GPU)
4. Download `.json` voice file
5. Upload it in Supertonic → use your cloned voice instantly

### 🎭 20 Voice Presets

Ready-to-use character voices: Narrator, Villain, Storyteller, Commander, Mystic, Child, Dramatic, Soothing, and more — each a tuned combo of voice + speed + emotion + DSP.

### 🎨 Emotion FX Engine

Apply real-time emotion effects to any voice:

| Effect | What it does |
|---|---|
| Happy | Brighter tone, lifted pitch |
| Sad | Lower pitch, softer highs |
| Angry | Sharp presence, boosted highs |
| Whisper | Breathiness + low-cut |
| Hero | Deep, authoritative tone |
| Cartoon | High pitch, playful |
| Cinematic | Deep, dramatic, movie-trailer feel |
| Calm | Gentle, lowered energy |

### 🎛️ Professional DSP Pipeline

4-tier audio post-processing built in:

- **Raw** — No processing, pure model output
- **Polished** — De-essing + compression + normalization
- **Premium** — Polished + warmth (tube saturation) + multiband EQ
- **Pro Pack** — Full pipeline with all effects maximized

### 🌍 31 Languages

English, Korean, Japanese, Arabic, Hindi, French, German, Spanish, Portuguese, Italian, Russian, Chinese, Dutch, Polish, Turkish, Ukrainian, Vietnamese, and more.

### 🔊 Voice Preview

Hear any voice before generating — click the play button on any voice chip to instantly preview how it sounds.

---

## 🖥️ Quick Start

### Option 1: Use the live demo (recommended)
Visit the **[Live Demo](https://codekinstech.github.io/supertonic-voice-studio/)** — works instantly, no install needed.

### Option 2: Run locally

```bash
git clone https://github.com/CodekinsTech/supertonic-voice-studio.git
cd supertonic-voice-studio
npm install
npm run dev
```

Open `http://localhost:3000` — that's it.

### Option 3: Clone a voice

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/CodekinsTech/supertonic-voice-studio/blob/main/voice_cloner.ipynb)

---

## 📱 Mobile Support

Works on mobile browsers too, though Supertonic downloads ~350MB of AI models on first use. Kokoro is lighter and loads faster on mobile. For best results, use a desktop browser with stable Wi-Fi.

---

## 🏗️ Tech Stack

- **Frontend:** Vanilla HTML/CSS/JS — zero framework overhead
- **TTS Engine:** ONNX Runtime Web (WebGPU with WASM fallback)
- **Kokoro Engine:** kokoro-js with Q8 ONNX model
- **Audio Processing:** Web Audio API (OfflineAudioContext)
- **Voice Cloning:** PyTorch + SpeechBrain (via Google Colab)
- **Build:** Vite
- **Models:** HuggingFace (Supertone/supertonic-3)
- **Mobile:** Capacitor-ready (Android/iOS)

---

## 📂 Project Structure

```
supertonic-studio/
├── index.html              # Main app with Kokoro/Supertonic tabs
├── supertonic.html         # Supertonic Voice Studio page
├── main.js                 # Supertonic app logic + DSP + presets
├── helper.js               # ONNX model loading + voice style utils
├── vite.config.js          # Multi-page Vite build config
├── voice_cloner.ipynb      # Google Colab voice cloning notebook
├── public/
│   └── kokoro/
│       └── index.html      # Kokoro Voice Studio page
└── package.json
```

---

## 🤝 Contributing

We welcome contributions! Here's how:

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Ideas for contributions

- [ ] Audiobook mode (paste a book, assign voices to characters, batch generate)
- [ ] More TTS engines (Piper, Sherpa-ONNX)
- [ ] Voice style marketplace (share cloned voices)
- [ ] Real-time streaming TTS
- [ ] SSML support
- [ ] Browser extension for reading web pages aloud
- [ ] PWA with full offline support

---

## 📄 License

MIT License — use it however you want, commercially or personally.

---

## ⚠️ Disclaimer

This tool is for legitimate use only. By using voice cloning features, you agree not to clone voices without the speaker's consent. You are solely responsible for how you use generated audio. Do not use this tool to create deepfakes, impersonate others, or produce misleading content.

---

## ⭐ Star History

If this project saved you from paying for ElevenLabs, give it a star!

[![Star History Chart](https://api.star-history.com/svg?repos=CodekinsTech/supertonic-voice-studio&type=Date)](https://star-history.com/#CodekinsTech/supertonic-voice-studio&Date)

---

<div align="center">

**Built with ❤️ by [CodekinsTech](https://github.com/CodekinsTech)**

**[⭐ Star this repo](https://github.com/CodekinsTech/supertonic-voice-studio)** if you find it useful — it helps others discover it!

</div>
