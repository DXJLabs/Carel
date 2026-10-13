# CAREL Voice Assistant — browser demo

Status: experimental voice UX. This is **not** a connection to Amazon Alexa+ or an Alexa device.

## What works

- Push-to-talk speech recognition using the browser Web Speech API; no always-on microphone.
- English and Indonesian selection. Common Indonesian verb/token phrases are translated into CAREL's existing English commands.
- The existing deterministic CAREL Agent builds and renders its normal plan preview.
- Optional browser speech synthesis reads a short summary of planned steps.
- No spoken instruction signs, submits, or authorizes transactions. Wallet approval remains separate.

## Manual verification

1. Run `npm ci`, `npx tsc --noEmit`, `npm test`, and `npm run build`.
2. Serve the app on `localhost` or HTTPS (microphone permissions commonly require a secure origin).
3. Open **Agent** and grant browser microphone permission.
4. Select **English**, press **Speak**, and say: `Swap 10 STRK for USDC and keep it private`.
5. Confirm the goal text fills in, the planner shows Swap then Shield (only on a supported chain), and the voice reply says **preview**, not **executed**.
6. Select **Indonesia** and say: `Tolong tukar 10 STRK ke USDC dan simpan hasilnya privat`. Confirm it normalizes to the same goal.
7. Check **Stop**, **Reply** toggle, browser without recognition support, denied microphone permission, and unknown commands.
8. Verify that there is no wallet popup or transaction request from pressing Speak alone.

## Limitations and privacy

- Browser recognition availability varies by browser/version and language. Chrome/Android support depends on Web Speech API availability; text input remains available as a fallback.
- Recognition may be performed by the browser vendor's remote service. Do not dictate seed phrases, private keys, access tokens, or confidential financial information.
- This is intent dictation plus spoken feedback, **not an unrestricted conversational LLM**. Multi-turn agent dialogue, service integrations and the official Alexa+ tools are out of scope.
- This implementation is a candidate for the **simulated Alexa+ web experience** track, but it is not in itself proof that all hackathon submission requirements are satisfied.
