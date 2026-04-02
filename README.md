# ✦ TeachTrack 📚💰

> Công cụ quản lý lịch dạy, điểm danh học sinh và tự động tính toán thu nhập thông minh dành riêng cho Giáo viên và Gia sư tự do.  
> Chạy hoàn toàn trên trình duyệt — không cần server, không cần tài khoản đám mây, bảo mật 100%.

---

## ⚡ Bắt đầu ngay

```text
1. Tải file TeachTrack.html về máy
2. Mở file bằng trình duyệt (double-click)
3. Vào tab "⚙️ Cài đặt" để thiết lập mức lương cơ bản
4. Vào tab "📅 Lớp & Lịch" để thêm học sinh/lớp mới
5. Đi dạy bình thường, hệ thống sẽ tự động tính tiền cho bạn!
```

> 🌐 **Hoặc deploy lên GitHub Pages** để dùng mọi lúc, mọi nơi _(xem hướng dẫn bên dưới)_

---

## 🎮 Tính năng

### Tự động hoá 100% (Real-time Sync)
  - Hệ thống ngầm theo dõi đồng hồ thời gian thực. Cứ mỗi khi vượt qua giờ kết thúc của một ca dạy, hệ thống sẽ tự động tạo một biên lai ghi nhận số tiền bạn vừa kiếm được vào Nhật ký. Chấm dứt cảnh phải "chốt sổ" thủ công cuối mỗi ngày!

### 👥 Điểm danh thông minh (Smart Attendance)

Xử lý hoàn hảo và tự động mọi tình huống thực tế của lớp học nhóm:

| Tình huống | Cách xử lý của TeachTrack |
|---|---|
| 🤒 Nghỉ 1 bữa | Chỉ trừ tiền của HS vắng mặt trong đúng ngày hôm đó, ghi chú tự động. |
| 🚪 Nghỉ luôn | Gạch tên khỏi danh sách, tự động giảm lương tất cả các buổi từ ngày đó về sau. |
| 🙋‍♂️ Thêm HS mới | Chọn ngày bắt đầu, tự động tăng lương tất cả các buổi từ ngày đó trở đi. |
| 👨‍👩‍👧‍👦 Lớp siêu đông | Không cần nhập tên, hỗ trợ khai báo nhanh theo số lượng (VD: Báo vắng 3 em, xin vào 5 em). |
| 🏖️ Báo nghỉ nguyên lớp | Báo nghỉ cho cả lớp 1 ngày, hệ thống dời lịch và không tính tiền ngày đó. |

### 💰 Cấu hình Học phí Linh hoạt
Cài đặt một lần, áp dụng tự động cho mọi sĩ số:

Lương cơ bản: Thu nhập cho 1 học sinh (VD: 85.000đ/ca).

Phụ phí / 1 HS thêm: Số tiền cộng thêm cho học sinh thứ 2 trở đi (VD: Thêm 1 bạn cộng 5.000đ).

Hệ thống tự động nhân bản công thức này cho lớp 1 người, 3 người hay 50 người một cách chính xác tuyệt đối.

### 📊 Thống kê trực quan & Dashboard
Tổng quan: Hiển thị tức thời Tổng thu nhập, Tổng giờ dạy, Hiệu suất trung bình/buổi.

Biểu đồ (Chart.js): Vẽ biểu đồ cột phân tích doanh thu theo từng tháng và tỷ trọng thu nhập mang lại từ từng lớp học.

Cảnh báo sớm: Liệt kê danh sách các lớp học sắp hết số buổi để bạn kịp thời nhắc nhở phụ huynh gia hạn.

### 💾 Xuất Dữ liệu & Sao lưu
📥 Xuất Excel: Bấm nút là tải ngay lịch sử buổi dạy ra file .xlsx siêu đẹp, dễ dàng gửi phụ huynh cuối tháng.

🔄 Backup / Restore: Tải toàn bộ Database xuống dưới dạng file .json và khôi phục trên bất kỳ thiết bị nào chỉ với 1 cú click chuột.

---

## 📁 Cấu trúc

Dự án tuân thủ cấu trúc chuẩn, tách biệt rõ ràng giữa Giao diện (HTML), Style (CSS) và Logic (JS):

```
📄 index.html      # Khung giao diện chính của ứng dụng (Mở file này để chạy)
🎨 style.css       # Chứa toàn bộ định dạng màu sắc, bố cục UI/UX
⚙️ script.js       # Chứa mã nguồn logic, xử lý tính toán và lưu trữ dữ liệu
📖 README.md       # Tài liệu giới thiệu và hướng dẫn sử dụng
```

---

## 🌐 Deploy lên GitHub Pages

1. Tạo repository mới trên GitHub
2. Upload bộ 3 file index.html, style.css, script.js lên repository.
3. Vào Settings → Pages → Source: Deploy from a branch → main → / (root).
4. Truy cập đường link được cấp: https://[username].github.io/[repo-name].
5. Cài đặt lên điện thoại: Mở link bằng trình duyệt (Safari/Chrome) → Chọn "Thêm vào màn hình chính" (Add to Home Screen) để dùng như một App thực thụ.

---

## 🔒 Bảo mật & Quyền riêng tư
✅ Local Storage: Mọi dữ liệu tiền bạc, tên học sinh của bạn được lưu 100% cục bộ trên trình duyệt của máy bạn.

✅ No Backend: App không có máy chủ, không sử dụng database đám mây. Bạn hoàn toàn ẩn danh.

✅ Không quảng cáo, không theo dõi người dùng.

---

## 📄 License

MIT — tự do sử dụng, chỉnh sửa, phân phối.
