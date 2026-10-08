/*
=====================================================
DOCTOR DASHBOARD
=====================================================
Chức năng:

1. Kiểm tra session
2. Hiển thị thông tin bác sĩ
3. Hiển thị thống kê dashboard
4.  theo 4 ca
5. Hiển thị lịch làm việc của bác sĩ
6. Đóng / mở lịch
7. Xóa lịch
8. Hiển thị và xử lý lịch hẹn
=====================================================
*/


document.addEventListener(
    "DOMContentLoaded",
    async function () {
        /*
        =================================================
        1. ĐĂNG KÝ SỰ KIỆN
        =================================================
        */
        document
            .getElementById("createScheduleForm")
            ?.addEventListener(
                "submit",
                createDoctorSchedule
            );
        document
            .getElementById("refreshSchedules")
            ?.addEventListener(
                "click",
                loadDoctorSchedules
            );
        document
            .getElementById("refreshAppointments")
            ?.addEventListener(
                "click",
                loadDoctorAppointments
            );
        /*
        =================================================
        2. NGÀY  KHÔNG ĐƯỢC NHỎ HƠN HÔM NAY
        =================================================
        */
        const scheduleDate =
            document.getElementById(
                "scheduleDate"
            );
        if (scheduleDate) {
            const today =
                new Date()
                    .toISOString()
                    .split("T")[0];
            scheduleDate.min = today;
        }
        /*
        =================================================
        3. KIỂM TRA SESSION
        =================================================
        */
        const sessionValid =
            await checkDoctorSession();
        if (!sessionValid) {
            return;
        }
        /*
        =================================================
        4. TẢI DỮ LIỆU DASHBOARD
        =================================================
        */
        await loadDoctorDashboard();
        /*
        =================================================
        5. TẢI LỊCH LÀM VIỆC
        =================================================
        */
        await loadDoctorSchedules();
        /*
        =================================================
        6. TẢI LỊCH HẸN
        =================================================
        */
        await loadDoctorAppointments();
    }
);
/*
=====================================================
API HELPER
=====================================================
Dùng fetch trực tiếp và luôn gửi session cookie.
=====================================================
*/

async function dashboardFetch(
    url,
    options = {}
) {
    const config = {
        credentials: "include",
        ...options,
        headers: {
            "Content-Type":
                "application/json",
            ...(options.headers || {})
        }
    };
    const response =
        await fetch(
            url,
            config
        );
    let result = null;
    try {
        result =
            await response.json();
    } catch (error) {
        result = null;
    }
    if (!response.ok) {
        throw new Error(
            result?.message ||
            `API lỗi HTTP ${response.status}`
        );
    }
    return result;
}
/*
=====================================================
1. KIỂM TRA SESSION BÁC SĨ
=====================================================
*/

async function checkDoctorSession() {
    try {
        const result =
            await dashboardFetch(
                "/api/session"
            );
        if (
            !result.success ||
            !result.user
        ) {
            window.location.href =
                "login.html";
            return false;
        }
        /*
        =============================================
        KIỂM TRA ROLE
        =============================================
        */
        if (
            result.user.role !== "DOCTOR"
        ) {
            alert(
                "Bạn không có quyền truy cập trang bác sĩ."
            );
            window.location.href =
                "home.html";
            return false;
        }
        /*
        =============================================
        HIỂN THỊ TÊN BÁC SĨ
        =============================================
        */
        const doctorName =
            result.user.full_name ||
            "Bác sĩ";
        const doctorNameElement =
            document.getElementById(
                "doctorName"
            );
        const headerDoctorName =
            document.getElementById(
                "headerDoctorName"
            );
        if (doctorNameElement) {
            doctorNameElement.textContent =
                "BS. " + doctorName;
        }
        if (headerDoctorName) {
            headerDoctorName.textContent =
                "BS. " + doctorName;
        }
        return true;
    } catch (error) {
        console.error(
            "CHECK DOCTOR SESSION ERROR:",
            error
        );
        window.location.href =
            "login.html";
        return false;
    }
}
/*
=====================================================
2. DASHBOARD
=====================================================
*/

