/*
=====================================================
DOCTOR DASHBOARD - CLINIC BOOKING
=====================================================
Chức năng:
1. Kiểm tra session bác sĩ
2. Hiển thị thông tin và thống kê dashboard
3. Tạo lịch làm việc theo 4 ca
4. Thống kê lịch làm việc theo tuần
5. Lọc lịch làm việc theo trạng thái và ca
6. Đóng/mở và xóa lịch làm việc
7. Thống kê lịch hẹn theo tuần
8. Lọc lịch hẹn theo tuần, trạng thái, ngày, ca
9. Tìm kiếm lịch hẹn theo thông tin bệnh nhân
10. Xác nhận/hủy lịch hẹn
11. Ghi nhận bệnh nhân đến hoặc không đến
12. Hoàn thành khám
13. Kê đơn thuốc
=====================================================
*/
/* =====================================================
   1. CẤU HÌNH VÀ BIẾN TOÀN CỤC
===================================================== */

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

const APPOINTMENT_STATUSES = [
    "PENDING",
    "CONFIRMED",
    "COMPLETED",
    "CANCELLED",
    "NO_SHOW"
];

let doctorSchedulesCache = [];
let doctorAppointmentsCache = [];

let scheduleWeekOffset = 0;
let appointmentWeekOffset = 0;

let scheduleStatusFilter = "ALL";
let scheduleShiftFilter = "ALL";

let appointmentStatusFilter = "ALL";
let appointmentShiftFilter = "ALL";

let currentPrescriptionAppointmentId = null;
let currentPrescriptionExists = false;
let currentPrescriptionAppointmentStatus = null;
/* =====================================================
   2. KHỞI TẠO DASHBOARD
===================================================== */

document.addEventListener("DOMContentLoaded", async function () {
    bindDashboardEvents();
    initializeDateInput();
    initializeWeeklyFilters();
    const sessionValid = await checkDoctorSession();
    if (!sessionValid) return;
    await loadDoctorDashboard();
    await Promise.all([
        loadDoctorSchedules(),
        loadDoctorAppointments()
    ]);
});
/* =====================================================
   3. GẮN SỰ KIỆN
===================================================== */

function bindDashboardEvents() {
    document
        .getElementById("createScheduleForm")
        ?.addEventListener("submit", createDoctorSchedule);
    document
        .getElementById("refreshSchedules")
        ?.addEventListener("click", loadDoctorSchedules);
    document
        .getElementById("refreshAppointments")
        ?.addEventListener("click", loadDoctorAppointments);
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
    document
        .getElementById("filterAppointmentSearch")
        ?.addEventListener("input", applyAppointmentFilters);
    document
        .getElementById("filterAppointmentToday")
        ?.addEventListener("click", filterAppointmentsToday);
    document
        .getElementById("filterAppointmentReset")
        ?.addEventListener("click", resetAppointmentFilters);
    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            closePrescriptionModal();
        }
    });
    document
        .getElementById("schedulePreviousWeek")
        ?.addEventListener("click", function () {
            scheduleWeekOffset--;
            applyScheduleFilters();
        });
    document
        .getElementById("scheduleNextWeek")
        ?.addEventListener("click", function () {
            scheduleWeekOffset++;
            applyScheduleFilters();
        });
    document
        .getElementById("scheduleCurrentWeek")
        ?.addEventListener("click", function () {
            scheduleWeekOffset = 0;
            applyScheduleFilters();
        });
    document
        .getElementById("scheduleStatusFilter")
        ?.addEventListener("change", function () {
            scheduleStatusFilter = this.value;
            applyScheduleFilters();
        });
    document
        .getElementById("scheduleShiftFilter")
        ?.addEventListener("change", function () {
            scheduleShiftFilter = this.value;
            applyScheduleFilters();
        });
    document
        .getElementById("appointmentPreviousWeek")
        ?.addEventListener("click", function () {
            appointmentWeekOffset--;
            applyAppointmentFilters();
        });
    document
        .getElementById("appointmentNextWeek")
        ?.addEventListener("click", function () {
            appointmentWeekOffset++;
            applyAppointmentFilters();
        });
    document
        .getElementById("appointmentCurrentWeek")
        ?.addEventListener("click", function () {
            appointmentWeekOffset = 0;
            applyAppointmentFilters();
        });
    document
        .getElementById("appointmentShiftFilter")
        ?.addEventListener("change", function () {
            appointmentShiftFilter = this.value;
            applyAppointmentFilters();
        });
    document
        .getElementById("prescriptionModal")
        ?.addEventListener("click", function (event) {
            if (event.target === this) {
                closePrescriptionModal();
            }
        });
}

