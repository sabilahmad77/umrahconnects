# Screen-reader session — what was attempted, what ran, what it showed

VoiceOver cannot be scripted from this session (driving it needs the AppleScript
accessibility permission, a system setting this work must not change), so the
screen-reader obligation of W31 was met with **Orca 43.1 on Linux in Docker**,
driven by real X keyboard events and recorded from Orca's own speech log.

## The lab

| Piece | Detail |
|---|---|
| Image | `uc-a11-orca-lab:local` — `debian:bookworm-slim` + Xvfb, openbox, at-spi2-core, Orca 43.1, Firefox ESR 140.16, speech-dispatcher + espeak-ng, xdotool, xclip, socat (`tools/orca-lab/Dockerfile*`) |
| Container | `uc-a11-orca-run`, created and removed by `tools/orca-lab/run.sh` for every run (no bind mounts: the lab and the identity go in with `docker cp`, the outputs come out the same way) |
| Reaching the app | `socat TCP-LISTEN:3411 → host.docker.internal:3411`, so Firefox uses `http://localhost:3411`, the origin the web app and the API are configured for |
| Driving | `tools/orca-lab/driver.py` — `xdotool key`/`type` only; it reads Orca's `SPEECH OUTPUT` lines as they are written and moves on when it hears the element it is looking for, exactly as a listening user would |
| Credentials | read from the QA fixture file inside the container, pasted from the clipboard (never typed, so no key echo and no keystroke log can hold them); after each run the host scrubs every output file for the password |

Three obstacles had to be solved before Orca said anything useful, and they are
recorded here because they are the reason a first attempt looks like a failure:

1. **Orca blocked after its first two utterances.** speech-dispatcher had no
   audio plugin (`Opening audio failed: Couldn't open pulse plugin`) and the
   SSIP call never returned. Fixed by installing `speech-dispatcher-audio-plugins`
   and pointing speech-dispatcher at a null ALSA sink — the speech pipeline then
   runs for real, it simply plays into nothing.
2. **Orca writes its debug file block-buffered**, so speech could not be read
   while the session ran. The launcher is copied with `open(..., buffering=1)`.
3. **Typed characters were being eaten as browse-mode quick keys** (`e`, `l`,
   `t` … are structural navigation in Orca), which sent the first run wandering
   through the public site. Everything is pasted instead.

## Journeys and what Orca said (full text: `run-after/orca-speech.log`)

| Journey | Orca's own words |
|---|---|
| Sign in, wrong password first | `Email address entry required.` → `Password password text.` → `Sign in push button.` → **`Unable to continue.` `Invalid credentials.`** and focus back on `Sign in push button` |
| Sign in, correct password | `main content` → `Sign in push button` → **`My Travel Plan \| Umrah Connect`** (the client-side route announcement) |
| Skip link | `Ctrl+Home` then the first stop: **`Skip to content.`** |
| Navigate to a list | `My Requests link` → Enter → **`My Marketplace Requests \| Umrah Connect`**, then `h` → `Marketplace requests heading level 1`, `l` → `List with 1 item …` |
| Open a dialog | `New request push button` → Enter → `Hotel room toggle button pressed` (focus inside the dialog; Orca's log shows the container as `[dialog | What do you need?]`) |
| Submit the form empty | **`Describe what you need in the title.`** — the `role="alert"` is announced without moving focus |
| Close the dialog | Tab stays inside (`Service type panel. Hotel room toggle button pressed`), Escape → **`main content \| New request push button`** |
| Account menu | Enter → **`expanded … menu … Profile`** |

## What this session showed that the automated tools did not

* **Focus was lost after a failed submit.** Orca announced the error and then
  `Umrah Connect document web` — the busy submit button had been disabled, so
  the browser dropped focus to the document. Fixed in `components/ui/system.tsx`;
  the run above now ends on `Sign in push button`.
* **The account menu was silent.** With Radix's modal menu the whole workspace
  was marked `aria-hidden` while the menu was open; Orca tracked the focus change
  as a "zombie" replacement and said nothing at all. With `modal={false}` Orca
  announces `menu … Profile`. (This is the same defect axe reports as
  `aria-hidden-focus`.)

## Honest limits of this session

* Orca 43 + Firefox 140 stay **silent while arrowing between the items** of the
  account menu (the menu opens and is announced; `Down` moves focus but is not
  spoken). Orca's log shows the link-based items being removed and re-added on
  every move, which is why it treats them as replacements. Not reproduced or
  ruled out on NVDA/JAWS/VoiceOver — those were not available here.
* Firefox announces a required empty field as `invalid entry` on first focus
  (native constraint validation). This is browser behaviour on `required`, not
  an authored error state.
* Orca announced the dialog's focused control but not the dialog's own name on
  opening; the name is exposed (`[dialog | What do you need?]` in Orca's log)
  and axe confirms `dialog-has-accessible-name`.
* One run is not a substitute for a human screen-reader user. What is claimed
  here is exactly what the transcript shows: the journeys are operable and the
  key announcements happen.