async function loadDoctorDashboard() {
    try {
        const result =
            await dashboardFetch(
                "/api/doctors/me/dashboard"
            );
        const data =
            result.data ||
            result;
        /*
        =============================================
        THÔNG TIN BÁC SĨ
        =============================================
        */
        if (data.doctor) {
            const doctorName =
                document.getElementById(
                    "doctorName"
                );
            const doctorSpecialty =
                document.getElementById(
                    "doctorSpecialty"
                );
            if (doctorName) {
                doctorName.textContent =
                    "BS. " +
                    (
                        data.doctor.full_name ||
                        "Bác sĩ"
                    );
            }
            if (doctorSpecialty) {
                doctorSpecialty.textContent =
                    data.doctor.specialty_name ||
                    "Bác sĩ";
            }
        }
        /*
        =============================================
        THỐNG KÊ
        =============================================
        */
        const statistics =
            data.statistics ||
            {};
        document.getElementById(
            "todayScheduleCount"
        ).textContent =
            statistics.todaySchedules || 0;
        document.getElementById(
            "appointmentCount"
        ).textContent =
            statistics.appointments || 0;
        document.getElementById(
            "pendingCount"
        ).textContent =
            statistics.pending || 0;
        document.getElementById(
            "completedCount"
        ).textContent =
            statistics.completed || 0;
    } catch (error) {
        /*
        =============================================
        Không làm dashboard chết nếu API thống kê
        chưa được triển khai.
        =============================================
        */
        console.warn(
            "Không tải được dashboard API:",
            error
        );
    }
}
/*
=====================================================
3. CẤU HÌNH 4 CA
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
4. 
=====================================================
*/

async function createDoctorSchedule(event) {
    event.preventDefault();
    const form =
        document.getElementById(
            "createScheduleForm"
        );
    const dateInput =
        document.getElementById(
            "scheduleDate"
        );
    const message =
        document.getElementById(
            "scheduleMessage"
        );
    const submitButton =
        form?.querySelector(
            'button[type="submit"]'
        );
    /*
    =============================================
    LẤY NGÀY
    =============================================
    */
    const date =
        dateInput?.value || "";
    /*
    =============================================
    LẤY CA ĐƯỢC CHỌN
    =============================================
    */
    const selectedShift =
        document.querySelector(
            'input[name="shift_type"]:checked'
        );
    const shiftType =
        selectedShift?.value || "";
    /*
    =============================================
    VALIDATION
    =============================================
    */
    if (!date) {
        showDashboardMessage(
            message,
            "Vui lòng chọn ngày làm việc.",
            "error"
        );
        return;
    }
    if (!shiftType) {
        showDashboardMessage(
            message,
            "Vui lòng chọn ca làm việc.",
            "error"
        );
        return;
    }
    if (!SHIFT_CONFIG[shiftType]) {
        showDashboardMessage(
            message,
            "Ca làm việc không hợp lệ.",
            "error"
        );
        return;
    }
    /*
    =============================================
    VÔ HIỆU HÓA NÚT TRONG KHI GỬI
    =============================================
    */
    const oldButtonHTML =
        submitButton?.innerHTML;
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.innerHTML =
            `
                <i class="fa-solid fa-spinner fa-spin"></i>
                Đang ...
            `;
    }
    try {
        /*
        =============================================
        PAYLOAD
        =============================================
        Chỉ gửi:
        schedule_date
        shift_type
        Không gửi doctor_id.
        Không gửi start_time.
        Không gửi end_time.
        =============================================
        */
        const payload = {
            schedule_date: date,
            shift_type: shiftType
        };
        console.log(
            "Dữ liệu :",
            payload
        );
        /*
        =============================================
        GỌI API BACKEND
        =============================================
        */
        const result =
            await dashboardFetch(
                "/api/schedules",
                {
                    method: "POST",
                    body:
                        JSON.stringify(payload)
                }
            );
        /*
        =============================================
        THÔNG BÁO
        =============================================
        */
        showDashboardMessage(
            message,
            result.message ||
            " làm việc thành công.",
            "success"
        );
        /*
        =============================================
        RESET FORM
        =============================================
        */
        form.reset();
        /*
        =============================================
        TẢI LẠI DANH SÁCH
        =============================================
        */
        await loadDoctorSchedules();
        /*
        =============================================
        CẬP NHẬT THỐNG KÊ
        =============================================
        */
        await loadDoctorDashboard();
    } catch (error) {
        console.error(
            "CREATE SCHEDULE ERROR:",
            error
        );
        showDashboardMessage(
            message,
            error.message ||
            "Không thể  làm việc.",
            "error"
        );
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML =
                oldButtonHTML;
        }
    }
}
/*
=====================================================
5. LẤY LỊCH CỦA BÁC SĨ
=====================================================
GET /api/schedules/my
=====================================================
*/

