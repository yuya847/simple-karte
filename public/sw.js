// Simple Karte のサービスワーカー：スマートフォンへの通知（Web Push）だけ。ページの読み込みには関わらない（fetch を扱わない）。
// The text comes from the server (counts, or with the hospital's setting a pseudonym and the value). Pressing the
// notification opens the app at the results; where it goes is fixed here, not taken from the message.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" && data.title ? data.title.slice(0, 60) : "Simple Karte";
  const body = typeof data.body === "string" && data.body ? data.body.slice(0, 300) : "新しい結果があります";
  event.waitUntil(self.registration.showNotification(title, { body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", lang: "ja", data: { open: "results" } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const here = self.location.origin;
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const tab = open.find((c) => new URL(c.url).origin === here);
      if (tab) {
        await tab.focus();
        tab.postMessage({ type: "push-open" });
        return;
      }
      await self.clients.openWindow(`${here}/?push=results`);
    })(),
  );
});
