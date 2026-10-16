# CAREL Agent compact voice experience

The Agent goal composer now contains an orange microphone action. Tap it to
open an on-demand, dark voice sheet. There is no always-visible Voice card.

The sheet attempts push-to-talk recognition, shows recognized text, allows
editing that text in the goal field, controls read-aloud replies and holds the
searchable 17-language selector. Closing the sheet stops recognition and speech
synthesis. Microphone permission is still controlled by Android Chrome;
client-side UI changes cannot override a denied permission.

The Agent summary is rendered from actual planner stages, without invented
exchange rates, fees or transfer estimates. The route-specific execution
components remain responsible for their real quote and wallet confirmation.
Recent goals are in-memory for the current page session only, not persisted.

## Validation before merging

```bash
npx tsc --noEmit
npm test
```

Then deploy through Vercel rather than running a Termux production build.
Verify Chrome Android at a narrow viewport: mic inside goal composer, listening
sheet above navigation, permission-denied state, Close/Escape behavior, language
search, recognized transcript, plan stages and review links.

---

# CAREL Voice — multilingual browser input

This is an experimental browser-language selector, not an Alexa+ integration or a general translation model.

## Language choices (17)

English (US), Indonesia, Malay, Spanish, French, German, Portuguese (Brazil), Italian, Dutch, Vietnamese, Turkish, Japanese, Korean, Mandarin Chinese, Hindi, Arabic and Thai.

Recognition availability depends on the Chrome/Android speech recognition implementation. Not every locale or speech-synthesis voice is available on every device. Browser permission, HTTPS and network conditions still matter.

## Command understanding

- English: current CAREL structured Agent commands.
- Indonesian: current limited deterministic verbs and privacy phrase normalization.
- Malay, Spanish, French, German, Portuguese, Italian, Dutch and Vietnamese: tested **basic Swap** wording only, e.g. `Cambiar 10 STRK por USDC` or `Échanger 10 STRK contre USDC`; this is not full linguistic translation and does not support arbitrary multi-turn conversation.
- Turkish, Japanese, Korean, Mandarin Chinese, Hindi, Arabic and Thai: speech **dictation only**. Users must edit the recognized text into an English command before CAREL can plan.

For non-Indonesian selections, preview feedback is spoken in **English** at this stage. Indonesian feedback is spoken in Indonesian. This avoids pretending a full multilingual reply translation exists.

The UI shows an honest per-language support hint. It never submits or signs transactions. The wallet continues to require explicit approval.

## Validation

On Termux, run:

```bash
npx tsc --noEmit
npm test
```

In Chrome Android over HTTPS, test the searchable dark picker, native spelling display, selection, unsupported locale errors and at least a Malay/Spanish example. Check the voice reply and verify that opening the picker no longer triggers the Android native white select dialog.