function initializeDateInput() {
    const input = document.getElementById("scheduleDate");
    if (input) {
        input.min = getLocalDateString(new Date());
    }
}

function initializeWeeklyFilters() {
    const scheduleStatus = document.getElementById(
        "scheduleStatusFilter"
    );
    const scheduleShift = document.getElementById(
        "scheduleShiftFilter"
    );
    const appointmentShift = document.getElementById(
        "appointmentShiftFilter"
    );
    if (scheduleStatus) {
        scheduleStatus.value = scheduleStatusFilter;
    }
    if (scheduleShift) {
        scheduleShift.value = scheduleShiftFilter;
    }
    if (appointmentShift) {
        appointmentShift.value = appointmentShiftFilter;
    }
}
/* =====================================================
   4. TOAST VÀ HỘP XÁC NHẬN
===================================================== */

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
        Object.assign(host.style, {
            position: "fixed",
            top: "20px",
            right: "20px",
            zIndex: "3000",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            width: "min(380px, calc(100vw - 32px))"
        });
        document.body.appendChild(host);
    }
    const toast = document.createElement("div");
    toast.className = `dash-toast ${kind}`;
    Object.assign(toast.style, {
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        padding: "13px",
        border: "1px solid #e2e8f0",
        borderLeft: `4px solid ${
            kind === "success" ? "#16a34a" :
            kind === "error" ? "#dc2626" :
            kind === "warning" ? "#d97706" : "#0b8178"
        }`,
        borderRadius: "12px",
        background: "#fff",
        color: "#0f172a",
        boxShadow: "0 12px 30px rgba(15,23,42,.16)",
        fontSize: "14px"
    });
    const icon = document.createElement("i");
    icon.className = `fa-solid ${icons[kind]}`;
    const text = document.createElement("div");
    text.textContent = String(message ?? "");
    text.style.flex = "1";
    const close = document.createElement("button");
    close.type = "button";
    close.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    close.style.border = "0";
    close.style.background = "transparent";
    close.style.cursor = "pointer";
    toast.append(icon, text, close);
    host.appendChild(toast);
    let removed = false;
    function removeToast() {
        if (removed) return;
        removed = true;
        toast.remove();
    }
    close.addEventListener("click", removeToast);
    setTimeout(
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
        const overlay = document.createElement("div");
        Object.assign(overlay.style, {
            position: "fixed",
            inset: "0",
            zIndex: "4000",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
            background: "rgba(15,23,42,.55)"
        });
        const box = document.createElement("div");
        Object.assign(box.style, {
            width: "100%",
            maxWidth: "400px",
            padding: "22px",
            borderRadius: "16px",
            background: "#fff",
            boxShadow: "0 24px 60px rgba(15,23,42,.28)"
        });
        const heading = document.createElement("h4");
        heading.textContent = title;
        const body = document.createElement("p");
        body.textContent = String(message ?? "");
        const actions = document.createElement("div");
        Object.assign(actions.style, {
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
            marginTop: "20px"
        });
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "btn btn-outline";
        cancel.textContent = cancelText;
        const confirm = document.createElement("button");
        confirm.type = "button";
        confirm.className = "btn btn-primary";
        confirm.textContent = confirmText;
        if (danger) {
            confirm.style.background = "#dc2626";
            confirm.style.borderColor = "#dc2626";
            confirm.style.color = "#fff";
        }
        actions.append(cancel, confirm);
        box.append(heading, body, actions);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        function finish(result) {
            overlay.remove();
            resolve(result);
        }
        cancel.addEventListener("click", function () {
            finish(false);
        });
        confirm.addEventListener("click", function () {
            finish(true);
        });
        overlay.addEventListener("click", function (event) {
            if (event.target === overlay) {
                finish(false);
            }
        });
        const onKeyDown = function (event) {
            if (event.key === "Escape") {
                document.removeEventListener("keydown", onKeyDown);
                finish(false);
            }
        };
        document.addEventListener("keydown", onKeyDown);
        (danger ? cancel : confirm).focus();
    });
}
/* =====================================================
   5. API HELPER
===================================================== */

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
/* =====================================================
   6. KIỂM TRA SESSION
===================================================== */

async function checkDoctorSession() {
    try {
        const result = await dashboardFetch("/api/session");
        if (!result.success || !result.user) {
            window.location.href = "login.html";
            return false;
        }
        if (result.user.role !== "DOCTOR") {
            showToast(
                "Bạn không có quyền truy cập trang bác sĩ.",
                "error"
            );
            setTimeout(function () {
                window.location.href = "home.html";
            }, 1500);
            return false;
        }
        const name = result.user.full_name || "Bác sĩ";
        setText("doctorName", `BS. ${name}`);
        setText("welcomeUser", `BS. ${name}`);
        return true;
    } catch (error) {
        window.location.href = "login.html";
        return false;
    }
}
/* =====================================================
   7. DASHBOARD THỐNG KÊ TỔNG QUAN
===================================================== */

