
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
            alert("Bạn không có quyền truy cập trang bác sĩ.");
            window.location.href = "home.html";
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
        console.error("CHECK DOCTOR SESSION ERROR:", error);
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
        console.warn("Không tải được dashboard API:", error);
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
        console.error("CREATE SCHEDULE ERROR:", error);

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
        console.error("LOAD DOCTOR SCHEDULES ERROR:", error);

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

        alert(result.message || "Đã cập nhật lịch làm việc.");

        await Promise.all([
            loadDoctorSchedules(),
            loadDoctorDashboard()
        ]);
    } catch (error) {
        console.error("TOGGLE SCHEDULE ERROR:", error);
        alert(error.message || "Không thể cập nhật lịch.");
    }
}

/*
=====================================================
9. XÓA LỊCH
DELETE /api/schedules/:id
=====================================================
*/

async function deleteDoctorSchedule(scheduleId) {
    if (!confirm("Bạn có chắc chắn muốn xóa lịch làm việc này?")) {
        return;
    }

    try {
        const result = await dashboardFetch(
            `/api/schedules/${Number(scheduleId)}`,
            { method: "DELETE" }
        );

        alert(result.message || "Đã xóa lịch làm việc.");

        await Promise.all([
            loadDoctorSchedules(),
            loadDoctorDashboard()
        ]);
    } catch (error) {
        console.error("DELETE SCHEDULE ERROR:", error);
        alert(error.message || "Không thể xóa lịch làm việc.");
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
        const appointments = normalizeAppointments(result);

        if (!appointments.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="dashboard-loading">
                        Chưa có lịch hẹn.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = appointments.map(renderAppointmentRow).join("");
    } catch (error) {
        console.error("LOAD DOCTOR APPOINTMENTS ERROR:", error);

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
                    disabled
                >
                    Đã ghi nhận đến
                </button>
            </div>
        `;
    }

    if (status === "COMPLETED") {
        return '<span>Đã hoàn thành</span>';
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
        alert("ID lịch hẹn không hợp lệ.");
        return;
    }

    const endpointMap = {
        CONFIRMED: `/api/appointments/${id}/confirm`,
        CANCELLED: `/api/appointments/${id}/cancel`,
        NO_SHOW: `/api/appointments/${id}/no-show`
    };

    const endpoint = endpointMap[status];

    if (!endpoint) {
        alert("Trạng thái lịch hẹn không hợp lệ.");
        return;
    }

    if (status === "CANCELLED" &&
        !confirm("Bạn có chắc chắn muốn hủy lịch hẹn này?")) {
        return;
    }

    if (status === "NO_SHOW" &&
        !confirm("Xác nhận bệnh nhân không đến khám?")) {
        return;
    }

    try {
        const result = await dashboardFetch(endpoint, {
            method: "POST"
        });

        alert(result.message || "Cập nhật lịch hẹn thành công.");

        await Promise.all([
            loadDoctorAppointments(),
            loadDoctorDashboard()
        ]);
    } catch (error) {
        console.error("UPDATE APPOINTMENT ERROR:", error);
        alert(error.message || "Không thể cập nhật lịch hẹn.");
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
        alert("ID lịch hẹn không hợp lệ.");
        return;
    }

    if (!confirm("Xác nhận bệnh nhân đã đến khám?")) {
        return;
    }

    try {
        const result = await dashboardFetch(
            `/api/appointments/${id}/arrival`,
            {
                method: "POST"
            }
        );

        alert(result.message || "Đã ghi nhận bệnh nhân đến khám.");

        await Promise.all([
            loadDoctorAppointments(),
            loadDoctorDashboard()
        ]);
    } catch (error) {
        console.error("RECORD ARRIVAL ERROR:", error);
        alert(error.message || "Không thể ghi nhận bệnh nhân đến khám.");
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
        alert("ID lịch hẹn không hợp lệ.");
        return;
    }

    if (!confirm("Xác nhận hoàn thành cuộc khám này?")) {
        return;
    }

    try {
        const result = await dashboardFetch(
            `/api/appointments/${id}/complete`,
            {
                method: "POST"
            }
        );

        alert(result.message || "Cuộc hẹn đã được đánh dấu hoàn thành.");

        await Promise.all([
            loadDoctorAppointments(),
            loadDoctorDashboard()
        ]);
    } catch (error) {
        console.error("COMPLETE APPOINTMENT ERROR:", error);
        alert(error.message || "Không thể hoàn thành cuộc khám.");
    }
}

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
