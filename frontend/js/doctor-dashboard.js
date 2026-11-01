/*
=====================================================
DOCTOR DASHBOARD - CLINIC BOOKING
=====================================================
Chức năng:
1. Kiểm tra session bác sĩ
2. Hiển thị thông tin và thống kê
3. Tạo lịch làm việc theo 4 ca
4. Hiển thị, đóng/mở và xóa lịch
5. Hiển thị lịch hẹn bệnh nhân
6. Xác nhận hoặc hủy lịch hẹn
7. Ghi nhận bệnh nhân đến khám
8. Hoàn thành khám sau khi ghi nhận đến
9. Đánh dấu bệnh nhân không đến
=====================================================
*/

document.addEventListener("DOMContentLoaded", async function () {
    document
        .getElementById("createScheduleForm")
        ?.addEventListener("submit", createDoctorSchedule);
    document
        .getElementById("refreshSchedules")
        ?.addEventListener("click", loadDoctorSchedules);
    document
        .getElementById("refreshAppointments")
        ?.addEventListener("click", loadDoctorAppointments);
    const scheduleDate = document.getElementById("scheduleDate");
    if (scheduleDate) {
        const now = new Date();
        const localToday = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, "0"),
            String(now.getDate()).padStart(2, "0")
        ].join("-");
        scheduleDate.min = localToday;
    }
    const sessionValid = await checkDoctorSession();
    if (!sessionValid) return;
    await loadDoctorDashboard();
    await loadDoctorSchedules();
    await loadDoctorAppointments();
});
/*
=====================================================
0. THÔNG BÁO (TOAST) VÀ HỘP XÁC NHẬN
Thay cho alert() / confirm() của trình duyệt.
- showToast(message, type = "info" | "success" | "error" | "warning")
- await confirmDialog(message, { title, confirmText, cancelText, danger })
  -> trả về true nếu bấm xác nhận, false nếu hủy.
=====================================================
*/
(function injectDashboardUiStyles() {
    if (document.getElementById("dashboardUiStyles")) return;
    const style = document.createElement("style");
    style.id = "dashboardUiStyles";
    style.textContent = `
        .dash-toast-host {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 3000;
            display: flex;
            flex-direction: column;
            gap: 10px;
            width: min(380px, calc(100vw - 32px));
            pointer-events: none;
        }
        .dash-toast {
            pointer-events: auto;
            display: flex;
            align-items: flex-start;
            gap: 11px;
            padding: 13px 14px;
            border-radius: 12px;
            border: 1px solid var(--border, #e2e8f0);
            border-left-width: 4px;
            background: #ffffff;
            box-shadow: 0 12px 30px rgba(15, 23, 42, .16);
            font-size: 14px;
            line-height: 1.45;
            color: var(--text, #0f172a);
            animation: dashToastIn .22s ease;
        }
        .dash-toast.leaving {
            opacity: 0;
            transform: translateX(16px);
            transition: opacity .2s ease, transform .2s ease;
        }
        .dash-toast-icon {
            flex: none;
            margin-top: 1px;
            font-size: 16px;
        }
        .dash-toast-text {
            flex: 1;
            min-width: 0;
            word-break: break-word;
        }
        .dash-toast-close {
            flex: none;
            border: 0;
            background: transparent;
            color: var(--muted, #64748b);
            font-size: 14px;
            cursor: pointer;
            padding: 0 2px;
        }
        .dash-toast.success { border-left-color: #16a34a; }
        .dash-toast.success .dash-toast-icon { color: #16a34a; }
        .dash-toast.error { border-left-color: #dc2626; }
        .dash-toast.error .dash-toast-icon { color: #dc2626; }
        .dash-toast.warning { border-left-color: #d97706; }
        .dash-toast.warning .dash-toast-icon { color: #d97706; }
        .dash-toast.info { border-left-color: var(--primary, #0ea5a4); }
        .dash-toast.info .dash-toast-icon { color: var(--primary, #0ea5a4); }
        @keyframes dashToastIn {
            from { opacity: 0; transform: translateX(16px); }
            to { opacity: 1; transform: translateX(0); }
        }
        .dash-confirm-overlay {
            position: fixed;
            inset: 0;
            z-index: 2000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px;
            background: rgba(15, 23, 42, .55);
            animation: dashFadeIn .15s ease;
        }
        .dash-confirm {
            width: 100%;
            max-width: 400px;
            padding: 22px 22px 18px;
            border-radius: 16px;
            background: #ffffff;
            box-shadow: 0 24px 60px rgba(15, 23, 42, .28);
        }
        .dash-confirm h4 {
            margin: 0 0 8px;
            font-size: 17px;
            color: var(--text, #0f172a);
        }
        .dash-confirm p {
            margin: 0 0 18px;
            font-size: 14px;
            line-height: 1.5;
            color: var(--muted, #64748b);
            white-space: pre-line;
        }
        .dash-confirm-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
        }
        .dash-confirm-danger {
            background: #dc2626 !important;
            border-color: #dc2626 !important;
            color: #ffffff !important;
        }
        @keyframes dashFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
    `;
    document.head.appendChild(style);
})();

