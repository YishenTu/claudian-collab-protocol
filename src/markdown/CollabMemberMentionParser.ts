import { maskCollabMarkdownProse } from './CollabMarkdownProse';
import type { CollabMemberId } from '../core/types';

const MENTION_PRECEDING_CHARACTER = /[\p{L}\p{N}_@-]$/u;
const MENTION_FOLLOWING_CHARACTER = /^[\p{L}\p{N}_@-]/u;

export interface CollabMemberMentionTarget {
  readonly displayName: string;
  readonly memberId: CollabMemberId;
}

interface MentionCandidate {
  readonly memberId: CollabMemberId;
  readonly name: string;
}

export function parseCollabMemberMentions(
  markdown: string,
  targets: readonly CollabMemberMentionTarget[],
): readonly CollabMemberId[] {
  const candidates = mentionCandidates(targets);
  if (candidates.length === 0) return [];
  const prose = maskCollabMarkdownProse(markdown);
  const memberIds = new Set<CollabMemberId>();
  let searchFrom = 0;
  while (searchFrom < prose.length) {
    const mentionStart = prose.indexOf('@', searchFrom);
    if (mentionStart < 0) break;
    searchFrom = mentionStart + 1;
    const preceding = prose.slice(Math.max(0, mentionStart - 2), mentionStart);
    if (MENTION_PRECEDING_CHARACTER.test(preceding)) continue;
    const candidate = candidates.find(entry => {
      if (!prose.startsWith(entry.name, mentionStart + 1)) return false;
      const followingOffset = mentionStart + entry.name.length + 1;
      const following = prose.slice(followingOffset, followingOffset + 2);
      return !MENTION_FOLLOWING_CHARACTER.test(following);
    });
    if (!candidate) continue;
    memberIds.add(candidate.memberId);
    searchFrom = mentionStart + candidate.name.length + 1;
  }
  return [...memberIds];
}

function mentionCandidates(
  targets: readonly CollabMemberMentionTarget[],
): readonly MentionCandidate[] {
  const byName = new Map<string, MentionCandidate | null>();
  for (const target of targets) {
    const name = target.displayName.trim();
    if (name.length === 0) continue;
    const existing = byName.get(name);
    if (existing === undefined) {
      byName.set(name, { memberId: target.memberId, name });
    } else if (existing?.memberId !== target.memberId) {
      byName.set(name, null);
    }
  }
  return [...byName.values()]
    .filter((candidate): candidate is MentionCandidate => candidate !== null)
    .sort((left, right) => right.name.length - left.name.length);
}
