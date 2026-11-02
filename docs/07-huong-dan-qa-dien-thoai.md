# 07 – Hướng dẫn QA nhập kiểm ẩm bằng điện thoại

1. **Mở lô**: quét QR trên biểu mẫu (hoặc tem dán thùng) bằng camera điện thoại. Lần đầu sẽ hỏi đăng nhập.
   Hoặc mở `https://<tên-miền>/m` → bấm vào JO. Lô **Trễ hạn** nằm trên cùng.
2. Kiểm **Ngày kiểm ẩm** và **QA kiểm** ở đầu trang (tự điền, sửa nếu cần).
3. Với mỗi **Thùng mẫu** kho đã hạ:
   - chọn **Vị trí** → **Pallet** (danh sách lấy từ báo cáo kho),
   - gõ **Số thùng**, **SL áo**,
   - đo 3 cái áo, gõ vào **Áo 1, Áo 2, Áo 3** (4,5 hay 4.5 đều được).
   Đủ 3 số là **tự lưu**. Số > 6,5% hiện đỏ; số > 15% hiện cảnh báo gõ nhầm.
4. Dãy nút **1 2 3 …** trên đầu: xanh = xong, đỏ = FAIL, xám = chưa đo. Bấm để nhảy tới thùng đó.
5. Đủ số thùng mẫu → lô **tự đóng** PASS/FAIL. FAIL → hệ thống tạo phiếu **CAPA**; sau tái chế, nhập độ ẩm sau tái chế ở trang CAPA.
6. **Mất sóng**: cứ nhập tiếp. Thanh vàng báo “Đang mất sóng”; khi có sóng số đo tự gửi. Không đóng trình duyệt khi còn chữ “chưa lưu”.
7. Mẹo: Safari/Chrome → **Thêm vào màn hình chính** để mở như ứng dụng.

---

# Form công nhân (mặc định khi quét QR) – cập nhật 21/10/2026

Quét QR hoặc bấm vào lô ở `/m` sẽ mở **form từng bước cho công nhân**. Bảng đầy đủ cho QA (sửa ngày, độ ẩm tái chế, ghi chú) mở bằng link **Chế độ QA** ở cuối màn hình.

**Danh sách lô (`/m`)**
- Số lô cần đo hôm nay ở trên cùng; nút **Quét QR** to.
- Lọc theo **Khu** kho (FH, NC, …) – công nhân ở khu nào bấm khu đó.
- Lô trễ hạn viền đỏ, nằm trên; lô đang đo dở nằm trên lô chưa đo.

**Trong một lô – mỗi thùng mẫu 3 bước**
1. **Vị trí**: bấm nút khu → bấm pallet (tự sang bước 2). Không rõ thì bấm “bỏ qua”.
2. **Số thùng**: bấm ô Số thùng / Số áo, gõ bằng bàn phím trên màn hình → **Tiếp – đo áo**.
3. **Đo 3 áo**: gõ số (có phím dấu phẩy). Gõ xong 1 chữ số sau dấu phẩy là tự sang áo tiếp. Cột màu dâng theo độ ẩm, vạch đỏ đứt = ngưỡng 6,5%.
   Đủ 3 áo → hiện **ĐẠT** (xanh) / **KHÔNG ĐẠT** (đỏ) → bấm **Lưu thùng N** → tự chuyển sang thùng tiếp theo.
- Dãy số **1 2 3 …** trên đầu: xanh = xong, đỏ = không đạt, xám = chưa đo. Bấm để sửa lại thùng.
- **Người đo**: gõ tên 1 lần, điện thoại nhớ (nhiều người dùng chung 1 máy thì đổi tên trước khi đo).
- Mất sóng: vẫn đo và bấm Lưu bình thường; dòng vàng báo “N thùng chờ gửi”, có sóng tự gửi.
- Xong hết thùng: màn hình **Lô ĐẠT / Lô KHÔNG ĐẠT** → **Lô tiếp theo**. Lô không đạt: để riêng các thùng, chờ QA.

Form công nhân **không** ghi đè độ ẩm tái chế và ghi chú của QA.

## Lô KHÔNG ĐẠT → kiểm lại sau tái chế
1. Màn hình **Lô KHÔNG ĐẠT** hiện nút **Nhập kiểm lại sau tái chế**. Để riêng các thùng không đạt, tái chế (phơi / sấy) theo hướng dẫn QA.
2. Tái chế xong: bấm nút đó (hoặc quét lại QR của lô, hoặc tìm lô trong danh sách – dòng đỏ “Kiểm lại sau tái chế”).
3. Form hiện **toàn bộ thùng mẫu** của lô, vị trí và số thùng điền sẵn → đo lại 3 áo mỗi thùng như bình thường.
4. **ĐẠT sau tái chế** → xong, hệ thống tự ghi độ ẩm sau tái chế và báo QA. **Vẫn KHÔNG ĐẠT** → tái chế tiếp rồi bấm kiểm lại lần nữa.