function showToast(message, type = "info", duration) {
    const icons = {
        success: "fa-circle-check",
        error: "fa-circle-exclamation",
        warning: "fa-triangle-exclamation",
        info: "fa-circle-info"
    };
    const kind = icons[type] ? type : "info";
    let host = document.getElementById("dashToastHost");
    if (!host) {
        host = document.createElement("div");
        host.id = "dashToastHost";
        host.className = "dash-toast-host";
        host.setAttribute("aria-live", "polite");
        document.body.appendChild(host);
    }
    const toast = document.createElement("div");
    toast.className = `dash-toast ${kind}`;
    toast.setAttribute("role", kind === "error" ? "alert" : "status");
    const icon = document.createElement("i");
    icon.className = `fa-solid ${icons[kind]} dash-toast-icon`;
    const text = document.createElement("div");
    text.className = "dash-toast-text";
    text.textContent = String(message ?? "");
    const close = document.createElement("button");
    close.type = "button";
    close.className = "dash-toast-close";
    close.setAttribute("aria-label", "Đóng thông báo");
    close.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    toast.append(icon, text, close);
    host.appendChild(toast);
    let removed = false;
    let timer = null;
    function removeToast() {
        if (removed) return;
        removed = true;
        clearTimeout(timer);
        toast.classList.add("leaving");
        setTimeout(function () {
            toast.remove();
        }, 220);
    }
    close.addEventListener("click", removeToast);
    // Lỗi hiển thị lâu hơn để kịp đọc
    timer = setTimeout(
        removeToast,
        duration ?? (kind === "error" ? 6000 : 3500)
    );
    return removeToast;
}

function confirmDialog(message, options = {}) {
    const {
        title = "Xác nhận",
        confirmText = "Đồng ý",
        cancelText = "Hủy bỏ",
        danger = false
    } = options;
    return new Promise(function (resolve) {
        const previousFocus = document.activeElement;
        const overlay = document.createElement("div");
        overlay.className = "dash-confirm-overlay";
        const box = document.createElement("div");
        box.className = "dash-confirm";
        box.setAttribute("role", "alertdialog");
        box.setAttribute("aria-modal", "true");
        const heading = document.createElement("h4");
        heading.textContent = title;
        const body = document.createElement("p");
        body.textContent = String(message ?? "");
        const actions = document.createElement("div");
        actions.className = "dash-confirm-actions";
        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.className = "btn btn-outline";
        cancelButton.textContent = cancelText;
        const confirmButton = document.createElement("button");
        confirmButton.type = "button";
        confirmButton.className =
            "btn btn-primary" + (danger ? " dash-confirm-danger" : "");
        confirmButton.textContent = confirmText;
        actions.append(cancelButton, confirmButton);
        box.append(heading, body, actions);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        function finish(result) {
            document.removeEventListener("keydown", onKeyDown, true);
            overlay.remove();
            if (previousFocus && previousFocus.focus) {
                previousFocus.focus();
            }
            resolve(result);
        }
        function onKeyDown(event) {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                finish(false);
            }
        }
        document.addEventListener("keydown", onKeyDown, true);
        cancelButton.addEventListener("click", function () {
            finish(false);
        });
        confirmButton.addEventListener("click", function () {
            finish(true);
        });
        overlay.addEventListener("click", function (event) {
            if (event.target === overlay) finish(false);
        });
        // Với thao tác nguy hiểm, focus vào nút Hủy để tránh bấm nhầm
        (danger ? cancelButton : confirmButton).focus();
    });
}
/*
=====================================================
1. API HELPER
=====================================================
*/

async function dashboardFetch(url, options = {}) {
    const config = {
        credentials: "include",
        ...options,
        headers: {
            ...(options.headers || {})
        }
    };
    if (options.body && !config.headers["Content-Type"]) {
        config.headers["Content-Type"] = "application/json";
    }
    const response = await fetch(url, config);
    let result = null;
    try {
        result = await response.json();
    } catch {
        result = null;
    }
    if (!response.ok || result?.success === false) {
        throw new Error(
            result?.message || `API lỗi HTTP ${response.status}`
        );
    }
    return result;
}
/*
=====================================================
2. KIỂM TRA SESSION BÁC SĨ
=====================================================
*/

async function checkDoctorSession() {
    try {
        const result = await dashboardFetch("/api/session");
        if (!result.success || !result.user) {
            window.location.href = "login.html";
            return false;
        }
        if (result.user.role !== "DOCTOR") {
            showToast("Bạn không có quyền truy cập trang bác sĩ.", "error");
            // Chờ một chút để người dùng kịp đọc thông báo
            setTimeout(function () {
                window.location.href = "home.html";
            }, 1500);
            return false;
        }
        const name = result.user.full_name || "Bác sĩ";
        const doctorNameElement = document.getElementById("doctorName");
        const headerDoctorName = document.getElementById("headerDoctorName");
        if (doctorNameElement) {
            doctorNameElement.textContent = `BS. ${name}`;
        }
        if (headerDoctorName) {
            headerDoctorName.textContent = `BS. ${name}`;
        }
        return true;
    } catch (error) {
        window.location.href = "login.html";
        return false;
    }
}
/*
=====================================================
3. DASHBOARD VÀ THỐNG KÊ
=====================================================
*/

