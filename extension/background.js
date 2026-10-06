/* =========================================================
   Service worker: turns the chat transcript into the next
   question by calling the DeepSeek chat completions API.
   Without an API key it falls back to a built-in question bank,
   so the demo still runs offline.
   ========================================================= */
importScripts("defaults.js");

const API_URL = "https://api.deepseek.com/chat/completions";
const REQUEST_TIMEOUT_MS = 60000;

const OFFLINE_QUESTIONS = [
  "Khóa học này gồm những nội dung gì vậy?",
  "Mình không biết lập trình thì có theo kịp không?",
  "Học xong mình làm được những dự án gì cụ thể?",
  "Khóa có học online không, hay phải đến lớp?",
  "Lịch khai giảng gần nhất là khi nào?",
  "Học phí bao nhiêu và có ưu đãi gì không?",
  "Claude khác gì ChatGPT, sao nên học Claude?",
  "Doanh nghiệp đăng ký cho nhiều nhân viên thì sao?",
  "Học xong có chứng chỉ không?",
  "Nếu bận bỏ lỡ buổi học thì có xem lại được không?",
  "Giảng viên là ai, có kinh nghiệm thực tế không?",
  "Mình muốn đăng ký tư vấn thì làm thế nào?",
];

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "generate-question") return false;
  generateQuestion(msg)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
  return true; // keep the channel open for the async reply
});

async function generateQuestion({ history = [], pageContext = "", persona = "", turn = 1, total = 5 }) {
  const settings = { ...DEMO_DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEMO_DEFAULTS))) };
  // A model saved by an older version (e.g. a Claude model) falls back to the default.
  if (!DEMO_MODELS.some((m) => m.id === settings.model)) settings.model = DEMO_DEFAULTS.model;
  if (!settings.deepseekKey.trim()) {
    return { question: offlineQuestion(history), source: "offline" };
  }
  const question = await askDeepSeek(settings, { history, pageContext, persona, turn, total });
  return { question, source: settings.model };
}

function offlineQuestion(history) {
  const asked = new Set(history.filter((m) => m.role === "user").map((m) => m.text.trim()));
  const left = OFFLINE_QUESTIONS.filter((q) => !asked.has(q));
  const pool = left.length ? left : OFFLINE_QUESTIONS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function buildPrompt({ history, pageContext, persona, turn, total }) {
  const system = [
    "Bạn đang đóng vai một người dùng thật đang nhắn tin với chatbot tư vấn trên landing page khóa học AI của Học viện Công nghệ MCI.",
    "Mục đích: buổi trình diễn cho học viên thấy chatbot của trang trả lời các câu hỏi như thế nào.",
    `Vai của bạn: ${persona}`,
    "",
    "Nhiệm vụ: viết DUY NHẤT tin nhắn tiếp theo mà người này sẽ gõ vào ô chat.",
    "Quy tắc:",
    "- Tiếng Việt tự nhiên, giọng nhắn tin đời thường, đúng với vai.",
    "- Chỉ một câu hỏi, tối đa 35 từ.",
    "- Bám vào câu trả lời gần nhất của chatbot: hỏi sâu thêm, hỏi lại chỗ chưa rõ, hoặc chuyển sang chủ đề mới chưa được hỏi.",
    "- Không lặp lại câu đã hỏi. Không chào lại sau tin nhắn đầu tiên.",
    "- Chỉ hỏi những gì một khách hàng thật quan tâm (nội dung, lộ trình, dự án, hình thức học, lịch, học phí, đăng ký...).",
    "- Ở câu cuối cùng, hãy hỏi về bước tiếp theo để đăng ký hoặc nhận tư vấn.",
    "Chỉ trả về nội dung tin nhắn, không ngoặc kép, không tiền tố, không giải thích.",
  ].join("\n");

  const transcript = history.length
    ? history.map((m) => `${m.role === "user" ? "Bạn" : "Chatbot"}: ${m.text}`).join("\n\n")
    : "(chưa có tin nhắn nào)";

  const user = [
    "<noi_dung_landing_page>",
    pageContext || "(không đọc được)",
    "</noi_dung_landing_page>",
    "",
    "<cuoc_tro_chuyen>",
    transcript,
    "</cuoc_tro_chuyen>",
    "",
    `Đây là tin nhắn thứ ${turn}/${total}${turn === total ? " (câu cuối cùng)" : ""}. Viết tin nhắn tiếp theo của bạn.`,
  ].join("\n");

  return { system, user };
}

async function askDeepSeek(settings, args) {
  const { system, user } = buildPrompt(args);
  const { model } = settings;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    // OpenAI-compatible chat completions endpoint.
    res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.deepseekKey.trim()}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: model === "deepseek-reasoner" ? 4000 : 200,
        temperature: 0.9, // some variety between demo runs (ignored by deepseek-reasoner)
        stream: false,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(err.name === "AbortError" ? "DeepSeek phản hồi quá lâu, thử lại nhé." : `Không gọi được DeepSeek API: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.error?.message || `HTTP ${res.status}`;
    if (res.status === 401) throw new Error("DeepSeek API key không hợp lệ. Kiểm tra lại trong cửa sổ cài đặt của extension.");
    if (res.status === 402) throw new Error("Tài khoản DeepSeek đã hết số dư, hãy nạp thêm.");
    if (res.status === 429) throw new Error("DeepSeek đang giới hạn tần suất, đợi một chút rồi chạy lại.");
    throw new Error(`DeepSeek API lỗi: ${detail}`);
  }

  const question = cleanQuestion(data?.choices?.[0]?.message?.content || "");
  if (!question) throw new Error("DeepSeek không trả về câu hỏi nào.");
  return question;
}

function cleanQuestion(text) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)[0]
    ?.replace(/^["“'«]+|["”'»]+$/g, "")
    .replace(/^(bạn|tin nhắn|câu hỏi)\s*:\s*/i, "")
    .replace(/^["“'«]+|["”'»]+$/g, "")
    .trim()
    .slice(0, 900); // the landing page accepts up to 1000 characters
}
