import type { CollabMemberMentionTarget } from '../src/index';
import {
  parseCollabMemberMentions,
  parseCollabTicketReferences,
} from '../src/index';

const TARGETS: readonly CollabMemberMentionTarget[] = [
  { displayName: 'Alice', memberId: 'member-alice' },
  { displayName: 'Bob', memberId: 'member-bob' },
  { displayName: 'Carol', memberId: 'member-carol' },
  { displayName: '山田 太郎', memberId: 'member-yamada' },
  { displayName: 'Zoë', memberId: 'member-zoe' },
];

const MARKDOWN_PROSE_FIXTURES = [
  {
    markdown: [
      'Keep #1 with @Alice.',
      '',
      '    Fixes #2 with @Bob.',
      '',
      '```md',
      'Resolves #3 with @Carol.',
      '```',
      'Keep #4 with @Zoë.',
    ].join('\n'),
    mentions: ['member-alice', 'member-zoe'],
    name: 'fenced and indented code blocks',
    ticketNumbers: [1, 4],
  },
  {
    markdown: 'Keep ``code ` #2 @Bob`` and \\#3 \\@Carol; keep #4 @Alice.',
    mentions: ['member-alice'],
    name: 'inline code and escaped delimiters',
    ticketNumbers: [4],
  },
  {
    markdown: [
      '> 1. [Visible #5 @Alice](https://host/#6/@Bob)',
      '>    ```md',
      '>    #7 @Carol',
      '>    ```',
    ].join('\n'),
    mentions: ['member-alice'],
    name: 'nested Markdown structures',
    ticketNumbers: [5],
  },
  {
    markdown: [
      'Keep #8 with @Alice.',
      '```md',
      '#9 with @Bob remains inside an incomplete fence.',
    ].join('\n'),
    mentions: ['member-alice'],
    name: 'malformed or incomplete Markdown',
    ticketNumbers: [8],
  },
  {
    markdown: '关联 #10 给 @山田 太郎。\r\n\r\n    #11 @Alice\n继续 #12 @Zoë。',
    mentions: ['member-yamada', 'member-zoe'],
    name: 'Unicode with mixed CRLF and LF newlines',
    ticketNumbers: [10, 12],
  },
] as const;

describe.each(MARKDOWN_PROSE_FIXTURES)('$name', ({
  markdown,
  mentions,
  ticketNumbers,
}) => {
  it('recognizes member mentions only in prose', () => {
    expect(parseCollabMemberMentions(markdown, TARGETS)).toEqual(mentions);
  });

  it('recognizes Ticket references only in prose', () => {
    const result = parseCollabTicketReferences(markdown);

    expect(result).toEqual({
      status: 'ok',
      references: ticketNumbers.map(ticketNumber => ({
        kind: 'references',
        ticketNumber,
      })),
    });
  });
});
