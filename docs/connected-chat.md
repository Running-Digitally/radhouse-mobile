# Connected chat

The authenticated `Connected` screen uses the production session client and
server-owned conversation. `src/chat/Conversation.tsx` provides the fixed
composer, search, earlier history, explicit Latest navigation, formatted replies,
quote and native Share. This does not depend on the separate sample-data preview.

Model choices come from `/chat/inference`; refresh uses `?refresh=true`. A selected
message sends `{provider, model, thinking}` in `inference`. The server owns
capability validation and provider credentials. Never put an OpenAI API key in a
mobile environment file or bundle. The shared setup and reasoning contract are
in the [server model guide](https://github.com/Running-Digitally/radhouse/blob/main/docs/openai-models.md).

The composer freezes request ID, text and inference together before sending.
An uncertain result exposes an explicit retry with the same payload. A selected
model disappearing from discovery blocks new sends until the owner chooses an
available model or Default. Default remains usable during discovery failure.
Polls merge with earlier loaded history instead of replacing it. A failed refresh
does not replace the selected model. Logout clears private screen state.

Drafts and selected settings survive navigation within the connected workspace
and foreground transitions. They are held in memory, not saved across force quit.
Search only covers loaded exchanges. Native formatting supports paragraphs,
headings, lists, bold, inline/fenced code and HTTP(S) links; it does not render
HTML or load remote images. Quote adds up to 1,200 characters to the draft;
sharing uses the original answer text and the native share sheet.

The keyboard-aware app container is retained; the transcript scrolls separately
from the composer, and workspace tabs hide while typing. Model/thinking remain
visible above the keyboard. The model picker announces selected radio state,
and the composer button announces the current choice.

The [shared usability audit](https://github.com/Running-Digitally/radhouse/blob/main/docs/research/2026-11-02-connected-chat-audit.md)
records external research, findings, checks and release acceptance limits.
`npm run quality` covers connected-screen behavior and the authenticated wire
contract. Native builds and an isolated iOS simulator harness using the actual
Connected screen were checked with synthetic data. Physical-device Android
keyboard behavior, large text and screen-reader task completion remain release
acceptance checks. These source changes do not constitute an app-store release.

## Selected commitment research

Responsibilities exposes public-web research separately on each confirmed
commitment with ongoing follow-up. It starts off. Enabling it requires a public
question and explains that only that question goes to Keenable; saved quotes,
progress, browser logins and other chats are not sent as search terms. The server
collects at most two public pages before its existing private, tool-free review.
The shared engineering contract is the
[browser and public-research plan](https://github.com/Running-Digitally/radhouse/blob/main/docs/plans/2026-11-03-browser-and-public-research.md).

The UI shows limited or unavailable coverage, retrieval time and source citations
with exact excerpts. Source links open only after an owner tap. Text is rendered
in native components, never interpreted as HTML or instructions. Stop public
research works while all reviews are paused; editing or stopping sends the current
commitment revision so a stale screen cannot overwrite a newer decision.

Existing follow-up actions and older servers remain supported. Research does not
change notification consent, daily budgets or quiet hours, mark work complete,
send messages to other people or perform external actions. Unit and web fixtures
do not replace the required native simulator and physical owner-release checks.

The foreground Browser viewer permits its silent live video to start after the
owner opens the browser. Requiring a second native WebView playback gesture
prevented iOS worker-generated video tracks from loading their first frame;
the simulator reproduced zero video width and then presented live frames after
this correction. Terminal retains its previous playback requirement. This does
not change authentication, HTTPS-only navigation, file access, popups, browser
ownership, Private/Observe grants, or foreground-only mounting. Inspection and
diagnostic scripts are absent from the shipping viewer. The library maps this
setting to WKWebView's media playback policy; see its
[API reference](https://github.com/react-native-webview/react-native-webview/blob/master/docs/Reference.md#mediaplaybackrequiresuseraction).

## Browser keyboard acceptance

A native toolbar tap is outside the streamed viewer's WebView. A successful
JavaScript `focus()` or command-dispatch test does not prove that the phone's
software keyboard opened. The keyboard candidate transfers iOS native focus and
allows programmatic keyboard display on this canvas. Android resolves the exact
WebView from its admitted native event, invokes the existing guarded keyboard
command, then requests the local input method only after the viewer's existing
input-assist field is focused. It accepts no text, URLs or scripts from callers.
The private-control lease, ready/full presentation checks and stream input path
remain authoritative. Preview and foreign viewers cannot acquire input through
this native helper.

Before accepting a keyboard change on either platform:

1. Enable the simulator's software keyboard and prove a normal native text field
   can display it. Hardware-keyboard injection alone is insufficient evidence.
2. Open Browser and take private control. Tap **Keyboard before touching the
   streamed page**. Capture the actual visible keyboard.
3. Tap the streamed address field and use software keys to enter a synthetic
   public address. Submit it and verify the destination, not merely typed text.
4. Dismiss and reopen the keyboard three times. Test after a fresh viewer mount,
   and after returning from another native screen.
5. Return to the agent with the keyboard open. Verify it closes, the mini preview
   resumes, and an unsent synthetic chat draft remains exactly unchanged. Check
   that private content remains absent from other clients' previews.

Record device/OS, source revision, screenshots and release status separately.
Manually toggling the simulator keyboard or touching the WebView before the
toolbar test must not be counted as a first-tap pass. The keyboard candidate
passed these focused simulator checks on both platforms on 5 November 2026,
including actual software-key address entry, repeated opening, private-preview
concealment and draft preservation. On Android the owner dismisses the keyboard
before tapping the bottom handback control; leaving Browser for Chat also clears
input. Physical owner-device acceptance remains separate from simulator proof.

Reference: [Android input-method visibility](https://developer.android.com/develop/ui/views/touch-and-input/keyboard-input/visibility).
