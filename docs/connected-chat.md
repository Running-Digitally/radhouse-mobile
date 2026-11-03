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