async function loadDoctorDashboard() {
    try {
        const result = await dashboardFetch("/api/doctors/me/dashboard");
        const data = result.data || result;
        const doctor = data.doctor || {};
        const statistics = data.statistics || {};
        const doctorName = document.getElementById("doctorName");
        const doctorSpecialty = document.getElementById("doctorSpecialty");
        if (doctorName && doctor.full_name) {
            doctorName.textContent = `BS. ${doctor.full_name}`;
        }
        if (doctorSpecialty) {
            doctorSpecialty.textContent =
                doctor.specialty_name || "Bác sĩ";
        }
        setText("todayScheduleCount", statistics.todaySchedules ?? 0);
        setText("appointmentCount", statistics.appointments ?? 0);
        setText("pendingCount", statistics.pending ?? 0);
        setText("completedCount", statistics.completed ?? 0);
    } catch (error) {
        showToast(
            error.message || "Không tải được thống kê dashboard.",
            "error"
        );
    }
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}
/*
=====================================================
4. CẤU HÌNH CA LÀM VIỆC
=====================================================
*/

const SHIFT_CONFIG = {
    NIGHT: {
        name: "Ca đêm",
        icon: "fa-moon",
        start: "00:00",
        end: "06:00"
    },
    MORNING: {
        name: "Ca sáng",
        icon: "fa-sun",
        start: "06:00",
        end: "12:00"
    },
    AFTERNOON: {
        name: "Ca chiều",
        icon: "fa-cloud-sun",
        start: "12:00",
        end: "18:00"
    },
    EVENING: {
        name: "Ca tối",
        icon: "fa-cloud-moon",
        start: "18:00",
        end: "00:00"
    }
};
/*
=====================================================
5. TẠO LỊCH LÀM VIỆC
=====================================================
*/

async function createDoctorSchedule(event) {
    event.preventDefault();
    const form = document.getElementById("createScheduleForm");
    const dateInput = document.getElementById("scheduleDate");
    const message = document.getElementById("scheduleMessage");
    const submitButton = form?.querySelector('button[type="submit"]');
    const date = dateInput?.value || "";
    const selectedShift = document.querySelector(
        'input[name="shift_type"]:checked'
    );
    const shiftType = selectedShift?.value || "";
    if (!date) {
        showDashboardMessage(message, "Vui lòng chọn ngày làm việc.", "error");
        return;
    }
    if (!shiftType || !SHIFT_CONFIG[shiftType]) {
        showDashboardMessage(message, "Vui lòng chọn ca làm việc hợp lệ.", "error");
        return;
    }
    const oldButtonHTML = submitButton?.innerHTML;
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.innerHTML =
            '<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo...';
    }
    try {
        const result = await dashboardFetch("/api/schedules", {
            method: "POST",
            body: JSON.stringify({
                schedule_date: date,
                shift_type: shiftType
            })
        });
        showDashboardMessage(
            message,
            result.message || "Tạo lịch làm việc thành công.",
            "success"
        );
        form.reset();
        await Promise.all([
            loadDoctorSchedules(),
            loadDoctorDashboard()
        ]);
    } catch (error) {
        showDashboardMessage(
            message,
            error.message || "Không thể tạo lịch làm việc.",
            "error"
        );
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = oldButtonHTML;
        }
    }
}
/*
=====================================================
6. TẢI LỊCH LÀM VIỆC
GET /api/schedules/my
=====================================================
*/

async function loadDoctorSchedules() {
    const tbody = document.getElementById("scheduleTableBody");
    if (!tbody) return;
    tbody.innerHTML = `
        <tr>
            <td colspan="5" class="dashboard-loading">
                <i class="fa-solid fa-spinner fa-spin"></i>
                Đang tải lịch làm việc...
            </td>
        </tr>
    `;
    try {
        const result = await dashboardFetch("/api/schedules/my");
        const schedules = normalizeSchedules(result);
        if (!schedules.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="dashboard-loading">
                        Chưa có lịch làm việc.
                    </td>
                </tr>
            `;
            return;
        }
        tbody.innerHTML = schedules.map(renderScheduleRow).join("");
    } catch (error) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="dashboard-loading">
                    Không thể tải lịch làm việc.
                </td>
            </tr>
        `;
    }
}

function normalizeSchedules(result) {
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.data)) return result.data;
    if (Array.isArray(result?.schedules)) return result.schedules;
    if (Array.isArray(result?.data?.schedules)) return result.data.schedules;
    return [];
}
/*
=====================================================
7. HIỂN THỊ LỊCH LÀM VIỆC
=====================================================
*/

