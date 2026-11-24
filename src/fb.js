import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserPopupRedirectResolver } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { firebaseConfig } from './firebase-config.js';

export const configured = !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);
export const app = configured ? initializeApp(firebaseConfig) : null;
// 登入狀態永久保存在這台裝置（IndexedDB，不支援時改用 localStorage），關掉再開不用重新登入；按「登出」才會清除。
export const auth = app ? initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  popupRedirectResolver: browserPopupRedirectResolver
}) : null;
// 離線快取：資料存在瀏覽器 IndexedDB，沒網路也能看，恢復連線後自動同步。多個分頁共用同一份快取。
export const db = app ? initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
}) : null;
