import React from 'react';
import { renderAsync } from '@testing-library/react-native';
import { inlineSpans, Reply, replyBlocks } from '../src/chat/Reply';

test('incomplete or malformed markup stays literal and does not become an unsafe link', async () => {
  for (const text of [
    '**',
    '****',
    '`',
    '``',
    '[',
    '[]',
    '[label](http://)',
    '[label](https://)',
    '[label](https://bad url)',
    '[label](javascript:alert(1))',
    '**unfinished\nnext line',
    '[unfinished\nnext line',
  ]) {
    expect(inlineSpans(text).every(span => span.kind === 'plain')).toBe(true);
    expect(
      inlineSpans(text)
        .map(span => span.text)
        .join(''),
    ).toBe(text);
  }
  const ui = await renderAsync(
    <Reply text="[label](http://) [unsafe](javascript:alert(1))" />,
  );
  expect(ui.queryAllByRole('link')).toHaveLength(0);
});

test('pathological unfinished text is processed promptly without rescanning nested openers', () => {
  const inputs = [
    '['.repeat(250000),
    '[label](https://' + '['.repeat(250000),
    '**' + 'a'.repeat(250000),
    '`' + 'a'.repeat(250000),
    '[unclosed label '.repeat(20000),
  ];
  const started = Date.now();
  for (const text of inputs) {
    expect(inlineSpans(text)).toEqual([{ id: 'plain:0', kind: 'plain', text }]);
  }
  // Deliberately generous for slower CI machines; the former unanchored regex
  // revisited every '[' suffix and takes seconds on just one of these inputs.
  expect(Date.now() - started).toBeLessThan(2000);
});

test('source anchored span identities survive append streaming and repeated content', () => {
  const prefix = '**same** **same** `code` [Source](http://example.com)';
  const before = inlineSpans(prefix).filter(span => span.kind !== 'plain');
  const after = inlineSpans(prefix + ' and **more**').filter(
    span => span.kind !== 'plain',
  );
  expect(after.slice(0, before.length)).toEqual(before);
  expect(new Set(before.map(span => span.id)).size).toBe(before.length);
  expect(before.map(span => span.kind)).toEqual([
    'bold',
    'bold',
    'code',
    'link',
  ]);
  expect(before[3].url).toBe('http://example.com');

  const blocks = replyBlocks('Same\n\nSame\n\n```\nstream');
  const appended = replyBlocks('Same\n\nSame\n\n```\nstreamed\n```\n\nNext');
  expect(appended.slice(0, blocks.length).map(block => block.id)).toEqual(
    blocks.map(block => block.id),
  );
  expect(new Set(blocks.map(block => block.id)).size).toBe(blocks.length);
  expect(appended[2].text).toBe('streamed');
});