async function loadDoctorDashboard() {
    try {
        const result = await dashboardFetch(
            "/api/doctors/me/dashboard"
        );
        const data = result.data || result;
        const doctor = data.doctor || {};
        const statistics = data.statistics || {};
        if (doctor.full_name) {
            setText("doctorName", `BS. ${doctor.full_name}`);
            setText("welcomeUser", `BS. ${doctor.full_name}`);
        }
        setText(
            "doctorSpecialty",
            doctor.specialty_name || "Bác sĩ"
        );
        setText(
            "todayScheduleCount",
            statistics.todaySchedules ?? 0
        );
        setText(
            "appointmentCount",
            statistics.appointments ?? 0
        );
        setText(
            "pendingCount",
            statistics.pending ?? 0
        );
        setText(
            "completedCount",
            statistics.completed ?? 0
        );
    } catch (error) {
        showToast(
            error.message || "Không tải được thống kê dashboard.",
            "error"
        );
    }
}
/* =====================================================
   8. TẠO LỊCH LÀM VIỆC
POST /api/schedules
===================================================== */

async function createDoctorSchedule(event) {
    event.preventDefault();
    const form = document.getElementById("createScheduleForm");
    const message = document.getElementById("scheduleMessage");
    const submitButton = form?.querySelector(
        'button[type="submit"]'
    );
    const date = document.getElementById("scheduleDate")?.value || "";
    const selectedShift = document.querySelector(
        'input[name="shift_type"]:checked'
    );
    const shiftType = selectedShift?.value || "";
    if (!date) {
        showDashboardMessage(
            message,
            "Vui lòng chọn ngày làm việc.",
            "error"
        );
        return;
    }
    if (!shiftType || !SHIFT_CONFIG[shiftType]) {
        showDashboardMessage(
            message,
            "Vui lòng chọn ca làm việc hợp lệ.",
            "error"
        );
        return;
    }
    if (date < getLocalDateString(new Date())) {
        showDashboardMessage(
            message,
            "Không thể đăng ký lịch trong quá khứ.",
            "error"
        );
        return;
    }
    const oldHTML = submitButton?.innerHTML;
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
            submitButton.innerHTML = oldHTML;
        }
    }
}
/* =====================================================
   9. TẢI VÀ CHUẨN HÓA LỊCH LÀM VIỆC
GET /api/schedules/my
===================================================== */

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
        doctorSchedulesCache = normalizeSchedules(result);
        applyScheduleFilters();
    } catch (error) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="dashboard-loading">
                    Không thể tải lịch làm việc.
                </td>
            </tr>
        `;
        showToast(
            error.message || "Không thể tải lịch làm việc.",
            "error"
        );
    }
}

function normalizeSchedules(result) {
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.data)) {
        return result.data;
    }
    if (Array.isArray(result?.schedules)) {
        return result.schedules;
    }
    if (Array.isArray(result?.data?.schedules)) {
        return result.data.schedules;
    }
    return [];
}
/* =====================================================
   10. HIỂN THỊ MỘT DÒNG LỊCH LÀM VIỆC
===================================================== */

function renderScheduleRow(schedule) {
    const status = schedule.status || "AVAILABLE";
    const isAvailable = status === "AVAILABLE";
    const shiftType = schedule.shift_type || "";
    const shift = SHIFT_CONFIG[shiftType] || {};
    const shiftName =
        schedule.shift_name ||
        shift.name ||
        shiftType ||
        "Chưa xác định";
    const start =
        schedule.display_start ||
        (schedule.start_time
            ? formatTime(schedule.start_time)
            : shift.start || "");
    const end =
        schedule.display_end ||
        (schedule.end_time
            ? formatTime(schedule.end_time)
            : shift.end || "");
    const statusText = isAvailable ? "Đang mở" : "Đã đóng";
    const statusClass = isAvailable ? "available" : "closed";
    const approvalStatus = schedule.approval_status || "";
    let approvalText = "";
    if (approvalStatus === "PENDING") {
        approvalText = " · Chờ duyệt";
    } else if (approvalStatus === "REJECTED") {
        approvalText = " · Bị từ chối";
    }
    const id = Number(schedule.id);
    const date = String(schedule.schedule_date || "").slice(0, 10);
    return `
        <tr>
            <td>${escapeHTML(formatDate(date))}</td>
            <td>
                <span style="display:inline-flex;align-items:center;gap:7px;font-weight:600">
                    <i class="fa-solid ${escapeHTML(shift.icon || "fa-clock")}"
                       style="color:var(--primary-deep,#0b5f59)"></i>
                    ${escapeHTML(shiftName)}
                </span>
            </td>
            <td>${escapeHTML(`${start} - ${end}`)}</td>
            <td>
                <span class="dashboard-status ${statusClass}">
                    ${statusText}${escapeHTML(approvalText)}
                </span>
            </td>
            <td>
                <div class="dashboard-actions">
                    <button
                        type="button"
                        class="btn btn-outline"
                        onclick="toggleDoctorSchedule(
                            ${id},
                            '${isAvailable ? "AVAILABLE" : "CLOSED"}',
                            '${escapeHTML(date)}',
                            '${escapeHTML(shiftType)}'
                        )"
                    >
                        ${isAvailable ? "Đóng lịch" : "Mở lịch"}
                    </button>
                    <button
                        type="button"
                        class="btn btn-outline"
                        onclick="deleteDoctorSchedule(${id})"
                    >
                        <i class="fa-solid fa-trash"></i> Xóa
                    </button>
                </div>
            </td>
        </tr>
    `;
}
/* =====================================================
   11. ĐÓNG / MỞ LỊCH
PUT /api/schedules/:id
===================================================== */

async function toggleDoctorSchedule(
    scheduleId,
    currentStatus,
    scheduleDate,
    shiftType
) {
    const id = Number(scheduleId);
    if (!Number.isInteger(id) || id <= 0) {
        showToast("ID lịch làm việc không hợp lệ.", "error");
        return;
    }
    const newStatus = currentStatus === "AVAILABLE"
        ? "CLOSED"
        : "AVAILABLE";
    try {
        const result = await dashboardFetch(
            `/api/schedules/${id}`,
            {
                method: "PUT",
                body: JSON.stringify({
                    schedule_date: scheduleDate,
                    shift_type: shiftType,
                    status: newStatus
                })
            }
        );
        showToast(
            result.message || "Đã cập nhật lịch làm việc.",
            "success"
        );
        await Promise.all([
            loadDoctorSchedules(),
            loadDoctorDashboard()
        ]);
    } catch (error) {
        showToast(
            error.message || "Không thể cập nhật lịch.",
            "error"
        );
    }
}
/* =====================================================
   12. XÓA LỊCH
DELETE /api/schedules/:id
===================================================== */

async function deleteDoctorSchedule(scheduleId) {
    const id = Number(scheduleId);
    if (!Number.isInteger(id) || id <= 0) {
        showToast("ID lịch làm việc không hợp lệ.", "error");
        return;
    }
    const confirmed = await confirmDialog(
        "Bạn có chắc chắn muốn xóa lịch làm việc này?",
        {
            title: "Xóa lịch làm việc",
            confirmText: "Xóa",
            danger: true
        }
    );
    if (!confirmed) return;
    try {
        const result = await dashboardFetch(
            `/api/schedules/${id}`,
            { method: "DELETE" }
        );
        showToast(
            result.message || "Đã xóa lịch làm việc.",
            "success"
        );
        await Promise.all([
            loadDoctorSchedules(),
            loadDoctorDashboard()
        ]);
    } catch (error) {
        showToast(
            error.message || "Không thể xóa lịch làm việc.",
            "error"
        );
    }
}
/* =====================================================
   13. LỌC LỊCH LÀM VIỆC THEO TUẦN
===================================================== */

function applyScheduleFilters() {
    const tbody = document.getElementById("scheduleTableBody");
    if (!tbody) return;
    const range = getWeekRange(scheduleWeekOffset);
    const weeklySchedules = doctorSchedulesCache.filter(
        schedule => isDateInWeek(schedule.schedule_date, range)
    );
    const availableCount = weeklySchedules.filter(
        schedule => schedule.status === "AVAILABLE"
    ).length;
    const closedCount = weeklySchedules.filter(
        schedule => schedule.status === "CLOSED"
    ).length;
    const days = new Set(
        weeklySchedules.map(schedule =>
            String(schedule.schedule_date || "").slice(0, 10)
        )
    );
    setText("scheduleWeekTotal", weeklySchedules.length);
    setText("scheduleWeekAvailable", availableCount);
    setText("scheduleWeekClosed", closedCount);
    setText("scheduleWeekDays", days.size);
    setText(
        "scheduleWeekLabel",
        getWeekLabel(scheduleWeekOffset)
    );
    const filtered = weeklySchedules.filter(function (schedule) {
        const status = schedule.status || "AVAILABLE";
        const shift = schedule.shift_type || "";
        const matchStatus =
            scheduleStatusFilter === "ALL" ||
            status === scheduleStatusFilter;
        const matchShift =
            scheduleShiftFilter === "ALL" ||
            shift === scheduleShiftFilter;
        return matchStatus && matchShift;
    });
    setText(
        "scheduleWeekSummary",
        `Hiển thị ${filtered.length} / ${weeklySchedules.length} ca trong tuần`
    );
    if (!filtered.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="dashboard-loading">
                    ${
                        weeklySchedules.length
                            ? "Không có lịch làm việc phù hợp với bộ lọc."
                            : "Không có lịch làm việc trong tuần này."
                    }
                </td>
            </tr>
        `;
        return;
    }
    filtered.sort(function (a, b) {
        const dateCompare = String(a.schedule_date || "").localeCompare(
            String(b.schedule_date || "")
        );
        if (dateCompare !== 0) return dateCompare;
        return String(a.shift_type || "").localeCompare(
            String(b.shift_type || "")
        );
    });
    tbody.innerHTML = filtered.map(renderScheduleRow).join("");
}
/* =====================================================
   14. TẢI LỊCH HẸN BỆNH NHÂN
GET /api/doctors/me/appointments
===================================================== */

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
        const result = await dashboardFetch(
            "/api/doctors/me/appointments"
        );
        doctorAppointmentsCache = normalizeAppointments(result);
        applyAppointmentFilters();
    } catch (error) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="dashboard-loading">
                    Không thể tải lịch hẹn.
                </td>
            </tr>
        `;
        showToast(
            error.message || "Không thể tải lịch hẹn.",
            "error"
        );
    }
}

function normalizeAppointments(result) {
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.data)) {
        return result.data;
    }
    if (Array.isArray(result?.appointments)) {
        return result.appointments;
    }
    if (Array.isArray(result?.data?.appointments)) {
        return result.data.appointments;
    }
    return [];
}
/* =====================================================
   15. HIỂN THỊ MỘT DÒNG LỊCH HẸN
===================================================== */

function renderAppointmentRow(appointment) {
    const status = appointment.status || "PENDING";
    const statusClass = status
        .toLowerCase()
        .replace(/_/g, "-");
    return `
        <tr>
            <td>
                <strong>
                    ${escapeHTML(
                        appointment.patient_name || "Chưa cập nhật"
                    )}
                </strong>
                ${
                    appointment.patient_phone
                        ? `<br><small>${escapeHTML(
                            appointment.patient_phone
                        )}</small>`
                        : ""
                }
            </td>
            <td>
                ${escapeHTML(formatDate(appointment.schedule_date))}
            </td>
            <td>
                ${escapeHTML(formatTime(appointment.appointment_time))}
            </td>
            <td>
                ${escapeHTML(appointment.reason || "Không có")}
            </td>
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
/* =====================================================
   16. CÁC NÚT XỬ LÝ LỊCH HẸN
===================================================== */

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
        return "<span>Đã hủy</span>";
    }
    if (status === "NO_SHOW") {
        return "<span>Không đến</span>";
    }
    return "-";
}
/* =====================================================
   17. XÁC NHẬN / HỦY / KHÔNG ĐẾN
===================================================== */

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
    if (status === "CANCELLED") {
        const confirmed = await confirmDialog(
            "Bạn có chắc chắn muốn hủy lịch hẹn này?",
            {
                title: "Hủy lịch hẹn",
                confirmText: "Hủy lịch",
                cancelText: "Không",
                danger: true
            }
        );
        if (!confirmed) return;
    }
    if (status === "NO_SHOW") {
        const confirmed = await confirmDialog(
            "Xác nhận bệnh nhân không đến khám?",
            {
                title: "Bệnh nhân không đến",
                confirmText: "Xác nhận",
                danger: true
            }
        );
        if (!confirmed) return;
    }
    try {
        const result = await dashboardFetch(endpoint, {
            method: "POST"
        });
        showToast(
            result.message || "Cập nhật lịch hẹn thành công.",
            "success"
        );
        await Promise.all([
            loadDoctorAppointments(),
            loadDoctorDashboard()
        ]);
    } catch (error) {
        showToast(
            error.message || "Không thể cập nhật lịch hẹn.",
            "error"
        );
    }
}
/* =====================================================
   18. GHI NHẬN BỆNH NHÂN ĐẾN KHÁM
POST /api/appointments/:id/arrival
===================================================== */

