/* OralCompass service worker: Web Push only (api/app/notifications.py). Registered by components/notifications/RemindersPanel.tsx, not by
   main.tsx, so a browser that never turns reminders on never installs it. The notification body is FIXED and generic: the payload is never
   read for text, so no figure, name, procedure or date can leave the app through the push channel. No fetch handler: nothing is cached. */
const TITLE = "OralCompass";
const BODY = "A date you chose to follow is approaching. Open the app for details.";

self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });

self.addEventListener("push", (event) => {
  event.waitUntil(self.registration.showNotification(TITLE, { body: BODY, icon: "/art/emblem.png", badge: "/art/emblem.png", tag: "oralcompass-reminder", renotify: false }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => "focus" in c);
      return open ? open.focus() : self.clients.openWindow("/");
    }),
  );
});
