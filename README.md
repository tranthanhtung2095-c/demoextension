# MCI Chat Demo — AI tự đặt câu hỏi

Chrome extension dùng để **trình diễn cho học viên khóa Claude**: khi bấm nút chat trên
[landing page MCI](https://landing-page-mci-demo-production.up.railway.app/#curriculum), AI
(DeepSeek) đóng vai một học viên tiềm năng, **tự sinh câu hỏi, tự gõ vào ô chat và gửi đi**, rồi chờ trợ lý AI
của landing page trả lời. Câu hỏi sau dựa trên câu trả lời trước, nên cuộc trò chuyện diễn ra tự nhiên.

```
Bấm nút chat ─▶ content.js đọc hội thoại + nội dung trang
                   │
                   ▼
             background.js ──POST /chat/completions──▶ DeepSeek API  (sinh câu hỏi tiếp theo)
                   │
                   ▼
   gõ từng ký tự vào ô chat ─▶ gửi ─▶ landing page /api/chat trả lời ─▶ lặp lại
```

## Cài đặt (chế độ nhà phát triển)

1. Tải repo này về máy (hoặc `git clone`).
2. Mở Chrome, vào `chrome://extensions`, bật **Developer mode** (góc phải trên).
3. Bấm **Load unpacked** và chọn thư mục `extension/`.
4. Ghim icon MCI lên thanh công cụ để mở nhanh cửa sổ cài đặt.

## Sử dụng

1. Bấm icon extension, dán **DeepSeek API key** (lấy ở <https://platform.deepseek.com/api_keys>).
   - Để trống key thì extension dùng **bộ câu hỏi soạn sẵn**, vẫn trình diễn được khi không gọi được DeepSeek.
   - Bấm **Thử sinh 1 câu hỏi** để kiểm tra key.
2. Mở landing page, bấm **nút chat tròn màu cam** ở góc phải dưới.
3. AI bắt đầu hỏi. Thanh trạng thái màu đen ở đầu trang cho biết đang ở câu mấy, đang gõ hay đang chờ trả lời.
4. Muốn dừng: bấm **Dừng** trên thanh trạng thái, đóng khung chat, hoặc bấm **■ Dừng** trong cửa sổ extension.

Nếu tắt "Tự chạy khi bấm nút chat", bạn có thể bắt đầu bằng nút **▶ Chạy demo** trong cửa sổ extension.

### Tùy chọn

| Tùy chọn | Mặc định | Ghi chú |
| --- | --- | --- |
| Model | `deepseek-chat` | Có thể chọn `deepseek-reasoner` (suy luận kỹ hơn nhưng chậm hơn) |
| Vai người hỏi | Nhân viên văn phòng chưa biết code | 5 vai có sẵn, "Ngẫu nhiên", hoặc tự mô tả vai |
| Số câu hỏi | 5 | Tối đa 10. Landing page giới hạn 20 câu / 10 phút / IP, nên đừng chạy liên tục quá nhiều lần |
| Tốc độ gõ | 35 ms/ký tự | Đặt 0 để dán ngay cả câu |
| Nghỉ giữa câu | 1500 ms | Thời gian để khán giả kịp đọc câu trả lời |
| Tự chạy khi bấm nút chat | Bật | |
| Bắt đầu cuộc trò chuyện mới | Bật | Bấm nút "Cuộc trò chuyện mới" của widget trước khi hỏi |

## Cấu trúc

| File | Vai trò |
| --- | --- |
| `extension/manifest.json` | Manifest V3. Content script chạy trên landing page và `localhost` (để thử khi chạy site ở máy) |
| `extension/content.js` | Bắt sự kiện mở khung chat, đọc hội thoại từ `.chat__log`, gõ câu hỏi vào `textarea`, gửi form, chờ trợ lý trả lời xong |
| `extension/background.js` | Gọi DeepSeek API (chuẩn OpenAI chat completions) để sinh câu hỏi; không có key thì lấy từ bộ câu hỏi soạn sẵn |
| `extension/defaults.js` | Giá trị mặc định, danh sách model và các vai người hỏi |
| `extension/popup.*` | Cửa sổ cài đặt và nút chạy / dừng |

Extension dựa vào các class của widget chat trong repo landing page (`assets/js/chat.js`):
`.chat__fab`, `.chat__panel`, `.chat__log`, `.chat__msg--user` / `--bot`, `.chat__form`, `[data-act="new"]`.
Nếu đổi tên các class này, cần cập nhật `findWidget()` trong `content.js`.

## Lưu ý

- API key lưu trong `chrome.storage.local` của trình duyệt và chỉ được gửi tới `api.deepseek.com`.
  Đây là công cụ trình diễn: dùng key riêng cho buổi demo, đặt hạn mức chi tiêu thấp, và đừng chia sẻ
  bản extension đã nhập key.
- Mỗi câu hỏi là một lần gọi API ngắn (tối đa 200 token với `deepseek-chat`), chi phí rất nhỏ.
- Câu hỏi được gửi thật tới landing page, nên sẽ xuất hiện trong mục **Hỏi đáp AI** ở trang quản trị.
