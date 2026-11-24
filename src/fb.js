import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { firebaseConfig } from './firebase-config.js';

export const configured = !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);
export const app = configured ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
// 離線快取：資料存在瀏覽器 IndexedDB，沒網路也能看，恢復連線後自動同步。多個分頁共用同一份快取。
export const db = app ? initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
}) : null;