async function recordPatientArrival(appointmentId) {
    const id = Number(appointmentId);
    if (!Number.isInteger(id) || id <= 0) {
        showToast("ID lịch hẹn không hợp lệ.", "error");
        return;
    }
    const confirmed = await confirmDialog(
        "Xác nhận bệnh nhân đã đến khám?"
    );
    if (!confirmed) return;
    try {
        const result = await dashboardFetch(
            `/api/appointments/${id}/arrival`,
            { method: "POST" }
        );
        showToast(
            result.message || "Đã ghi nhận bệnh nhân đến khám.",
            "success"
        );
        await Promise.all([
            loadDoctorAppointments(),
            loadDoctorDashboard()
        ]);
    } catch (error) {
        showToast(
            error.message || "Không thể ghi nhận bệnh nhân đến khám.",
            "error"
        );
    }
}
/* =====================================================
   19. HOÀN THÀNH KHÁM
POST /api/appointments/:id/complete
===================================================== */

async function completeAppointment(appointmentId) {
    const id = Number(appointmentId);
    if (!Number.isInteger(id) || id <= 0) {
        showToast("ID lịch hẹn không hợp lệ.", "error");
        return;
    }
    const confirmed = await confirmDialog(
        "Xác nhận hoàn thành cuộc khám này?"
    );
    if (!confirmed) return;
    try {
        const result = await dashboardFetch(
            `/api/appointments/${id}/complete`,
            { method: "POST" }
        );
        showToast(
            result.message || "Cuộc hẹn đã được đánh dấu hoàn thành.",
            "success"
        );
        await Promise.all([
            loadDoctorAppointments(),
            loadDoctorDashboard()
        ]);
    } catch (error) {
        showToast(
            error.message || "Không thể hoàn thành cuộc khám.",
            "error"
        );
    }
}
/* =====================================================
   20. KÊ ĐƠN THUỐC
===================================================== */

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
                <input type="text"
                       data-field="medicine_name"
                       maxlength="255"
                       placeholder="VD: Paracetamol 500mg"
                       value="${escapeHTML(item.medicine_name)}">
            </div>
            <div class="rx-field">
                <label>Liều dùng</label>
                <input type="text"
                       data-field="dosage"
                       maxlength="150"
                       placeholder="VD: 1 viên"
                       value="${escapeHTML(item.dosage)}">
            </div>
            <div class="rx-field">
                <label>Tần suất</label>
                <input type="text"
                       data-field="frequency"
                       maxlength="150"
                       placeholder="VD: 3 lần/ngày"
                       value="${escapeHTML(item.frequency)}">
            </div>
            <div class="rx-field">
                <label>Thời gian dùng</label>
                <input type="text"
                       data-field="duration"
                       maxlength="100"
                       placeholder="VD: 5 ngày"
                       value="${escapeHTML(item.duration)}">
            </div>
            <div class="rx-field">
                <label>Số lượng</label>
                <input type="text"
                       data-field="quantity"
                       maxlength="100"
                       placeholder="VD: 15 viên"
                       value="${escapeHTML(item.quantity)}">
            </div>
            <div class="rx-field rx-field-wide">
                <label>Hướng dẫn</label>
                <input type="text"
                       data-field="instructions"
                       maxlength="1000"
                       placeholder="VD: Uống sau ăn"
                       value="${escapeHTML(item.instructions)}">
            </div>
        </div>
        <button type="button"
                class="btn btn-outline rx-remove"
                title="Xóa thuốc này">
            <i class="fa-solid fa-trash"></i>
        </button>
    `;
    row.querySelector(".rx-remove").addEventListener(
        "click",
        function () {
            const list = document.getElementById("rxItems");
            if (list.children.length <= 1) {
                showToast(
                    "Đơn thuốc phải có ít nhất một loại thuốc.",
                    "error"
                );
                return;
            }
            row.remove();
        }
    );
    return row;
}

function addMedicineRow(item) {
    const list = document.getElementById("rxItems");
    if (!list) return;
    if (list.children.length >= 30) {
        showToast(
            "Một đơn thuốc tối đa 30 loại thuốc.",
            "error"
        );
        return;
    }
    list.appendChild(renderMedicineRow(item));
}

function setPrescriptionMessage(message, type) {
    const element = document.getElementById("rxMessage");
    if (!element) return;
    element.textContent = message || "";
    element.className = message
        ? `rx-message ${type || ""}`
        : "rx-message";
}

function closePrescriptionModal() {
    document
        .getElementById("prescriptionModal")
        ?.classList.remove("open");
    document.body.style.overflow = "";
    currentPrescriptionAppointmentId = null;
    currentPrescriptionExists = false;
    currentPrescriptionAppointmentStatus = null;
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
            currentPrescriptionExists
                ? "Sửa đơn thuốc"
                : "Kê đơn thuốc";
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
        row.querySelectorAll("[data-field]").forEach(
            function (input) {
                item[input.dataset.field] = input.value.trim();
            }
        );
        return item;
    });
}

async function submitPrescription(event) {
    event.preventDefault();
    const id = currentPrescriptionAppointmentId;
    if (!id) return;
    const diagnosis = document
        .getElementById("rxDiagnosis")
        .value.trim();
    if (!diagnosis) {
        setPrescriptionMessage(
            "Vui lòng nhập chẩn đoán.",
            "error"
        );
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
        const canComplete =
            currentPrescriptionAppointmentStatus === "CONFIRMED";
        closePrescriptionModal();
        showToast(
            result.message || "Đã lưu đơn thuốc.",
            "success"
        );
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
/* =====================================================
   21. THỐNG KÊ VÀ LỌC LỊCH HẸN THEO TUẦN
===================================================== */

function updateAppointmentWeeklyStatistics(appointments) {
    const counts = {
        PENDING: 0,
        CONFIRMED: 0,
        COMPLETED: 0,
        CANCELLED: 0,
        NO_SHOW: 0
    };
    appointments.forEach(function (appointment) {
        const status = appointment.status || "PENDING";
        if (counts[status] !== undefined) {
            counts[status]++;
        }
    });
    setText("appointmentWeekTotal", appointments.length);
    setText("appointmentWeekPending", counts.PENDING);
    setText("appointmentWeekConfirmed", counts.CONFIRMED);
    setText("appointmentWeekCompleted", counts.COMPLETED);
    setText("appointmentWeekCancelled", counts.CANCELLED);
    setText("appointmentWeekNoShow", counts.NO_SHOW);
    setText(
        "appointmentWeekLabel",
        getWeekLabel(appointmentWeekOffset)
    );
}

function getAppointmentFilters() {
    return {
        date: document.getElementById(
            "filterAppointmentDate"
        )?.value || "",
        keyword: removeDiacritics(
            document.getElementById(
                "filterAppointmentSearch"
            )?.value.trim() || ""
        )
    };
}

function matchesAppointmentSearch(appointment, filters) {
    if (
        filters.date &&
        String(appointment.schedule_date || "").slice(0, 10) !==
            filters.date
    ) {
        return false;
    }
    if (filters.keyword) {
        const haystack = removeDiacritics([
            appointment.patient_name,
            appointment.patient_phone,
            appointment.reason
        ].join(" "));
        if (!haystack.includes(filters.keyword)) {
            return false;
        }
    }
    return true;
}

function applyAppointmentFilters() {
    const tbody = document.getElementById("appointmentTableBody");
    if (!tbody) return;
    const range = getWeekRange(appointmentWeekOffset);
    const weeklyAppointments = doctorAppointmentsCache.filter(
        appointment =>
            isDateInWeek(appointment.schedule_date, range)
    );
    updateAppointmentWeeklyStatistics(weeklyAppointments);
    const filters = getAppointmentFilters();
    const base = weeklyAppointments.filter(
        appointment =>
            matchesAppointmentSearch(appointment, filters)
    );
    const counts = {
        ALL: base.length,
        PENDING: 0,
        CONFIRMED: 0,
        COMPLETED: 0,
        CANCELLED: 0,
        NO_SHOW: 0
    };
    base.forEach(function (appointment) {
        const status = appointment.status || "PENDING";
        if (counts[status] !== undefined) {
            counts[status]++;
        }
    });
    document
        .querySelectorAll("[data-status-filter]")
        .forEach(function (button) {
            const key = button.dataset.statusFilter;
            const badge = button.querySelector(".filter-count");
            button.classList.toggle(
                "active",
                key === appointmentStatusFilter
            );
            if (badge) {
                badge.textContent = counts[key] ?? 0;
            }
        });
    const filtered = base.filter(function (appointment) {
        const status = appointment.status || "PENDING";
        const matchStatus =
            appointmentStatusFilter === "ALL" ||
            status === appointmentStatusFilter;
        const shift = getShiftFromTime(
            appointment.appointment_time
        );
        const matchShift =
            appointmentShiftFilter === "ALL" ||
            shift === appointmentShiftFilter;
        return matchStatus && matchShift;
    });
    filtered.sort(function (a, b) {
        const dateCompare = String(a.schedule_date || "").localeCompare(
            String(b.schedule_date || "")
        );
        if (dateCompare !== 0) return dateCompare;
        return String(a.appointment_time || "").localeCompare(
            String(b.appointment_time || "")
        );
    });
    setText(
        "appointmentFilterSummary",
        `Hiển thị ${filtered.length} / ${weeklyAppointments.length} lịch hẹn trong tuần`
    );
    if (!filtered.length) {
        const hasFilter =
            appointmentStatusFilter !== "ALL" ||
            appointmentShiftFilter !== "ALL" ||
            filters.date ||
            filters.keyword;
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="dashboard-loading">
                    ${
                        hasFilter
                            ? "Không có lịch hẹn phù hợp với bộ lọc."
                            : "Không có lịch hẹn trong tuần này."
                    }
                </td>
            </tr>
        `;
        return;
    }
    tbody.innerHTML = filtered
        .map(renderAppointmentRow)
        .join("");
}

