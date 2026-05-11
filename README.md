# OpenGravity

> **The zero-install agentic workspace.**

<div align="center">
  <img src="https://github.com/ab-613/OpenGravity/blob/main/assets/icon.jpeg?raw=true" alt="OpenGravity Logo" width="100">
</div>

<br>

An experimental, lightweight, BYOK (Bring Your Own Key) recreation of the Google Antigravity UI. OpenGravity provides a browser-based, reasoning-enabled IDE with a live xterm.js terminal powered by the WebContainer API. It features direct local file system sync and a proactive autonomous agent capable of orchestrating basic software engineering tasks, running shell commands, and editing files in real-time. It’s currently a work-in-progress though. It works for basic coding tasks, but consider this the "Alpha" version.

Built in pure HTML/CSS/JS for maximum speed and zero installation.

## Origin
- I was using Google Antigravity quite intensively for a load of projects I was making.
- Very quickly, I got hit with *rate limits*.
- Google Antigravity has become over the past few months quite infamous for this, and doesnt seem to be improving.
- I was thinking of switching to a CLI, or a vscode based program instead, but I really love the Antigravity UI.
- So I went to [Google AI Studio](https://ai.studio), and put in a LOAD of screenshots, and with a load of interesting prompt engineering techniques, gemini 3.1 pro put together a **beautiful** clone (if I may say so myself).
- I loved how it looked, so over a couple of days in some free time, I used it to wire together some features, like the file management and agent logic, and here we are!

## 📸 Examples

### Autonomous Web Development
The agent can proactively initialize projects, install dependencies using `pnpm`, and build complete applications while you watch.

![HTML Site Examples](https://github.com/ab-613/OpenGravity/blob/main/assets/screenshot.png?raw=true)

![HTML Site Examples](https://github.com/ab-613/OpenGravity/blob/main/assets/html%20site%20example.png?raw=true)

---

### ✨ Features
- **BYOK (Bring Your Own Key):** Total privacy. Currently **ONLY** supports Gemini API models (e.g. `gemini-3.1-pro-preview`, `gemini-3-flash-preview`, `gemini-3.1-flash-lite`, \[though to change you will need to modify `agent.js:8`\]).
- **Proactive Agentic Reasoning:** Uses advanced thinking models to plan, execute, and validate tasks without constant user intervention.
- **High-Performance Terminal:** Integrated **xterm.js** with a real Linux-like environment provided by **WebContainer API**.
- **Interactive Tooling:** The agent can execute bash commands, handle interactive terminal prompts (y/n), and manage files directly.
- **Zero Bloat:** No `npm install` for the IDE itself. Just serve and code.
- **Secure by Design:** API keys are stored only in your browser's `localStorage`.

## 🛠️ How you can help
I’m currently heads-down in my studies, so I’m handing the baton to the community. The UI looks great and the basic logic is there, but it needs "pro" features to truly beat the original.

I want people to take this and make it usable for the average person. Specifically:
- **Better Orchestration:** The current agent logic is basic; it needs better "Manager/Sub-agent" handling.
- **Provider Support:** Right now it's Gemini-only. Help me add OpenAI, Anthropic, etc...
- **Bugs:** The file sync and terminal can be finicky—it needs some "battle-hardening."
- **Polished UI:** The UI is cool, but there's a lot to be done.
- **Model Selection:** The dropdown is hardcoded. It needs to switch the model in `agent.js`.
- **Top Menu Bars:** "File," "Edit," and "Selection" menus are placeholders. Basic functionality like Save and Search is needed.
- **Git Support:** The icon is present, but there is no logic behind it yet.
- **Settings UI:** Users must click the small "a" icon in the top right to enter an API key. A proper, user-friendly settings panel is needed.


### 🚀 Getting Started
1. Serve the project root using a local server (`python3 server.py`).
2. Open `http://localhost:8000` in your browser.
3. Click the tiny "a" icon in the top-right corner (yeah, it's awkward—it's on the to-do list to fix!) and enter your Gemini API Key.
4. Start chatting with Antigravity in the right panel.

### 🛠️ Status: On Hiatus
I'm balancing this with my GCSEs, so I will be reviewing and merging PRs every Sunday evening.

### 📜 License
Licensed under **GPL-3.0**. See the LICENSE file for details on commercial use and contributions.
