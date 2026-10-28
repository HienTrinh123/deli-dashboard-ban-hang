# Dashboard quản trị bán hàng – Deli Việt Nam

Dashboard đọc trực tiếp Google Sheet **Demo9** (tab `Du_lieu_sach`, dữ liệu đã làm sạch) mỗi khi mở trang hoặc bấm **"Làm mới dữ liệu"**.

## Cấu trúc
| File | Vai trò |
|---|---|
| `index.html` | Giao diện dashboard (HTML/CSS/JS thuần, không thư viện ngoài) |
| `api/data.js` | Hàm Vercel: tải CSV của Google Sheet, chuẩn hóa, kiểm tra hợp lệ, trả JSON (`Cache-Control: no-store`) |

## Điều kiện để chạy
- Google Sheet phải được chia sẻ **"Bất kỳ ai có đường liên kết – Người xem"**.
- Tab `Du_lieu_sach` phải giữ các cột: Ngày đơn hàng, Mã đơn hàng, Phòng kinh doanh, Khu vực, Nhóm sản phẩm, Tên sản phẩm, Số lượng, Đơn giá (VND), Chiết khấu (%), Doanh thu (VND), Giá vốn (VND), Trạng thái đơn, Hợp lệ tính KQKD (Cờ lỗi, Ghi chú làm sạch là tùy chọn). Cột được đọc theo **tên**, không theo vị trí.
- Biến môi trường tùy chọn trên Vercel: `SHEET_ID` (mặc định: Demo9), `SHEET_GID` (mặc định `0` = tab Du_lieu_sach).

## Quy tắc tính KPI
Một đơn được tính khi **cả hai** điều kiện đúng:
1. Cột "Hợp lệ tính KQKD" = **Có**;
2. Kiểm tra tự động đạt: trạng thái "Hoàn thành" (nhãn "Hoàn tất" được chuẩn hóa), đủ ngày/số lượng/đơn giá/chiết khấu/doanh thu/giá vốn, `|Doanh thu − Đơn giá × SL × (1 − CK)| ≤ 1 VND`, mã đơn không trùng, khu vực thuộc danh mục.

Dòng nào hai điều kiện không khớp nhau sẽ hiện cảnh báo trên dashboard và **không** được tính KPI.

KPI: Doanh thu hợp lệ = Σ Doanh thu · LN gộp = Doanh thu − Giá vốn · Biên = LN gộp ÷ Doanh thu · Số đơn = số dòng hợp lệ.

## Bảo mật
API không trả mã khách hàng, mã nhân viên. Lưu ý: vì file Google Sheet được chia sẻ qua link, ai có link file đều xem được toàn bộ file gốc.

Dữ liệu là bộ dữ liệu giả lập phục vụ đào tạo.
