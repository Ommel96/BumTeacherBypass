# BumTeacherBypass

Upload PDF and Word files and convert them into organized, editable pages using AI.

## Features

- **Upload** PDF and DOCX files
- **Multi-Provider AI** — OpenAI, Anthropic, Ollama, or any OpenAI-compatible API
- **Settings Page** — configure provider, API key, base URL, and model in the UI
- **AI Processing** — converts document content into structured, editable HTML pages
- **Edit** pages directly in the browser with contentEditable
- **Auto-save** — edits are saved automatically
- **Regenerate** — re-process any page with AI if needed
- **Built-in Worksheets** — interactive HTML worksheets for IT apprentices (Lehrjahr 1-4)
- **Docker** — runs in a container with SQLite for persistence

## Requirements

- [Docker](https://www.docker.com/products/docker-desktop/)
- An AI provider (at least one of):
  - **OpenAI** — [API key](https://platform.openai.com/api-keys)
  - **Anthropic** — [API key](https://console.anthropic.com/)
  - **Ollama** — [install locally](https://ollama.ai/) (no key needed)
  - **OpenAI-Compatible** — LM Studio, vLLM, LiteLLM, etc.

## Quick Start

```bash
# Clone the repo
git clone <repo-url>
cd BumTeacherBypass

# Start
docker compose up -d --build
```

Open [http://localhost:3847](http://localhost:3847) in your browser.

1. Go to **Settings** and configure your AI provider
2. Click **Upload** to upload a PDF or Word file
3. AI processes the document into editable pages
4. Click on pages to view and edit them

## AI Provider Setup

| Provider | API Key | Base URL | Models |
|---|---|---|---|
| **OpenAI** | Required | `https://api.openai.com/v1` | gpt-4o-mini, gpt-4o, gpt-4-turbo |
| **Anthropic** | Required | `https://api.anthropic.com/v1` | claude-sonnet-4, claude-3.5-sonnet, claude-3-haiku |
| **Ollama** | Not needed | `http://host.docker.internal:11434` (in Docker) | llama3.2, mistral, qwen2.5, etc. |
| **OpenAI-Compatible** | Optional | Your server URL | Any model your server provides |

### Using Ollama with Docker

1. Install and start [Ollama](https://ollama.ai/) on your host machine
2. Pull a model: `ollama pull llama3.2`
3. In Settings, set Base URL to `http://host.docker.internal:11434`
4. Select your model and save

### Using LM Studio / vLLM / etc.

1. Start your server with OpenAI-compatible API enabled
2. In Settings, select "OpenAI-Compatible" provider
3. Set the Base URL to your server's endpoint (e.g. `http://host.docker.internal:8080/v1`)
4. Enter the model name and save

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3847` | Server port |
| `OPENAI_API_KEY` | — | OpenAI API key (optional, can set in Settings UI) |
| `ANTHROPIC_API_KEY` | — | Anthropic API key (optional, can set in Settings UI) |

## Built-in Worksheets

Navigate to **Worksheets** in the top nav to access existing interactive worksheets for:
- **Modul 114** — Codierung, Zahlensysteme, Bitoperatoren, Binäre Interpretationen, Zweierkomplement
- **Modul 164** — Assoziationen (UN/NN), Vertiefungsfragen

These worksheets use auto-save to persist your answers.

## Troubleshooting

| Problem | Fix |
|---|---|
| Port 3847 in use | Change `PORT` in `.env` and `docker-compose.yml` |
| Processing takes long | Normal for large documents; each page requires an API call |
| "API key required" error | Configure a provider in Settings |
| Ollama not reachable from Docker | Use `http://host.docker.internal:11434` as Base URL |
| Container won't start | `docker compose down -v && docker compose up -d --build` |