function renderScheduleRow(schedule) {
    const status = schedule.status || "AVAILABLE";
    const isAvailable = status === "AVAILABLE";
    const shiftType = schedule.shift_type || "";
    const shift = SHIFT_CONFIG[shiftType] || {};
    const statusText = isAvailable ? "Đang mở" : "Đã đóng";
    const statusClass = isAvailable ? "available" : "closed";
    const shiftName =
        schedule.shift_name || shift.name || shiftType || "Chưa xác định";
    const start = schedule.display_start ||
        (schedule.start_time ? formatTime(schedule.start_time) : shift.start || "");
    const end = schedule.display_end ||
        (schedule.end_time ? formatTime(schedule.end_time) : shift.end || "");
    const timeText = `${start} - ${end}`;
    return `
        <tr>
            <td>${escapeHTML(formatDate(schedule.schedule_date))}</td>
            <td>
                <span style="display:inline-flex;align-items:center;gap:7px;font-weight:600">
                    <i class="fa-solid ${escapeHTML(shift.icon || "fa-clock")}"
                       style="color:var(--primary-deep,#0b5f59)"></i>
                    ${escapeHTML(shiftName)}
                </span>
            </td>
            <td>${escapeHTML(timeText)}</td>
            <td>
                <span class="dashboard-status ${statusClass}">
                    ${statusText}
                </span>
            </td>
            <td>
                <div class="dashboard-actions">
                    <button
                        type="button"
                        class="btn btn-outline"
                        onclick="toggleDoctorSchedule(
                            ${Number(schedule.id)},
                            '${isAvailable ? "AVAILABLE" : "CLOSED"}',
                            '${escapeHTML(String(schedule.schedule_date || "").slice(0, 10))}',
                            '${escapeHTML(shiftType)}'
                        )"
                    >
                        ${isAvailable ? "Đóng lịch" : "Mở lịch"}
                    </button>
                    <button
                        type="button"
                        class="btn btn-outline"
                        onclick="deleteDoctorSchedule(${Number(schedule.id)})"
                    >
                        <i class="fa-solid fa-trash"></i> Xóa
                    </button>
                </div>
            </td>
        </tr>
    `;
}
/*
=====================================================
8. ĐÓNG / MỞ LỊCH
PUT /api/schedules/:id
=====================================================
*/

async function toggleDoctorSchedule(
    scheduleId,
    currentStatus,
    scheduleDate,
    shiftType
) {
    const newStatus = currentStatus === "AVAILABLE"
        ? "CLOSED"
        : "AVAILABLE";
    try {
        const result = await dashboardFetch(
            `/api/schedules/${Number(scheduleId)}`,
            {
                method: "PUT",
                body: JSON.stringify({
                    schedule_date: scheduleDate,
                    shift_type: shiftType,
                    status: newStatus
                })
            }
        );
        showToast(result.message || "Đã cập nhật lịch làm việc.", "success");
        await Promise.all([
            loadDoctorSchedules(),
            loadDoctorDashboard()
        ]);
    } catch (error) {
        showToast(error.message || "Không thể cập nhật lịch.", "error");
    }
}
/*
=====================================================
9. XÓA LỊCH
DELETE /api/schedules/:id
=====================================================
*/

async function deleteDoctorSchedule(scheduleId) {
    if (
        !(await confirmDialog(
            "Bạn có chắc chắn muốn xóa lịch làm việc này?",
            { title: "Xóa lịch làm việc", confirmText: "Xóa", danger: true }
        ))
    ) {
        return;
    }
    try {
        const result = await dashboardFetch(
            `/api/schedules/${Number(scheduleId)}`,
            { method: "DELETE" }
        );
        showToast(result.message || "Đã xóa lịch làm việc.", "success");
        await Promise.all([
            loadDoctorSchedules(),
            loadDoctorDashboard()
        ]);
    } catch (error) {
        showToast(error.message || "Không thể xóa lịch làm việc.", "error");
    }
}
/*
=====================================================
10. TẢI LỊCH HẸN BỆNH NHÂN
GET /api/doctors/me/appointments
=====================================================
*/

async function loadDoctorAppointments() {
    const tbody = document.getElementById("appointmentTableBody");
    if (!tbody) return;
    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="dashboard-loading">
                <i class="fa-solid fa-spinner fa-spin"></i>
                Đang tải lịch hẹn...
            </td>
        </tr>
    `;
    try {
        const result = await dashboardFetch("/api/doctors/me/appointments");
        doctorAppointmentsCache = normalizeAppointments(result);
        // Hiển thị theo bộ lọc đang chọn (giữ nguyên bộ lọc khi làm mới)
        applyAppointmentFilters();
    } catch (error) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="dashboard-loading">
                    Không thể tải lịch hẹn.
                </td>
            </tr>
        `;
    }
}

function normalizeAppointments(result) {
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.data)) return result.data;
    if (Array.isArray(result?.appointments)) return result.appointments;
    if (Array.isArray(result?.data?.appointments)) return result.data.appointments;
    return [];
}
/*
=====================================================
11. HIỂN THỊ LỊCH HẸN
=====================================================
*/

function renderAppointmentRow(appointment) {
    const status = appointment.status || "PENDING";
    const statusClass = status.toLowerCase().replace(/_/g, "-");
    return `
        <tr>
            <td>
                <strong>${escapeHTML(appointment.patient_name || "Chưa cập nhật")}</strong>
                ${
                    appointment.patient_phone
                        ? `<br><small>${escapeHTML(appointment.patient_phone)}</small>`
                        : ""
                }
            </td>
            <td>${escapeHTML(formatDate(appointment.schedule_date))}</td>
            <td>${escapeHTML(formatTime(appointment.appointment_time))}</td>
            <td>${escapeHTML(appointment.reason || "Không có")}</td>
            <td>
                <span class="dashboard-status ${statusClass}">
                    ${escapeHTML(translateAppointmentStatus(status))}
                </span>
            </td>
            <td>
                ${renderAppointmentActions(appointment)}
            </td>
        </tr>
    `;
}
/*
=====================================================
12. CÁC NÚT XỬ LÝ LỊCH HẸN
=====================================================
*/