async function loadDoctorSchedules() {
    const tbody =
        document.getElementById(
            "scheduleTableBody"
        );
    if (!tbody) {
        return;
    }
    tbody.innerHTML = `
        <tr>
            <td
                colspan="5"
                class="dashboard-loading"
            >
                <i class="fa-solid fa-spinner fa-spin"></i>
                Đang tải lịch làm việc...
            </td>
        </tr>
    `;
    try {
        const result =
            await dashboardFetch(
                "/api/schedules/my"
            );
        const schedules =
            normalizeSchedules(
                result
            );
        /*
        =============================================
        KHÔNG CÓ LỊCH
        =============================================
        */
        if (!schedules.length) {
            tbody.innerHTML = `
                <tr>
                    <td
                        colspan="5"
                        class="dashboard-loading"
                    >
                        Chưa có lịch làm việc.
                    </td>
                </tr>
            `;
            return;
        }
        /*
        =============================================
        HIỂN THỊ
        =============================================
        */
        tbody.innerHTML =
            schedules
                .map(renderScheduleRow)
                .join("");
    } catch (error) {
        console.error(
            "LOAD DOCTOR SCHEDULES ERROR:",
            error
        );
        tbody.innerHTML = `
            <tr>
                <td
                    colspan="5"
                    class="dashboard-loading"
                >
                    Không thể tải lịch làm việc.
                </td>
            </tr>
        `;
    }
}
/*
=====================================================
6. CHUẨN HÓA RESPONSE LỊCH
=====================================================
*/

function normalizeSchedules(result) {
    if (Array.isArray(result)) {
        return result;
    }
    if (
        result &&
        Array.isArray(result.data)
    ) {
        return result.data;
    }
    if (
        result &&
        Array.isArray(result.schedules)
    ) {
        return result.schedules;
    }
    if (
        result?.data &&
        Array.isArray(
            result.data.schedules
        )
    ) {
        return result.data.schedules;
    }
    return [];
}
/*
=====================================================
7. RENDER LỊCH
=====================================================
*/

