import { getAI, getGenerativeModel, GoogleAIBackend, ResponseModality } from 'firebase/ai';
import { app } from './fb.js';

// 目前的 AI 設定，由 main.js 依使用者設定更新
export const AI = { provider: 'gemini', model: 'gemini-2.5-flash', chibi: 'svg', imageModel: 'gemini-2.5-flash-image' };
let inst = null;
const ai = () => (inst ||= getAI(app, { backend: new GoogleAIBackend() }));
export const aiOn = () => !!app && AI.provider === 'gemini';

function toPart(blob){
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res({ inlineData: { data: String(r.result).split(',')[1], mimeType: blob.type || 'image/jpeg' } });
    r.onerror = rej; r.readAsDataURL(blob);
  });
}
async function parts(prompt, images){ return [prompt, ...(await Promise.all((images || []).map(toPart)))]; }

export async function askText(prompt, images){
  const m = getGenerativeModel(ai(), { model: AI.model });
  const r = await m.generateContent(await parts(prompt, images));
  return r.response.text();
}
export async function askJSON(prompt, images){
  const m = getGenerativeModel(ai(), { model: AI.model, generationConfig: { responseMimeType: 'application/json' } });
  const r = await m.generateContent(await parts(prompt, images));
  return parseJSON(r.response.text());
}
export async function genImage(prompt, images){
  const m = getGenerativeModel(ai(), { model: AI.imageModel, generationConfig: { responseModalities: [ResponseModality.TEXT, ResponseModality.IMAGE] } });
  const r = await m.generateContent(await parts(prompt, images));
  const p = (r.response.inlineDataParts && r.response.inlineDataParts() || [])[0];
  if (!p) throw new Error('no_image');
  return `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`;
}
function parseJSON(t){
  try { return JSON.parse(t); } catch {}
  const f = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (f) { try { return JSON.parse(f[1]); } catch {} }
  const i = [t.indexOf('{'), t.indexOf('[')].filter(x => x >= 0); const j = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (i.length && j > Math.min(...i)) return JSON.parse(t.slice(Math.min(...i), j + 1));
  throw new Error('invalid_json');
}
export function aiErrText(e){
  const s = String((e && (e.code || '') + ' ' + (e.message || '')) || e);
  if (/api-not-enabled|firebasevertexai|firebaseml|AI Logic|has not been used|is disabled/i.test(s)) return 'Firebase 專案還沒啟用 AI Logic（Gemini Developer API），請到 Firebase 主控台開啟。';
  if (/quota|429|RESOURCE_EXHAUSTED|rate/i.test(s)) return 'AI 使用量超過額度，請稍後再試，或到設定換一個模型。';
  if (/billing|paid|free tier/i.test(s)) return '這個 AI 功能需要付費方案，可到設定改用免費的方式。';
  if (/not found|404|unsupported model|is not supported/i.test(s)) return '找不到這個 AI 模型，請到設定換一個模型。';
  if (/no_image/.test(s)) return '模型沒有回傳圖片，請到設定改用「AI 畫 SVG」。';
  if (/network|offline|Failed to fetch/i.test(s)) return '目前沒有網路，AI 功能需要連線。';
  return 'AI 這次沒有成功，請再試一次。';
}