function renderAppointmentActions(appointment) {
    const id = Number(appointment.id);
    const status = appointment.status;
    const hasArrived = Boolean(appointment.actual_arrival_time);
    if (!Number.isInteger(id) || id <= 0) {
        return "-";
    }
    if (status === "PENDING") {
        return `
            <div class="dashboard-actions">
                <button
                    type="button"
                    class="btn btn-primary"
                    onclick="updateAppointment(${id}, 'CONFIRMED')"
                >
                    Xác nhận
                </button>
                <button
                    type="button"
                    class="btn btn-outline"
                    onclick="updateAppointment(${id}, 'CANCELLED')"
                >
                    Hủy
                </button>
            </div>
        `;
    }
    if (status === "CONFIRMED" && !hasArrived) {
        return `
            <div class="dashboard-actions">
                <button
                    type="button"
                    class="btn btn-primary"
                    onclick="recordPatientArrival(${id})"
                >
                    <i class="fa-solid fa-user-check"></i>
                    Ghi nhận đến
                </button>
                <button
                    type="button"
                    class="btn btn-outline"
                    onclick="updateAppointment(${id}, 'NO_SHOW')"
                >
                    Không đến
                </button>
            </div>
        `;
    }
    if (status === "CONFIRMED" && hasArrived) {
        return `
            <div class="dashboard-actions">
                <button
                    type="button"
                    class="btn btn-primary"
                    onclick="completeAppointment(${id})"
                >
                    <i class="fa-solid fa-check"></i>
                    Hoàn thành
                </button>
                <button
                    type="button"
                    class="btn btn-outline"
                    onclick="openPrescriptionModal(${id})"
                >
                    <i class="fa-solid fa-prescription-bottle-medical"></i>
                    Kê đơn thuốc
                </button>
            </div>
        `;
    }
    if (status === "COMPLETED") {
        return `
            <div class="dashboard-actions">
                <span>Đã hoàn thành</span>
                <button
                    type="button"
                    class="btn btn-outline"
                    onclick="openPrescriptionModal(${id})"
                >
                    <i class="fa-solid fa-prescription-bottle-medical"></i>
                    Đơn thuốc
                </button>
            </div>
        `;
    }
    if (status === "CANCELLED") {
        return '<span>Đã hủy</span>';
    }
    if (status === "NO_SHOW") {
        return '<span>Không đến</span>';
    }
    return "-";
}
/*
=====================================================
13. XÁC NHẬN / HỦY / KHÔNG ĐẾN
=====================================================
Dùng API chuyên biệt của Backend.
=====================================================
*/

async function updateAppointment(appointmentId, status) {
    const id = Number(appointmentId);
    if (!Number.isInteger(id) || id <= 0) {
        showToast("ID lịch hẹn không hợp lệ.", "error");
        return;
    }
    const endpointMap = {
        CONFIRMED: `/api/appointments/${id}/confirm`,
        CANCELLED: `/api/appointments/${id}/cancel`,
        NO_SHOW: `/api/appointments/${id}/no-show`
    };
    const endpoint = endpointMap[status];
    if (!endpoint) {
        showToast("Trạng thái lịch hẹn không hợp lệ.", "error");
        return;
    }
    if (status === "CANCELLED" &&
        !(await confirmDialog(
            "Bạn có chắc chắn muốn hủy lịch hẹn này?",
            { title: "Hủy lịch hẹn", confirmText: "Hủy lịch", cancelText: "Không", danger: true }
        ))) {
        return;
    }
    if (status === "NO_SHOW" &&
        !(await confirmDialog(
            "Xác nhận bệnh nhân không đến khám?",
            { title: "Bệnh nhân không đến", confirmText: "Xác nhận", danger: true }
        ))) {
        return;
    }
    try {
        const result = await dashboardFetch(endpoint, {
            method: "POST"
        });
        showToast(result.message || "Cập nhật lịch hẹn thành công.", "success");
        await Promise.all([
            loadDoctorAppointments(),
            loadDoctorDashboard()
        ]);
    } catch (error) {
        showToast(error.message || "Không thể cập nhật lịch hẹn.", "error");
    }
}
/*
=====================================================
14. GHI NHẬN BỆNH NHÂN ĐẾN KHÁM
POST /api/appointments/:id/arrival
=====================================================
*/

async function recordPatientArrival(appointmentId) {
    const id = Number(appointmentId);
    if (!Number.isInteger(id) || id <= 0) {
        showToast("ID lịch hẹn không hợp lệ.", "error");
        return;
    }
    if (!(await confirmDialog("Xác nhận bệnh nhân đã đến khám?"))) {
        return;
    }
    try {
        const result = await dashboardFetch(
            `/api/appointments/${id}/arrival`,
            {
                method: "POST"
            }
        );
        showToast(result.message || "Đã ghi nhận bệnh nhân đến khám.", "success");
        await Promise.all([
            loadDoctorAppointments(),
            loadDoctorDashboard()
        ]);
    } catch (error) {
        showToast(error.message || "Không thể ghi nhận bệnh nhân đến khám.", "error");
    }
}
/*
=====================================================
15. HOÀN THÀNH KHÁM
POST /api/appointments/:id/complete
=====================================================
*/