function filterAppointmentsToday() {
    const input = document.getElementById(
        "filterAppointmentDate"
    );
    if (!input) return;
    const today = new Date();
    input.value = getLocalDateString(today);
    /*
       Nếu ngày hôm nay nằm ngoài tuần đang xem,
       tự động chuyển về tuần hiện tại.
    */
    appointmentWeekOffset = 0;
    applyAppointmentFilters();
}

function resetAppointmentFilters() {
    appointmentStatusFilter = "ALL";
    appointmentShiftFilter = "ALL";
    appointmentWeekOffset = 0;
    const dateInput = document.getElementById(
        "filterAppointmentDate"
    );
    const searchInput = document.getElementById(
        "filterAppointmentSearch"
    );
    const shiftInput = document.getElementById(
        "appointmentShiftFilter"
    );
    if (dateInput) dateInput.value = "";
    if (searchInput) searchInput.value = "";
    if (shiftInput) shiftInput.value = "ALL";
    applyAppointmentFilters();
}
/* =====================================================
   22. HÀM XỬ LÝ NGÀY VÀ TUẦN
===================================================== */

function getLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1)
        .padStart(2, "0");
    const day = String(date.getDate())
        .padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function parseLocalDate(value) {
    if (!value) return null;
    const parts = String(value)
        .slice(0, 10)
        .split("-");
    if (parts.length !== 3) return null;
    const date = new Date(
        Number(parts[0]),
        Number(parts[1]) - 1,
        Number(parts[2])
    );
    if (Number.isNaN(date.getTime())) return null;
    return date;
}

