import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import App from '../App';
test('preview is explicit and the native workspace includes all five destinations', () => {
  const ui = render(<App />);
  fireEvent.press(ui.getByText('Explore the app preview'));
  expect(ui.getByText('Development preview · sample data')).toBeTruthy();
  fireEvent.changeText(
    ui.getByLabelText('Message your assistant'),
    'Keep the afternoon free.',
  );
  fireEvent.press(ui.getByText('Send sample message'));
  expect(ui.getByText('Keep the afternoon free.')).toBeTruthy();
  fireEvent.press(ui.getByRole('tab', { name: 'Library' }));
  fireEvent.press(ui.getByLabelText('Weekend reading'));
  expect(
    ui.getByText('Preview file. Your private Library stays on Radhouse.'),
  ).toBeTruthy();
  fireEvent.press(ui.getByText('Back to files'));
  fireEvent.press(ui.getByRole('tab', { name: 'Browser' }));
  fireEvent.press(ui.getByText('Preview taking control'));
  expect(ui.getByText('Private · only you can see')).toBeTruthy();
  fireEvent.press(ui.getByText('Preview Observe mode'));
  expect(ui.getByText('Observe · Nova can see, you control')).toBeTruthy();
  fireEvent.press(ui.getByText('Return control to Nova'));
  fireEvent.press(ui.getByRole('tab', { name: 'Terminal' }));
  expect(ui.getByText(/Terminal is closed/)).toBeTruthy();
  fireEvent.press(ui.getByText('Open preview terminal'));
  fireEvent(ui.getByLabelText('Include terminal context'), 'valueChange', true);
  fireEvent.press(ui.getByText('Close preview terminal'));
  expect(ui.getByLabelText('Include terminal context').props.value).toBe(false);
  fireEvent.press(ui.getByRole('tab', { name: 'Settings' }));
  fireEvent.press(ui.getByText('Preview a reply notification'));
  fireEvent.press(ui.getByLabelText('Open sample reply notification'));
  expect(ui.getByText('A little more clarity.')).toBeTruthy();
  expect(ui.getByText('Keep the afternoon free.')).toBeTruthy();
  fireEvent.press(ui.getByRole('tab', { name: 'Settings' }));
  fireEvent.press(ui.getByText('Leave preview'));
  expect(ui.getByText('Explore the app preview')).toBeTruthy();
});