async function completeAppointment(appointmentId) {
    const id = Number(appointmentId);
    if (!Number.isInteger(id) || id <= 0) {
        showToast("ID lịch hẹn không hợp lệ.", "error");
        return;
    }
    if (!(await confirmDialog("Xác nhận hoàn thành cuộc khám này?"))) {
        return;
    }
    try {
        const result = await dashboardFetch(
            `/api/appointments/${id}/complete`,
            {
                method: "POST"
            }
        );
        showToast(result.message || "Cuộc hẹn đã được đánh dấu hoàn thành.", "success");
        await Promise.all([
            loadDoctorAppointments(),
            loadDoctorDashboard()
        ]);
    } catch (error) {
        showToast(error.message || "Không thể hoàn thành cuộc khám.", "error");
    }
}
/*
=====================================================
15B. KÊ ĐƠN THUỐC
GET  /api/appointments/:id/prescription  (nạp dữ liệu cũ)
POST /api/appointments/:id/prescription  (tạo mới)
PUT  /api/appointments/:id/prescription  (cập nhật)
=====================================================
*/

let currentPrescriptionAppointmentId = null;
let currentPrescriptionExists = false;
let currentPrescriptionAppointmentStatus = null;

function emptyMedicineItem() {
    return {
        medicine_name: "",
        dosage: "",
        frequency: "",
        duration: "",
        quantity: "",
        instructions: ""
    };
}

function renderMedicineRow(item = emptyMedicineItem()) {
    const row = document.createElement("div");
    row.className = "rx-item";
    row.innerHTML = `
        <div class="rx-item-grid">
            <div class="rx-field rx-field-wide">
                <label>Tên thuốc *</label>
                <input type="text" data-field="medicine_name"
                       maxlength="255" placeholder="VD: Paracetamol 500mg"
                       value="${escapeHTML(item.medicine_name)}">
            </div>
            <div class="rx-field">
                <label>Liều dùng</label>
                <input type="text" data-field="dosage"
                       maxlength="150" placeholder="VD: 1 viên"
                       value="${escapeHTML(item.dosage)}">
            </div>
            <div class="rx-field">
                <label>Tần suất</label>
                <input type="text" data-field="frequency"
                       maxlength="150" placeholder="VD: 3 lần/ngày"
                       value="${escapeHTML(item.frequency)}">
            </div>
            <div class="rx-field">
                <label>Thời gian dùng</label>
                <input type="text" data-field="duration"
                       maxlength="100" placeholder="VD: 5 ngày"
                       value="${escapeHTML(item.duration)}">
            </div>
            <div class="rx-field">
                <label>Số lượng</label>
                <input type="text" data-field="quantity"
                       maxlength="100" placeholder="VD: 15 viên"
                       value="${escapeHTML(item.quantity)}">
            </div>
            <div class="rx-field rx-field-wide">
                <label>Hướng dẫn</label>
                <input type="text" data-field="instructions"
                       maxlength="1000" placeholder="VD: Uống sau ăn"
                       value="${escapeHTML(item.instructions)}">
            </div>
        </div>
        <button type="button" class="btn btn-outline rx-remove"
                title="Xóa thuốc này">
            <i class="fa-solid fa-trash"></i>
        </button>
    `;
    row.querySelector(".rx-remove").addEventListener("click", function () {
        const list = document.getElementById("rxItems");
        if (list.children.length <= 1) {
            showToast("Đơn thuốc phải có ít nhất một loại thuốc.", "error");
            return;
        }
        row.remove();
    });
    return row;
}

function addMedicineRow(item) {
    const list = document.getElementById("rxItems");
    if (!list) return;
    if (list.children.length >= 30) {
        showToast("Một đơn thuốc tối đa 30 loại thuốc.", "error");
        return;
    }
    list.appendChild(renderMedicineRow(item));
}

function setPrescriptionMessage(text, type) {
    const element = document.getElementById("rxMessage");
    if (!element) return;
    element.textContent = text || "";
    element.className = text ? `rx-message ${type || ""}` : "rx-message";
}

function closePrescriptionModal() {
    document.getElementById("prescriptionModal")?.classList.remove("open");
    document.body.style.overflow = "";
    currentPrescriptionAppointmentId = null;
}

async function openPrescriptionModal(appointmentId) {
    const id = Number(appointmentId);
    if (!Number.isInteger(id) || id <= 0) {
        showToast("ID lịch hẹn không hợp lệ.", "error");
        return;
    }
    const modal = document.getElementById("prescriptionModal");
    if (!modal) return;
    currentPrescriptionAppointmentId = id;
    currentPrescriptionExists = false;
    currentPrescriptionAppointmentStatus = null;
    document.getElementById("prescriptionForm").reset();
    document.getElementById("rxItems").innerHTML = "";
    setPrescriptionMessage("", "");
    document.getElementById("rxPatientInfo").textContent =
        "Đang tải thông tin...";
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
    try {
        const result = await dashboardFetch(
            `/api/appointments/${id}/prescription`
        );
        const data = result.data || {};
        const appointment = data.appointment || {};
        const record = data.medical_record || {};
        const prescription = data.prescription || null;
        currentPrescriptionAppointmentStatus =
            appointment.status || null;
        document.getElementById("rxPatientInfo").textContent =
            `${appointment.patient_name || "Bệnh nhân"} · ` +
            `${formatDate(appointment.schedule_date)} ` +
            `${formatTime(appointment.appointment_time)}`;
        document.getElementById("rxDiagnosis").value =
            record.diagnosis || "";
        document.getElementById("rxSymptoms").value =
            record.symptoms || "";
        document.getElementById("rxExamNotes").value =
            record.examination_notes || "";
        document.getElementById("rxTreatmentPlan").value =
            record.treatment_plan || "";
        if (prescription) {
            currentPrescriptionExists = true;
            document.getElementById("rxNote").value =
                prescription.note || "";
            (prescription.items || []).forEach(addMedicineRow);
        }
        if (!document.getElementById("rxItems").children.length) {
            addMedicineRow();
        }
        document.getElementById("rxModalTitle").textContent =
            currentPrescriptionExists ? "Sửa đơn thuốc" : "Kê đơn thuốc";
    } catch (error) {
        document.getElementById("rxPatientInfo").textContent = "";
        addMedicineRow();
        setPrescriptionMessage(
            error.message || "Không thể tải thông tin đơn thuốc.",
            "error"
        );
    }
}

