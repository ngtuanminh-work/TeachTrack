# TeachTrack 📚💰

TeachTrack là một ứng dụng web dạng Single Page Application (SPA) giúp giáo viên, gia sư quản lý lịch dạy, điểm danh học sinh và tự động tính toán thu nhập một cách thông minh theo thời gian thực.

## ✨ Tính năng nổi bật
- **📊 Bảng điều khiển (Dashboard):** Thống kê thu nhập, số buổi dạy, tổng thời gian và hiển thị biểu đồ trực quan (theo tháng và theo lớp).
- **📅 Quản lý Lớp & Lịch:** Tạo lớp học linh hoạt (1 học sinh hoặc lớp đông), cài đặt lịch học theo các ngày trong tuần với hệ 24h.
- **⚡ Tự động hoá 100%:** Ngầm theo dõi thời gian thực. Khi qua giờ kết thúc của lớp, hệ thống tự động ghi nhận buổi dạy và cộng tiền lương.
- **👥 Điểm danh linh hoạt:** - Hỗ trợ điểm danh cho lớp ít người (từng tên cụ thể) và lớp đông (theo số lượng).
  - Tự động tính lại lương khi có học sinh xin nghỉ 1 bữa, nghỉ hẳn hoặc có học sinh mới thêm vào lớp.
- **🏖️ Báo nghỉ:** Xin phép nghỉ nguyên lớp cho những ngày lễ/bận việc, hệ thống sẽ tự động gỡ các biên lai tính tiền bị trùng.
- **⚙️ Cài đặt & Sao lưu:** Cài đặt lương cơ bản và phụ phí linh hoạt. Hỗ trợ xuất dữ liệu ra Excel và Backup/Restore dữ liệu JSON.

## 🚀 Cài đặt & Sử dụng
Dự án chạy hoàn toàn trên trình duyệt (Client-side) sử dụng LocalStorage để lưu dữ liệu, không cần cài đặt Server.

1. Tải toàn bộ mã nguồn về máy.
2. Mở file `index.html` bằng bất kỳ trình duyệt web nào (Chrome, Safari, Edge...).
3. Bắt đầu tạo lớp học và trải nghiệm!

## 🛠️ Công nghệ sử dụng
- **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6+).
- **Thư viện bên thứ 3:** - `Chart.js` (Vẽ biểu đồ thu nhập).
  - `SheetJS / xlsx` (Xuất dữ liệu ra file Excel).