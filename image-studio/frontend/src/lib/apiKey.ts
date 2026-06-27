const API_KEY_ASSIGNMENT_RE = /^\s*(?:OPENAI_API_KEY|IMAGE_STUDIO_API_KEY|GPTCODEX_API_KEY|APIMART_API_KEY)\s*=\s*([^\r\n]+)\s*$/i;
const API_KEY_TOKEN_RE = /\bsk-[A-Za-z0-9._-]{8,}\b/;
const WRAPPING_QUOTES_RE = /^["'`\u201C\u201D\u2018\u2019\u300C\u300D\uFF02\uFF07]+|["'`\u201C\u201D\u2018\u2019\u300C\u300D\uFF02\uFF07]+$/g;
const HEADER_SAFE_TOKEN_RE = /^[\x21-\x7e]+$/;

export function normalizeAPIKeyInput(value: string): string {
  let next = String(value ?? "").replace(/^\uFEFF/, "").trim();
  const assignment = next.match(API_KEY_ASSIGNMENT_RE);
  if (assignment?.[1]) next = assignment[1].trim();
  next = next.replace(WRAPPING_QUOTES_RE, "").trim();
  next = next.replace(/^Bearer\s+/i, "").trim();

  const token = next.match(API_KEY_TOKEN_RE)?.[0];
  if (token && token === next) return token;
  return next;
}

export function validateAPIKeyForHeader(value: string): string {
  const key = normalizeAPIKeyInput(value);
  if (!key) throw new Error("API Key 不能为空");
  if (!HEADER_SAFE_TOKEN_RE.test(key)) {
    throw new Error("API Key 含有中文、空格或全角字符。请只粘贴 sk-... 或 msk-... 密钥本身，不要粘贴说明文字、示例或换行。");
  }
  return key;
}