function collectPrescriptionItems() {
    return Array.from(
        document.querySelectorAll("#rxItems .rx-item")
    ).map(function (row) {
        const item = {};
        row.querySelectorAll("[data-field]").forEach(function (input) {
            item[input.dataset.field] = input.value.trim();
        });
        return item;
    });
}

async function submitPrescription(event) {
    event.preventDefault();
    const id = currentPrescriptionAppointmentId;
    if (!id) return;
    const diagnosis =
        document.getElementById("rxDiagnosis").value.trim();
    if (!diagnosis) {
        setPrescriptionMessage("Vui lòng nhập chẩn đoán.", "error");
        return;
    }
    const items = collectPrescriptionItems();
    if (items.some(item => !item.medicine_name)) {
        setPrescriptionMessage(
            "Mỗi dòng thuốc phải có tên thuốc.",
            "error"
        );
        return;
    }
    const payload = {
        diagnosis,
        symptoms: document.getElementById("rxSymptoms").value.trim(),
        examination_notes:
            document.getElementById("rxExamNotes").value.trim(),
        treatment_plan:
            document.getElementById("rxTreatmentPlan").value.trim(),
        note: document.getElementById("rxNote").value.trim(),
        items
    };
    const submitButton = document.getElementById("rxSubmit");
    const oldHTML = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';
    try {
        const result = await dashboardFetch(
            `/api/appointments/${id}/prescription`,
            {
                method: currentPrescriptionExists ? "PUT" : "POST",
                body: JSON.stringify(payload)
            }
        );
        // Lấy trạng thái trước khi đóng modal (đóng modal sẽ xóa state)
        const canComplete =
            currentPrescriptionAppointmentStatus === "CONFIRMED";
        closePrescriptionModal();
        showToast(result.message || "Đã lưu đơn thuốc.", "success");
        // Lịch còn CONFIRMED (đã đến khám nhưng chưa hoàn thành):
        // hỏi bác sĩ có muốn hoàn thành cuộc khám luôn không.
        if (
            canComplete &&
            await confirmDialog(
                "Bạn có muốn đánh dấu hoàn thành cuộc khám này luôn không?",
                {
                    title: "Đơn thuốc đã được lưu",
                    confirmText: "Hoàn thành khám",
                    cancelText: "Để sau"
                }
            )
        ) {
            try {
                const done = await dashboardFetch(
                    `/api/appointments/${id}/complete`,
                    { method: "POST" }
                );
                showToast(
                    done.message ||
                    "Cuộc hẹn đã được đánh dấu hoàn thành.",
                    "success"
                );
            } catch (completeError) {
                showToast(
                    "Đơn thuốc đã lưu nhưng chưa hoàn thành được cuộc khám: " +
                    (completeError.message || "lỗi không xác định."),
                    "error"
                );
            }
        }
        // Làm mới danh sách lịch hẹn và thống kê
        await Promise.all([
            loadDoctorAppointments(),
            loadDoctorDashboard()
        ]);
    } catch (error) {
        setPrescriptionMessage(
            error.message || "Không thể lưu đơn thuốc.",
            "error"
        );
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = oldHTML;
    }
}

document.addEventListener("DOMContentLoaded", function () {
    document
        .getElementById("prescriptionForm")
        ?.addEventListener("submit", submitPrescription);
    document
        .getElementById("rxAddItem")
        ?.addEventListener("click", function () {
            addMedicineRow();
        });
    document
        .querySelectorAll("[data-rx-close]")
        .forEach(function (button) {
            button.addEventListener("click", closePrescriptionModal);
        });
    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") closePrescriptionModal();
    });
});
/*
=====================================================
15C. BỘ LỌC LỊCH HẸN (lọc phía trình duyệt)
- Trạng thái (chip, có số lượng)
- Ngày khám
- Từ khóa: tên, số điện thoại, lý do (không phân biệt dấu)
=====================================================
*/

let doctorAppointmentsCache = [];
let appointmentStatusFilter = "ALL";

function removeDiacritics(value) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .toLowerCase();
}

function getAppointmentFilters() {
    return {
        status: appointmentStatusFilter,
        date:
            document.getElementById("filterAppointmentDate")?.value || "",
        keyword: removeDiacritics(
            (
                document.getElementById("filterAppointmentSearch")?.value ||
                ""
            ).trim()
        )
    };
}
// Kiểm tra ngày + từ khóa (trạng thái xử lý riêng để đếm số lượng chip)
function matchesDateAndKeyword(appointment, filters) {
    if (
        filters.date &&
        String(appointment.schedule_date || "").slice(0, 10) !==
            filters.date
    ) {
        return false;
    }
    if (filters.keyword) {
        const haystack = removeDiacritics(
            [
                appointment.patient_name,
                appointment.patient_phone,
                appointment.reason
            ].join(" ")
        );
        if (!haystack.includes(filters.keyword)) {
            return false;
        }
    }
    return true;
}

