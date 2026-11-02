export const destinations = [
  'Chat',
  'Library',
  'Browser',
  'Terminal',
  'Settings',
] as const;
export type Destination = (typeof destinations)[number];
export type BrowserMode = 'agent' | 'private' | 'observe';
export interface Turn {
  id: string;
  question: string;
  answer: string;
}
export const sampleTurns: readonly Turn[] = [
  {
    id: '58e8f3dd-cd82-48a4-9df9-63c3a15b310f',
    question: 'Help me make space for a calmer week.',
    answer:
      'Let’s start with one small decision. What would you most like to protect time for this week?',
  },
];
export const sampleFiles = [
  {
    id: 'notes',
    name: 'A few things worth keeping',
    kind: 'Note',
    detail: 'A sample note for your Library.',
  },
  {
    id: 'reading',
    name: 'Weekend reading',
    kind: 'Document',
    detail: 'Sample document · 3 pages',
  },
] as const;
export function viewerURL(
  origin: string,
  destination: 'Browser' | 'Terminal',
): string {
  const url = new URL(origin);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('An exact HTTPS application origin is required');
  }
  return `${url.origin}/${destination.toLowerCase()}`;
}
export function viewerNavigationAllowed(
  candidate: string,
  origin: string,
): boolean {
  try {
    const url = new URL(candidate);
    return (
      url.origin === new URL(origin).origin &&
      url.protocol === 'https:' &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
