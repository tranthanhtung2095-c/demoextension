/* Shared defaults — loaded by background.js (importScripts) and popup.html. */
/* eslint-disable no-unused-vars */
const DEMO_DEFAULTS = {
  apiKey: "",
  model: "claude-opus-5-5",
  persona: "office",
  customPersona: "",
  turns: 5,
  typingMs: 35, // milliseconds per character
  pauseMs: 1500, // pause after each answer before the next question
  autoStart: true, // start when the chat bubble is clicked open
  freshConversation: true, // press "Cuộc trò chuyện mới" before starting
};

const DEMO_MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 (mặc định)" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (nhanh hơn)" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (nhanh nhất)" },
];

const DEMO_PERSONAS = {
  office:
    "Nhân viên văn phòng 28 tuổi, không biết lập trình, hằng ngày làm báo cáo Excel và email; muốn dùng AI để làm nhanh hơn nhưng còn e ngại vì nghĩ AI khó học.",
  owner:
    "Chủ một doanh nghiệp nhỏ (khoảng 20 nhân viên) muốn tự động hóa quy trình bán hàng và chăm sóc khách hàng; quan tâm đến hiệu quả thực tế, chi phí và việc cử nhân viên đi học.",
  dev:
    "Lập trình viên backend 3 năm kinh nghiệm, muốn xây AI Agent và tích hợp Claude vào sản phẩm; hỏi sâu về kỹ thuật, dự án thực tế và mức độ nâng cao của khóa học.",
  skeptic:
    "Người kỹ tính, đã từng học vài khóa online không hiệu quả; hay hỏi vặn về học phí, cam kết đầu ra, giảng viên và chính sách hoàn tiền.",
  student:
    "Sinh viên năm cuối ngành kinh tế, muốn có kỹ năng AI để dễ xin việc; quan tâm học phí ưu đãi, lịch học buổi tối/cuối tuần và chứng chỉ.",
};

const DEMO_PERSONA_LABELS = {
  office: "Nhân viên văn phòng chưa biết code",
  owner: "Chủ doanh nghiệp nhỏ",
  dev: "Lập trình viên muốn xây Agent",
  skeptic: "Người kỹ tính, hay hỏi vặn",
  student: "Sinh viên năm cuối",
  random: "Ngẫu nhiên mỗi lần chạy",
  custom: "Tự nhập…",
};
