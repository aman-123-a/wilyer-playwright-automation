# Android player testing

The CMS is one half of the product. The other half is an Android player on a
screen somewhere, and until a suite drives that too, every CMS test ends at
"the server accepted it" — which is not what the customer sees.

This layer covers the device half and joins the two.

## What it is made of

| Path                              | Purpose                                                     |
| --------------------------------- | ----------------------------------------------------------- |
| `config/android.ts`               | Typed `ANDROID` config. Nothing reads `process.env` directly |
| `helpers/android/adb.ts`          | Shell-level device access — playback, storage, logs, memory  |
| `helpers/android/AppiumDriver.ts` | W3C WebDriver client for screens that have a real UI         |
| `helpers/android/device.ts`       | `requireDevice()` / `requireDisruptive()` skip gates         |
| `pages/android/PlayerPage.ts`     | The player as a page object, backed by both                  |
| `fixtures/android-fixtures.ts`    | `adb`, `appium`, `player` — extends the CMS fixtures         |
| `tests/_core/player/`             | The suites                                                   |

No new npm dependency. Appium speaks plain HTTP+JSON, so the client is built on
Playwright's own `APIRequestContext` rather than pulling webdriverio in beside
it — one HTTP stack, one runner, one set of types.

## adb or Appium?

This is the decision the layer is designed around, and getting it wrong is what
makes device suites slow and flaky.

**adb** for playback, cached content, crashes, memory, reboot recovery. A
signage player renders a full-screen surface with no queryable widgets, so
Appium has nothing to assert on there — and adb keeps answering while the app
is mid-crash, which is exactly when a test most needs to look.

**Appium** for pairing, settings and configuration — screens with real views.

Run `npm run player:discovery` on a new build to find out which you are dealing
with: it dumps the hierarchy and reports how many nodes are actually
addressable. Zero clickables is a finding, not a failure.

## Setup

```bash
# 1. adb reachable
adb devices                     # USB
adb connect 192.168.1.50:5555   # or a networked box

# 2. Appium — only for the UI suites
npm i -g appium
appium driver install uiautomator2
appium                          # listens on 127.0.0.1:4723

# 3. point the suite at the device (in your gitignored .env)
ANDROID_APP_PACKAGE=com.example.player
ANDROID_DEVICE_UDID=<serial from `adb devices`>
```

Leave `ANDROID_APP_PACKAGE` blank and every player suite skips with a reason, so
a CMS run on a laptop with no hardware stays green. See `.env.example` for the
full set.

Two settings are worth confirming early, because without them playback and the
end-to-end join cannot be asserted at all:

- `ANDROID_NOW_PLAYING_PATTERN` — a regex with one capture group matched against
  logcat. There is no way to ask a video surface what it is showing; this
  depends on the app logging it.
- `ANDROID_TEST_PLAYLIST` / `ANDROID_TEST_MEDIA` — which CMS playlist is
  assigned to this specific screen. It cannot be inferred from the device.

## Running

```bash
npm run player            # everything, one worker
npm run player:smoke      # health only — run this first
npm run player:discovery  # what does the UI actually expose
npm run player:soak       # needs ANDROID_SOAK_MINUTES
npm run devices           # adb devices -l
```

One physical screen means one worker: the `player` scripts set `--workers=1`,
and running the `android` project by hand without it will interleave a reboot
from one file into another file's assertions.

## Suites

- **functional/player-health** — installed, running, owns the foreground, has
  content cached, has disk headroom, no crashes. Everything else is ambiguous
  until this is green.
- **functional/player-ui-surface** — Appium discovery, plus kiosk behaviour
  (backgrounding, the Back button must not drop to the launcher).
- **e2e/cms-to-player** — the assertion the product is judged on: content in the
  CMS reaches the panel, inside an SLA. Reports the **latency**, which regresses
  long before delivery outright breaks.
- **resilience/offline-recovery** — WiFi cut, reconnect, force-stop, reboot.
  These are what actually take screens down in the field, and none of them are
  visible from the CMS.
- **resilience/playback-soak** — hours of continuous playback watching for
  memory growth and quiet death. Players are never restarted in production, so
  only elapsed time finds these.

## Disruptive tests

Cutting WiFi, force-stopping the app and rebooting are harmless on a lab box and
unacceptable on a screen in a lobby. They need `ANDROID_ALLOW_DISRUPTIVE=true`
and are forced off on the production environment regardless of what is set.

## Known gaps

- The selectors in `pages/android/PlayerPage.ts` ship **unconfirmed**. Run
  `npm run player:discovery` against the real build and correct them —
  `tests/_core/player/functional/player-ui-surface.spec.ts` audits them and
  attaches the result to the report.
- Assigning a playlist to a screen is still a manual CMS step for the
  end-to-end suite. Automating it needs the rollout API confirmed first.
- Playback assertions depend on the app emitting a now-playing log line. If it
  does not, that is a request for the app team, not something the suite can work
  around.
