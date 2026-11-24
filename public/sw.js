// 只用來顯示系統通知與讓 App 可安裝到主畫面；不快取網頁檔案，避免更新後還看到舊版。
// 離線資料由 Firestore 的離線快取負責。
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./#alerts');
  }));
});
