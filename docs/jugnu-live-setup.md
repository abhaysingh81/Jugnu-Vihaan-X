# Jugnu live setup

## Local preview

Start Flask and Next.js from their respective directories. Use the ports configured in `frontend/.env.local`. Create an account at `/login` and set the four-digit SOS passcode during signup. Accounts, hashed passcodes, emergency contacts, public community reports and signed-in incident records persist in the Flask database. Video capture is opt-in and saves locally in the browser.

Routes use the Google Maps JavaScript Routes library. Nearby help uses Places API (New) with the backend key and the user's location or search area. Weather comes from OpenWeather when configured or from the live Open-Meteo endpoint.

For route advice, area advice and voice requests, set `JUGNU_AI_PROVIDER=omniroute` in `backend/.env`. Start the local OmniRoute gateway on port 20128, set `OMNIROUTE_BASE_URL=http://127.0.0.1:20128/v1`, and set `OMNIROUTE_API_KEY` to the gateway key. The earlier setup used `OMNIROUTE_MODEL=groq/openai/gpt-oss-20b,groq/openai/gpt-oss-120b`. Jugnu tries the models in that order when a request fails or returns invalid JSON. Configure Groq in OmniRoute and restart Flask after updating the environment.

To select Gemini, set `JUGNU_AI_PROVIDER=gemini` and `GEMINI_API_KEY`. Its default model is `gemini-3.5-flash-lite`. A Gemini project using prepay needs available API credits. [Gemini API billing](https://ai.google.dev/gemini-api/docs/billing#prepay)

For the DTU demo, set `JUGNU_DEMO_EMAIL` to the existing demo account and `JUGNU_DEMO_CONTACT` to the same E.164 number saved in its trusted contacts. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_VOICE_FROM` to enable the real contact call. Set `TWILIO_VOICE_MODE=trial` to use Twilio’s hosted template on a restricted trial account. Twilio requires a non-Indian caller ID for calls to India. Enable India in Voice Geographic Permissions and verify the destination if required by your account. Manual SOS and sound detection both request the call as soon as the incident syncs. The SOS screen shows the provider’s call status and a simulated police call. [Twilio India guidelines](https://www.twilio.com/en-us/guidelines/in/voice) · [Trial voice templates](https://www.twilio.com/docs/usage/trials/try-out-voice)

Deploy the current Maritime agent code for the two-frame demo assessment and connect a vision model in Prune. Only timely, clearly benign results can close a pending demo alert. A dark, missing, or inconclusive view and a provider outage keep the eight-second countdown running. Closing the alert leaves an already submitted Twilio call with the provider.

## Sponsor credentials

| Setting | Where it belongs | What it is |
| --- | --- | --- |
| `MARITIME_API_KEY` | Flask environment | Key from the Maritime account that owns the agent. The REST endpoint must be able to invoke agent chat. |
| `MARITIME_AGENT_ID` | Flask environment | ID of the private custom agent deployed from `backend/maritime-agent`. |
| `PRUNE_API_KEY` | Maritime agent secret | App key issued in Prune. |
| `PRUNE_MODEL` | Maritime agent environment | An image-capable model verified through the configured Prune account. Defaults to `gpt-4o`. |
| `JUGNU_AGENT_TOKEN` | Flask and Maritime agent secrets | The same independently generated random token in both services. |
| Upstream model key | Prune provider vault | The provider that serves the configured model, such as OpenAI. |

Deploy `backend/maritime-agent` as a private custom agent. For a Maritime ZIP build, include only `Dockerfile` and `agent.py` at the root of the archive. Set `PRUNE_API_KEY` and `JUGNU_AGENT_TOKEN` as encrypted environment variables and set `PRUNE_MODEL` to the configured vision model. The server reads the injected `PORT`. Copy the new agent ID into the Flask environment and restart Flask.

Check the provider key in Prune under **Connect → Providers**. For the default model, use an OpenAI project API key with access to `gpt-4o`. Then open a signed-in incident and choose **AI assessment**. You can share one selected JPEG frame or request an assessment based on the trigger alone. Verify the vision response and the Prune request under feature `jugnu-incident-assessment`.

[Maritime CLI and keys](https://maritime.sh/docs/cli) · [Custom agent contract](https://maritime.sh/docs/frameworks/custom) · [Prune dashboard](https://app.withprune.com/) · [Prune setup](https://www.withprune.com/docs)

## SMS and emergency calling

Put `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_MESSAGING_SERVICE_SID` in the Flask environment. Configure a Messaging Service that can deliver to your intended country. From a signed-in active incident, the user can confirm that their contacts agreed to receive SMS, choose whether to include their last known location, and submit the message. Jugnu records provider submission separately from delivery. The operator should run a live test with an approved recipient before relying on it.

The current emergency calling action opens the device dialer. Automatic emergency service calling requires a supported arrangement for the intended region. Durable unattended dispatch, delivery receipts, cloud evidence backup, and institution sharing are pending.

[Twilio Messages API](https://www.twilio.com/docs/messaging/api/message-resource) · [Twilio India messaging guidelines](https://www.twilio.com/en-us/guidelines/in/sms) · [Emergency calling support](https://www.twilio.com/docs/voice/tutorials/emergency-calling-for-programmable-voice)

## Public hosting

Set `JUGNU_SITE_ORIGIN` to the deployed HTTPS origin and set `JUGNU_SECURE_COOKIES=1` on Flask. Point `JUGNU_BACKEND_URL` to the private Flask service. Configure the reverse proxy to replace client-address headers. Restrict the browser Maps key to the deployment origin and the backend key to its server restrictions. Mount a persistent writable database directory, or configure a managed database using `DATABASE_URL` and install its Python driver. Configure volume backups and a same-origin Next.js gateway. Public hosting and an authorized project/domain remain to be provisioned.

## Audio detector

Deployment uses the pretrained YAMNet model locally in the browser. The known Deeply SLR99 clip benchmark is documented in [the hackathon build notes](jugnu-hackathon-build.md). It does not establish gender-specific detection or field reliability. NIGENS and Deeply SLR99 are published with noncommercial, no-derivatives terms, and TAU-NIGENS 2020 and 2021 are published with noncommercial terms. The AudioSet download contains labels and extracted features, and its scream class does not provide a women-only target. MIVIA provides a separate access process. The production build does not include a newly trained classifier or ship any of those datasets.

[Deeply SLR99](https://openslr.org/99/) · [NIGENS](https://zenodo.org/records/2535878) · [TAU-NIGENS 2020](https://zenodo.org/records/3870859) · [TAU-NIGENS 2021](https://zenodo.org/records/4844825) · [MIVIA](https://mivia.unisa.it/datasets/audio-analysis/mivia-audio-events/) · [AudioSet downloads](https://research.google.com/audioset/download.html)
