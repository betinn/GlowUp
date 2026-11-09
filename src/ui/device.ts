/**
 * What kind of device the app runs on, for the one thing that depends on it: a phone is often on mobile data,
 * so only there the app says how large a download is before it starts.
 */

/** A phone, by what the browser says of itself. A tablet or a laptop with a touch screen is not one. */
export function isPhone(userAgent: string, mobileHint?: boolean): boolean {
  // Browsers that give the hint know better than their own user agent, which they have frozen.
  if (mobileHint !== undefined) return mobileHint;
  return /iPhone|iPod|Windows Phone|Android.+Mobile|Mobile.+Firefox/i.test(userAgent);
}

export function onPhone(): boolean {
  if (typeof navigator === 'undefined') return false;
  const hint = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile;
  return isPhone(navigator.userAgent, hint);
}
