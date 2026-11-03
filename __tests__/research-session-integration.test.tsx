import React from 'react';
import { fireEvent, renderAsync, waitFor } from '@testing-library/react-native';
import { encodeBase64, decodeUTF8 } from 'tweetnacl-util';
import { SessionClient } from '../src/auth/client';
import { AUDIENCE, ISSUER, ORIGIN } from '../src/auth/transfer';
import { SessionIO } from '../src/auth/types';
import { Commitments } from '../src/components/Commitments';

test('research controls reach the real authenticated client and reload the saved decision', async () => {
  const now = 1800000000000;
  const access = `header.${encodeBase64(decodeUTF8(JSON.stringify({
    iss: ISSUER, aud: [AUDIENCE], exp: now / 1000 + 7200,
  })))}.signature`;
  const local = 'L'.repeat(43), csrf = 'c'.repeat(64);
  const id = '58e8f3dd-cd82-48a4-9df9-63c3a15b310f';
  const path = '/chat/responsibilities/commitments';
  const followup = {
    state: 'active', revision: 4, next_review_at: now / 1000 + 3600,
    last_review_at: null, progress: '', latest_note: null,
    research: { enabled: false, question: '', coverage: null },
  };
  const saved: unknown[] = [];
  const io: SessionIO = {
    request: async (url, method, sentAccess, sentLocal, sentCsrf, body) => {
      expect(sentAccess).toBe(access);
      expect(sentLocal).toBe(local);
      let result: object;
      if (url === ORIGIN + '/auth/session') {
        result = {username: 'synthetic-owner', csrf_token: csrf, features: {}};
      } else {
        if (method === 'POST') {
          expect(url).toBe(ORIGIN + path + '/' + id);
          expect(sentCsrf).toBe(csrf);
          const action = JSON.parse(body);
          expect(action.action).toBe('research');
          expect(action.revision).toBe(followup.revision);
          saved.push(action);
          followup.revision++;
          followup.research = {enabled: Boolean(action.question), question: action.question, coverage: null};
        } else expect(url).toBe(ORIGIN + path);
        result = {
          active: true, scope: {followups_supported: true}, coverage: null,
          suggestions: [{id, source_request_id: id, title: 'Prepare a clear draft',
            quote: 'I will prepare the draft.', reason: 'Confirmed intention.',
            preparation: '', state: 'confirmed', followup}],
        };
      }
      return {status: 200, contentType: 'application/json', body: JSON.stringify(result), serviceKey: '', sessionToken: ''};
    },
    load: async () => JSON.stringify({access, local}),
    save: jest.fn(), clear: jest.fn(), syncCookies: jest.fn(), clearCookies: jest.fn(),
    randomBytes: async () => encodeBase64(new Uint8Array(32)),
    openBrowser: jest.fn(), now: () => now, pause: jest.fn(),
  };
  const client = new SessionClient(io);
  expect(await client.restore()).not.toBeNull();
  const ui = await renderAsync(<Commitments client={client} focusId={id} onClose={jest.fn()} onSource={jest.fn()} />);
  await waitFor(() => expect(ui.getByText('Enable public research')).toBeTruthy());
  const question = 'What helps a clear technical draft?';
  fireEvent.changeText(ui.getByLabelText('Public research question'), question);
  fireEvent.press(ui.getByText('Enable public research'));
  await waitFor(() => expect(ui.getByText('Stop public research')).toBeTruthy());
  expect(saved).toEqual([{action: 'research', revision: 4, question}]);
  fireEvent.press(ui.getByText('Stop public research'));
  await waitFor(() => expect(ui.getByText('Enable public research')).toBeTruthy());
  expect(saved).toEqual([{action: 'research', revision: 4, question}, {action: 'research', revision: 5, question: ''}]);
  expect(ui.queryByText('The change could not be saved. Please reconnect and try again.')).toBeNull();
});
