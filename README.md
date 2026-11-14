# Jugnu

**A personal safety companion for women on the move.**

Built for **Vihaan X** by team **404 Name Not Found**.

Jugnu is a mobile-first web app for planning a walk, finding nearby help, and starting a safety session. It puts directions, trusted contacts, and SOS actions in one place. The dark interface was designed for phones and adapts to larger screens.

## What the current build does

| Feature | What you can do |
| --- | --- |
| **Accounts and safety setup** | Sign up, edit your profile, manage trusted contacts, and create or change a four-digit SOS passcode. The database stores contact details and incident history by account. Passwords and passcodes are hashed. |
| **Live walking routes** | Use Google Maps to find a destination, get walking directions, and request route advice from OmniRoute. The advice is informational. Street lighting and personal safety are unverified. |
| **Nearby help and weather** | Find police stations and hospitals from Google Places using your location or a searched area. Open directions in Google Maps and see live Delhi weather on the home screen. |
| **Safety sessions and SOS** | Arm the microphone while the page is open. Manual SOS opens immediately. A possible scream starts an eight-second countdown with an option to get help sooner. Choose an audible or silent alert and use your passcode to silence the alarm or mark yourself safe. |
| **Location and evidence** | Attach and share your last known location. Opt in to a short camera recording during an alert and review, export, or delete it on the same device. A missing or obstructed camera view leaves SOS available. |
| **Help and community** | Use spoken or typed queries for routes and nearby help. Post a safety issue to the community feed. The feed contains user-submitted reports. |
| **Trusted-contact SMS** | From a signed-in active SOS, confirm recipient consent and submit an SMS through Twilio when configured. Jugnu shows provider acceptance separately from confirmed delivery. |

## How the safety flow works

```text
Manual SOS ──────────────────────────────────────────────► Active SOS
Foreground microphone → YAMNet → Possible scream → 8 s ─► Active SOS
                                                            │
                         ┌──────────────────────────────────┼─────────────────────┐
                         ▼                                  ▼                     ▼
                  Dialer and contacts                Incident record       Optional local clip
                                                           │                       │
                                                           └──── optional frame ───┘
                                                                     ▼
                                                          Maritime → Prune → AI advice
```

Microphone classification runs in the browser with MediaPipe and YAMNet. Audio stays on the device during monitoring. Competing laughter, music, and cheering scores help filter weak detections. The model classifies scream-like sounds without identifying the speaker's gender. In a small speaker-held-out Deeply SLR99 benchmark, it triggered on **9 of 10 female-labeled screams**, **2 of 3 male-labeled screams**, and **1 of 5 laughter clips**. These results describe the test clips. The web app needs microphone permission and an open, awake page to monitor sound.

Jugnu's **Call 112** action opens the device dialer in India. Automatic calls to emergency services, unattended SMS, cloud evidence backup, and institutional evidence sharing are pending. [India's Emergency Response Support System](https://www.mha.gov.in/emergency-response-support-system-erss) · [Deeply SLR99 dataset](https://openslr.org/99/)

## Maritime and Prune

Maritime runs a private Python agent for optional incident assessments. The user can choose to share one camera frame, or request advice based on the incident trigger. The agent sends the request through Prune to a configured model and returns an advisory summary. A missing frame, blocked request, or provider outage leaves the SOS flow independent.

The Flask-to-agent-to-Prune request path was tested with mocked upstream services. A live assessment requires a deployed Maritime agent, a Maritime API key, a Prune app key, and a vision-capable provider configured in Prune. The live OmniRoute text path has been verified separately for route advice and voice commands. [Maritime custom agents](https://maritime.sh/docs/frameworks/custom) · [Prune gateway setup](https://www.withprune.com/docs)

## Tech stack

**Web** · Next.js, React, TypeScript, Tailwind CSS, Web Audio, MediaRecorder, IndexedDB

**Backend** · Python, Flask, SQLAlchemy, SQLite

**Services** · Google Maps Routes and Places, Open-Meteo or OpenWeather, OmniRoute, Maritime, Prune, optional Twilio SMS

## Run the app from the source checkout

This repository contains the project README. The commands below use a Jugnu source checkout with both `frontend/` and `backend/` directories. Use Node.js 20 or later and Python 3.12.

1. Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env.local`. Keep real credentials in those local files.
2. Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` for Maps JavaScript, Routes, Places and Geocoding, and `GOOGLE_MAPS_SERVER_API_KEY` for server-side Nearby Search. Set the OmniRoute base URL, API key and model in the backend for text AI.
3. Start the backend on port 8000.

   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate          # PowerShell uses .\venv\Scripts\Activate.ps1
   python -m pip install -r requirements.txt
   python -m flask --app run run --host 127.0.0.1 --port 8000
   ```

4. In a second terminal, start the frontend and open [localhost:3000](http://localhost:3000).

   ```bash
   cd frontend
   npm ci --legacy-peer-deps
   npm run dev
   ```

5. Create an account at `/login`, choose a passcode, and add a trusted contact. Try **Routes → Start monitoring** to open a safety session. Use the incident screen to inspect the record without placing an emergency call.

Camera, microphone and location permissions require localhost or HTTPS. Sponsor assessment and provider SMS need their own credentials. Public hosting is pending.
