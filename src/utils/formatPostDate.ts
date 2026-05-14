import { format, formatDistanceToNow, differenceInDays } from 'date-fns';

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
export function formatPostDate(input: string | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  const now = new Date();
  const days = differenceInDays(now, d);
  if (days < 7) return `${formatDistanceToNow(d)} ago`;
  if (d.getFullYear() === now.getFullYear()) return format(d, 'MMM d');
  return format(d, 'MMM d, yyyy');
}