function getWeekRange(offset = 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monday = new Date(today);
    const day = monday.getDay();
    monday.setDate(
        monday.getDate() - (day === 0 ? 6 : day - 1)
    );
    monday.setDate(
        monday.getDate() + offset * 7
    );
    const sunday = new Date(monday);
    sunday.setDate(
        sunday.getDate() + 6
    );
    return {
        start: getLocalDateString(monday),
        end: getLocalDateString(sunday)
    };
}

function isDateInWeek(dateValue, range) {
    const date = String(dateValue || "").slice(0, 10);
    return date >= range.start && date <= range.end;
}

function getWeekLabel(offset) {
    const range = getWeekRange(offset);
    return `${formatDate(range.start)} - ${formatDate(range.end)}`;
}
/* =====================================================
   23. XÁC ĐỊNH CA LÀM VIỆC TỪ GIỜ HẸN
===================================================== */

function getShiftFromTime(timeValue) {
    const time = String(timeValue || "").slice(0, 5);
    const hour = Number(time.split(":")[0]);
    if (!Number.isFinite(hour)) return "";
    if (hour >= 0 && hour < 6) return "NIGHT";
    if (hour >= 6 && hour < 12) return "MORNING";
    if (hour >= 12 && hour < 18) return "AFTERNOON";
    return "EVENING";
}
/* =====================================================
   24. HÀM TIỆN ÍCH
===================================================== */

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value ?? "";
    }
}

function formatDate(value) {
    if (!value) return "";
    const text = String(value).slice(0, 10);
    const parts = text.split("-");
    if (parts.length !== 3) {
        return String(value);
    }
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatTime(value) {
    if (!value) return "";
    return String(value).slice(0, 5);
}

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

function removeDiacritics(value) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .toLowerCase();
}

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

function showDashboardMessage(element, message, type) {
    if (!element) return;
    element.className = `dashboard-message ${type || ""}`;
    element.textContent = message;
    setTimeout(function () {
        element.textContent = "";
        element.className = "dashboard-message";
    }, 4000);
}
/* =====================================================
   25. EXPORT CÁC HÀM CHO HTML
===================================================== */

window.toggleDoctorSchedule = toggleDoctorSchedule;
window.deleteDoctorSchedule = deleteDoctorSchedule;

window.updateAppointment = updateAppointment;
window.recordPatientArrival = recordPatientArrival;
window.completeAppointment = completeAppointment;

window.openPrescriptionModal = openPrescriptionModal;

window.showToast = showToast;
window.confirmDialog = confirmDialog;