function applyAppointmentFilters() {
    const tbody = document.getElementById("appointmentTableBody");
    if (!tbody) return;
    const filters = getAppointmentFilters();
    const base = doctorAppointmentsCache.filter(function (appointment) {
        return matchesDateAndKeyword(appointment, filters);
    });
    // Số lượng trên từng chip (tính theo ngày + từ khóa đang lọc)
    const counts = {
        ALL: base.length,
        PENDING: 0,
        CONFIRMED: 0,
        COMPLETED: 0,
        CANCELLED: 0,
        NO_SHOW: 0
    };
    base.forEach(function (appointment) {
        const key = appointment.status || "PENDING";
        if (counts[key] !== undefined) counts[key]++;
    });
    document
        .querySelectorAll("[data-status-filter]")
        .forEach(function (button) {
            const key = button.dataset.statusFilter;
            const badge = button.querySelector(".filter-count");
            button.classList.toggle("active", key === filters.status);
            if (badge) badge.textContent = counts[key] ?? 0;
        });
    const filtered =
        filters.status === "ALL"
            ? base
            : base.filter(function (appointment) {
                  return (
                      (appointment.status || "PENDING") === filters.status
                  );
              });
    setText(
        "appointmentFilterSummary",
        `Hiển thị ${filtered.length} / ${doctorAppointmentsCache.length} lịch hẹn`
    );
    if (!filtered.length) {
        const hasFilter =
            filters.status !== "ALL" ||
            filters.date ||
            filters.keyword;
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="dashboard-loading">
                    ${
                        hasFilter
                            ? "Không có lịch hẹn nào khớp với bộ lọc."
                            : "Chưa có lịch hẹn."
                    }
                </td>
            </tr>
        `;
        return;
    }
    tbody.innerHTML = filtered.map(renderAppointmentRow).join("");
}

function resetAppointmentFilters() {
    appointmentStatusFilter = "ALL";
    const dateInput = document.getElementById("filterAppointmentDate");
    const searchInput = document.getElementById("filterAppointmentSearch");
    if (dateInput) dateInput.value = "";
    if (searchInput) searchInput.value = "";
    applyAppointmentFilters();
}

document.addEventListener("DOMContentLoaded", function () {
    document
        .querySelectorAll("[data-status-filter]")
        .forEach(function (button) {
            button.addEventListener("click", function () {
                appointmentStatusFilter = button.dataset.statusFilter;
                applyAppointmentFilters();
            });
        });
    document
        .getElementById("filterAppointmentDate")
        ?.addEventListener("change", applyAppointmentFilters);
    // Gõ tìm kiếm: đợi 200ms sau lần gõ cuối rồi mới lọc
    let searchTimer = null;
    document
        .getElementById("filterAppointmentSearch")
        ?.addEventListener("input", function () {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(applyAppointmentFilters, 200);
        });
    document
        .getElementById("filterAppointmentToday")
        ?.addEventListener("click", function () {
            const now = new Date();
            document.getElementById("filterAppointmentDate").value = [
                now.getFullYear(),
                String(now.getMonth() + 1).padStart(2, "0"),
                String(now.getDate()).padStart(2, "0")
            ].join("-");
            applyAppointmentFilters();
        });
    document
        .getElementById("filterAppointmentReset")
        ?.addEventListener("click", resetAppointmentFilters);
});
/*
=====================================================
16. FORMAT NGÀY / GIỜ
=====================================================
*/

function formatDate(value) {
    if (!value) return "";
    const text = String(value).slice(0, 10);
    const parts = text.split("-");
    if (parts.length !== 3) return String(value);
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatTime(value) {
    if (!value) return "";
    return String(value).slice(0, 5);
}
/*
=====================================================
17. DỊCH TRẠNG THÁI
=====================================================
*/

function translateAppointmentStatus(status) {
    const map = {
        PENDING: "Chờ xác nhận",
        CONFIRMED: "Đã xác nhận",
        COMPLETED: "Đã hoàn thành",
        CANCELLED: "Đã hủy",
        NO_SHOW: "Không đến"
    };
    return map[status] || status || "Chưa xác định";
}
/*
=====================================================
18. ESCAPE HTML
=====================================================
*/

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (char) {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };
        return entities[char];
    });
}
/*
=====================================================
19. HIỂN THỊ THÔNG BÁO
=====================================================
*/

function showDashboardMessage(element, message, type) {
    if (!element) return;
    element.className = `dashboard-message ${type}`;
    element.textContent = message;
    setTimeout(function () {
        element.textContent = "";
        element.className = "dashboard-message";
    }, 4000);
}
/*
=====================================================
20. EXPORT HÀM CHO CÁC NÚT ONCLICK
=====================================================
*/

window.toggleDoctorSchedule = toggleDoctorSchedule;
window.deleteDoctorSchedule = deleteDoctorSchedule;
window.updateAppointment = updateAppointment;
window.recordPatientArrival = recordPatientArrival;
window.completeAppointment = completeAppointment;
window.openPrescriptionModal = openPrescriptionModal;
window.showToast = showToast;
window.confirmDialog = confirmDialog;