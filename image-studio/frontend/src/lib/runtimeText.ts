const RUNTIME_MOJIBAKE_REPLACEMENTS: Array<[string, string]> = [
  ["绛夊緟涓婃父杩斿洖", "等待上游返回"],
  ["鍥剧墖姝ｅ湪鐢熸垚", "图片正在生成"],
  ["宸叉敹鍒板浘鐗囨暟鎹墖娈", "已收到图片数据片段"],
  ["鏀跺埌鎺ュ彛淇濇椿淇″彿", "收到接口保活信号"],
  ["璇锋眰宸插垱寤", "请求已创建"],
  ["妯″瀷澶勭悊涓", "模型处理中"],
  ["鍥剧墖宸ュ叿宸插惎鍔", "图片工具已启动"],
  ["鍥剧墖鐢熸垚瀹屾垚,姝ｅ湪淇濆瓨", "图片生成完成,正在保存"],
  ["鎺ュ彛宸插畬鎴", "接口已完成"],
  ["鎺ュ彛浜嬩欢", "接口事件"],
  ["鍥剧墖宸ュ叿鐘舵", "图片工具状态"],
  ["鎺掗槦涓", "排队中"],
  ["澶勭悊涓", "处理中"],
  ["姝ｅ湪璇锋眰", "正在请求"],
  ["宸插彇娑", "已取消"],
  ["鍚姩涓", "启动中"],
  ["瓒呮椂澶辫触", "超时失败"],
  ["鍚姩澶辫触", "启动失败"],
  ["宸插畬鎴", "已完成"],
  ["澶辫触", "失败"],
  ["涓婃父杩斿洖", "上游返回"],
  ["鎺ュ彛杩斿洖閿欒", "接口返回错误"],
  ["鎺ュ彛杩斿洖娑堟伅", "接口返回消息"],
  ["鎺ュ彛杩斿洖涓虹┖", "接口返回为空"],
  ["涓婃父鏈嶅姟瓒呮椂", "上游服务超时"],
  ["澶氬浘缂栬緫鍥為€€锛氫笂娓告殏鏃朵笉绋冲畾锛屾敼鐢ㄥ弬鑰冩嫾鍥惧吋瀹规ā寮忛噸璇", "多图编辑回退：上游暂时不稳定，改用参考拼图兼容模式重试"],
  ["FHL 璐﹀彿姹犳殏鏃剁箒蹇欙紝宸茶嚜鍔ㄩ噸璇曪紱浠嶅け璐ヨ绋嶅悗閲嶈瘯", "FHL 账号池暂时繁忙，已自动重试；仍失败请稍后重试"],
];

const RUNTIME_MOJIBAKE_GLYPH_RE = /[闂缂鍊鎼磹閹礁纾崐佽柟婵鐎鏌绱顫顦顭宕鍨璇鐢姝澶鍐瑙]/g;

export function normalizeRuntimeText(value: unknown): string {
  let text = String(value ?? "").trim();
  if (!text) return "";
  for (const [bad, good] of RUNTIME_MOJIBAKE_REPLACEMENTS) {
    text = text.split(bad).join(good);
  }
  return text;
}

export function looksLikeRuntimeMojibake(value: unknown): boolean {
  const text = String(value ?? "").trim();
  if (!text) return false;
  const matches = text.match(RUNTIME_MOJIBAKE_GLYPH_RE);
  if (!matches) return false;
  return matches.length >= Math.max(4, Math.floor(text.length * 0.18));
}

export function sanitizeRuntimeText(value: unknown, fallback = ""): string {
  const text = normalizeRuntimeText(value);
  return looksLikeRuntimeMojibake(text) ? fallback : text;
}
