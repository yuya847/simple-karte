// Sending one notification to a push service (web-push signs it with the VAPID keys and encrypts the text for the
// device). Tests put their own sender in, so nothing goes out.

import type { PushKeys } from "./push";

export interface Vapid {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export type PushSender = (sub: PushKeys, payload: string, opts: { urgency: "high" | "normal"; TTL: number }) => Promise<unknown>;

/** The keys from VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (null when one is missing). */
export function vapid(): Vapid | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = process.env.VAPID_SUBJECT?.trim() ?? "";
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

let replaced: PushSender | null = null;
/** For tests: send through this instead (null: web-push again). */
export const replacePushSender = (s: PushSender | null) => {
  replaced = s;
};

export async function pushSender(keys: Vapid): Promise<PushSender> {
  if (replaced) return replaced;
  const webpush = (await import("web-push")).default;
  return (sub, payload, opts) => webpush.sendNotification(sub, payload, { vapidDetails: keys, TTL: opts.TTL, urgency: opts.urgency, timeout: 10_000 });
}