function renderScheduleRow(schedule) {
    const status =
        schedule.status ||
        "AVAILABLE";
    const statusText =
        status === "AVAILABLE"
            ? "Đang mở"
            : "Đã đóng";
    const statusClass =
        status === "AVAILABLE"
            ? "available"
            : "closed";
    const shiftType =
        schedule.shift_type ||
        "";
    const shift =
        SHIFT_CONFIG[shiftType];
    const shiftName =
        schedule.shift_name ||
        shift?.name ||
        shiftType ||
        "Chưa xác định";
    const shiftIcon =
        shift?.icon ||
        "fa-clock";
    const displayStart =
        schedule.display_start ||
        shift?.start ||
        formatTime(
            schedule.start_time
        );
    const displayEnd =
        schedule.display_end ||
        shift?.end ||
        formatTime(
            schedule.end_time
        );
    /*
    =============================================
    XÁC ĐỊNH LẠI THỜI GIAN CHO DỮ LIỆU CŨ
    =============================================
    */
    let timeText =
        `${displayStart} - ${displayEnd}`;
    if (
        schedule.start_time &&
        schedule.end_time &&
        !schedule.display_start &&
        !schedule.display_end
    ) {
        timeText =
            `${formatTime(schedule.start_time)}
             - 
             ${formatTime(schedule.end_time)}`;
    }
    /*
    =============================================
    ESCAPE GIÁ TRỊ CHO ONCLICK
    =============================================
    */
    const safeDate =
        String(
            schedule.schedule_date || ""
        )
            .replace(/'/g, "\\'");
    const safeShift =
        String(
            shiftType || ""
        )
            .replace(/'/g, "\\'");
    return `
        <tr>
            <!-- NGÀY -->
            <td>
                ${formatDate(
                    schedule.schedule_date
                )}
            </td>
            <!-- CA -->
            <td>
                <span
                    style="
                        display:inline-flex;
                        align-items:center;
                        gap:7px;
                        font-weight:600;
                    "
                >
                    <i
                        class="fa-solid ${shiftIcon}"
                        style="
                            color:
                            var(--primary-deep,#0b5f59);
                        "
                    ></i>
                    ${shiftName}
                </span>
            </td>
            <!-- THỜI GIAN -->
            <td>
                ${timeText}
            </td>
            <!-- TRẠNG THÁI -->
            <td>
                <span
                    class="dashboard-status ${statusClass}"
                >
                    ${statusText}
                </span>
            </td>
            <!-- THAO TÁC -->
            <td>
                <div
                    class="dashboard-actions"
                >
                    <button
                        type="button"
                        class="btn btn-outline"
                        onclick="toggleDoctorSchedule(
                            ${schedule.id},
                            '${status}',
                            '${safeDate}',
                            '${safeShift}'
                        )"
                    >
                        ${
                            status === "AVAILABLE"
                                ? "Đóng lịch"
                                : "Mở lịch"
                        }
                    </button>
                    <button
                        type="button"
                        class="btn btn-outline"
                        onclick="deleteDoctorSchedule(
                            ${schedule.id}
                        )"
                    >
                        <i class="fa-solid fa-trash"></i>
                        Xóa
                    </button>
                </div>
            </td>
        </tr>
    `;
}
/*
=====================================================
8. ĐÓNG / MỞ LỊCH
=====================================================
PUT /api/schedules/:id
=====================================================
*/

async function toggleDoctorSchedule(
    scheduleId,
    currentStatus,
    scheduleDate,
    shiftType
) {
    const newStatus =
        currentStatus === "AVAILABLE"
            ? "CLOSED"
            : "AVAILABLE";
    try {
        await dashboardFetch(
            `/api/schedules/${scheduleId}`,
            {
                method: "PUT",
                body:
                    JSON.stringify({
                        schedule_date:
                            scheduleDate,
                        shift_type:
                            shiftType,
                        status:
                            newStatus
                    })
            }
        );
        await loadDoctorSchedules();
        await loadDoctorDashboard();
    } catch (error) {
        console.error(
            "TOGGLE SCHEDULE ERROR:",
            error
        );
        alert(
            error.message ||
            "Không thể cập nhật lịch."
        );
    }
}
/*
=====================================================
9. XÓA LỊCH
=====================================================
DELETE /api/schedules/:id
=====================================================
*/

async function deleteDoctorSchedule(
    scheduleId
) {
    const confirmed =
        window.confirm(
            "Bạn có chắc chắn muốn xóa lịch làm việc này?"
        );
    if (!confirmed) {
        return;
    }
    try {
        await dashboardFetch(
            `/api/schedules/${scheduleId}`,
            {
                method: "DELETE"
            }
        );
        await loadDoctorSchedules();
        await loadDoctorDashboard();
    } catch (error) {
        console.error(
            "DELETE SCHEDULE ERROR:",
            error
        );
        alert(
            error.message ||
            "Không thể xóa lịch làm việc."
        );
    }
}
/*
=====================================================
10. LỊCH HẸN
=====================================================
Phần này giữ API hiện tại của dashboard.
=====================================================
*/

async function loadDoctorAppointments() {
    const tbody =
        document.getElementById(
            "appointmentTableBody"
        );
    if (!tbody) {
        return;
    }
    tbody.innerHTML = `
        <tr>
            <td
                colspan="6"
                class="dashboard-loading"
            >
                <i class="fa-solid fa-spinner fa-spin"></i>
                Đang tải lịch hẹn...
            </td>
        </tr>
    `;
    try {
        const result =
            await dashboardFetch(
                "/api/doctors/me/appointments"
            );
        const appointments =
            normalizeAppointments(
                result
            );
        if (!appointments.length) {
            tbody.innerHTML = `
                <tr>
                    <td
                        colspan="6"
                        class="dashboard-loading"
                    >
                        Chưa có lịch hẹn.
                    </td>
                </tr>
            `;
            return;
        }
        tbody.innerHTML =
            appointments
                .map(
                    renderAppointmentRow
                )
                .join("");
    } catch (error) {
        console.error(
            "LOAD DOCTOR APPOINTMENTS ERROR:",
            error
        );
        tbody.innerHTML = `
            <tr>
                <td
                    colspan="6"
                    class="dashboard-loading"
                >
                    Không thể tải lịch hẹn.
                </td>
            </tr>
        `;
    }
}
/*
=====================================================
11. CHUẨN HÓA LỊCH HẸN
=====================================================
*/

function normalizeAppointments(
    result
) {
    if (Array.isArray(result)) {
        return result;
    }
    if (
        result &&
        Array.isArray(result.data)
    ) {
        return result.data;
    }
    if (
        result &&
        Array.isArray(
            result.appointments
        )
    ) {
        return result.appointments;
    }
    if (
        result?.data &&
        Array.isArray(
            result.data.appointments
        )
    ) {
        return result.data.appointments;
    }
    return [];
}
/*
=====================================================
12. RENDER APPOINTMENT
=====================================================
*/

function renderAppointmentRow(
    appointment
) {
    const status =
        appointment.status ||
        "PENDING";
    const statusClass =
        status
            .toLowerCase()
            .replace("_", "-");
    return `
        <tr>
            <!-- BỆNH NHÂN -->
            <td>
                <strong>
                    ${
                        appointment.patient_name ||
                        "Chưa cập nhật"
                    }
                </strong>
                ${
                    appointment.patient_phone
                        ? `
                            <br>
                            <small>
                                ${appointment.patient_phone}
                            </small>
                        `
                        : ""
                }
            </td>
            <!-- NGÀY -->
            <td>
                ${
                    formatDate(
                        appointment.schedule_date
                    )
                }
            </td>
            <!-- GIỜ -->
            <td>
                ${
                    formatTime(
                        appointment.appointment_time
                    )
                }
            </td>
            <!-- LÝ DO -->
            <td>
                ${
                    appointment.reason ||
                    "Không có"
                }
            </td>
            <!-- TRẠNG THÁI -->
            <td>
                <span
                    class="dashboard-status ${statusClass}"
                >
                    ${
                        translateAppointmentStatus(
                            status
                        )
                    }
                </span>
            </td>
            <!-- THAO TÁC -->
            <td>
                ${
                    renderAppointmentActions(
                        appointment
                    )
                }
            </td>
        </tr>
    `;
}
/*
=====================================================
13. ACTION LỊCH HẸN
=====================================================
*/

function renderAppointmentActions(
    appointment
) {
    const id =
        appointment.id;
    if (
        appointment.status ===
        "PENDING"
    ) {
        return `
            <div
                class="dashboard-actions"
            >
                <button
                    type="button"
                    class="btn btn-primary"
                    onclick="updateAppointment(
                        ${id},
                        'CONFIRMED'
                    )"
                >
                    Xác nhận
                </button>
                <button
                    type="button"
                    class="btn btn-outline"
                    onclick="updateAppointment(
                        ${id},
                        'CANCELLED'
                    )"
                >
                    Hủy
                </button>
            </div>
        `;
    }
    if (
        appointment.status ===
        "CONFIRMED"
    ) {
        return `
            <div
                class="dashboard-actions"
            >
                <button
                    type="button"
                    class="btn btn-primary"
                    onclick="updateAppointment(
                        ${id},
                        'COMPLETED'
                    )"
                >
                    Hoàn thành
                </button>
                <button
                    type="button"
                    class="btn btn-outline"
                    onclick="updateAppointment(
                        ${id},
                        'NO_SHOW'
                    )"
                >
                    Không đến
                </button>
            </div>
        `;
    }
    return "-";
}
/*
=====================================================
14. CẬP NHẬT LỊCH HẸN
=====================================================
*/

async function updateAppointment(
    appointmentId,
    status
) {
    try {
        await dashboardFetch(
            `/api/doctors/me/appointments/${appointmentId}/status`,
            {
                method: "PATCH",
                body:
                    JSON.stringify({
                        status
                    })
            }
        );
        await loadDoctorAppointments();
        await loadDoctorDashboard();
    } catch (error) {
        console.error(
            "UPDATE APPOINTMENT ERROR:",
            error
        );
        alert(
            error.message ||
            "Không thể cập nhật lịch hẹn."
        );
    }
}
/*
=====================================================
15. FORMAT DATE
=====================================================
*/

function formatDate(value) {
    if (!value) {
        return "";
    }
    /*
    =============================================
    Nếu MySQL trả Date object dạng ISO
    =============================================
    */
    const text =
        String(value)
            .slice(0, 10);
    const parts =
        text.split("-");
    if (
        parts.length !== 3
    ) {
        return value;
    }
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}
/*
=====================================================
16. FORMAT TIME
=====================================================
*/

function formatTime(value) {
    if (!value) {
        return "";
    }
    return String(value)
        .slice(0, 5);
}
/*
=====================================================
17. DỊCH TRẠNG THÁI LỊCH HẸN
=====================================================
*/

function translateAppointmentStatus(
    status
) {
    const map = {
        PENDING:
            "Chờ xác nhận",
        CONFIRMED:
            "Đã xác nhận",
        COMPLETED:
            "Đã hoàn thành",
        CANCELLED:
            "Đã hủy",
        NO_SHOW:
            "Không đến"
    };
    return (
        map[status] ||
        status
    );
}
/*
=====================================================
18. MESSAGE
=====================================================
*/

function showDashboardMessage(
    element,
    message,
    type
) {
    if (!element) {
        return;
    }
    element.className =
        `dashboard-message ${type}`;
    element.textContent =
        message;
    setTimeout(
        function () {
            element.textContent =
                "";
            element.className =
                "dashboard-message";
        },
        4000
    );
}
/*
=====================================================
19. EXPORT RA WINDOW
=====================================================
Dùng cho onclick trong bảng.
=====================================================
*/

window.toggleDoctorSchedule =
    toggleDoctorSchedule;


window.deleteDoctorSchedule =
    deleteDoctorSchedule;


window.updateAppointment =
    updateAppointment;