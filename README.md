# BumTeacherBypass

Tired of being handed non-editable PDF worksheets? This repo contains interactive HTML versions that auto-save your answers locally. Your data stays on your machine — no cloud, no accounts.

## Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Docker Compose)
- [Git](https://git-scm.com/downloads)

## Setup (first time)

```bash
git clone <repo-url>
cd BumTeacherBypass
docker compose up -d
```

Open [http://localhost:3847](http://localhost:3847) in your browser.

## Update (get new worksheets)

```bash
cd BumTeacherBypass
git pull
docker compose up -d --build
```

Your saved answers are preserved across updates.

## Stop / Start

```bash
# Stop
docker compose down

# Start again
docker compose up -d
```

## How it works

- Navigate: **Lehrjahr → Semester → Modul → Thema → Arbeitsblatt**
- Fill in the fields — your answers auto-save as you type
- Use **Hinweis** buttons for hints and **Prüfen** buttons to check your answers (where available)
- Use **Als PDF exportieren** to download a filled-in PDF of any worksheet
- All data is stored locally in a small database on your machine

## Troubleshooting

| Problem | Fix |
|---|---|
| Port 3847 already in use | Stop whatever else uses that port, or change the port in `docker-compose.yml` |
| Saved answers disappeared | Your Docker volume was removed. Answers from localStorage will still be there. |
| Container won't start | Run `docker compose down -v && docker compose up -d --build` (this resets saved data) |
| Permission errors on Linux | Make sure your user is in the `docker` group: `sudo usermod -aG docker $USER` then log out and back in |
