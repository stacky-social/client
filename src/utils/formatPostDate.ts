import { format, formatDistanceToNow, differenceInDays } from 'date-fns';
import { parsePostDate } from './postDate.mjs';

/**
 * Hybrid date formatter for post cards.
 *
 * - < 7 days ago  → relative "3 hours ago"
 * - same year     → "May 13"
 * - older         → "Jul 29, 2024"
 *
 * Replaces bare `formatDistanceToNow(new Date(x)) + ' ago'` calls that showed
 * "almost 2 years ago" for all archived posts, and replaces hard-coded
 * `format(date, "MMM d, yyyy")` calls that lost relative recency info.
 */
export function formatPostDate(input: string | number | Date): string {
  const d = parsePostDate(input);
  if (!d) return 'Date unavailable';
  const now = new Date();
  const days = differenceInDays(now, d);
  // Future or clock-skewed dates: avoid "in about 3 hours ago".
  if (days < 0) return 'just now';
  if (days < 7) return formatDistanceToNow(d, { addSuffix: true });
  if (d.getFullYear() === now.getFullYear()) return format(d, 'MMM d');
  return format(d, 'MMM d, yyyy');
}
