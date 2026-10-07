let editingScheduleId = null;
document.addEventListener(
    "DOMContentLoaded",
    async function () {
        setMinimumDate();
        setupScheduleForm();
        await loadMySchedules();
    }
);
/* =====================================================
   NGÀY NHỎ NHẤT
===================================================== */
function setMinimumDate() {
    const input =
        document.getElementById(
            "scheduleDate"
        );
    if (!input) return;
    input.min =
        new Date()
            .toISOString()
            .split("T")[0];
}
/* =====================================================
   LẤY LỊCH CỦA BÁC SĨ
===================================================== */
async function loadMySchedules() {
    const container =
        document.getElementById(
            "myScheduleList"
        );
    try {
        const result =
            await apiFetch(
                "/api/schedules/my"
            );
        const schedules =
            Array.isArray(result)
                ? result
                : result.data || [];
        renderSchedules(
            schedules
        );
    }
    catch (error) {
        console.error(error);
        container.innerHTML = `
            <div class="doctor-page-error">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <p>
                    ${
                        error.message ||
                        "Không thể tải lịch làm việc."
                    }
                </p>
            </div>
        `;
    }
}
/* =====================================================
   HIỂN THỊ LỊCH
===================================================== */
function renderSchedules(
    schedules
) {
    const container =
        document.getElementById(
            "myScheduleList"
        );
    if (!schedules.length) {
        container.innerHTML = `
            <div class="schedule-empty">
                <i class="fa-regular fa-calendar"></i>
                <h3>
                    Chưa có lịch làm việc
                </h3>
                <p>
                    Hãy tạo lịch làm việc đầu tiên.
                </p>
            </div>
        `;
        return;
    }
    container.innerHTML =
        schedules.map(
            schedule => `
                <div class="schedule-management-item">
                    <div class="schedule-management-date">
                        <strong>
                            ${formatDate(
                                schedule.schedule_date
                            )}
                        </strong>
                        <span>
                            ${formatTime(
                                schedule.start_time
                            )}
                            -
                            ${formatTime(
                                schedule.end_time
                            )}
                        </span>
                    </div>
                    <span
                        class="
                            schedule-status
                            ${
                                schedule.status ===
                                "AVAILABLE"
                                    ? "available"
                                    : "closed"
                            }
                        "
                    >
                        ${
                            schedule.status ===
                            "AVAILABLE"
                                ? "Đang mở"
                                : "Đã đóng"
                        }
                    </span>
                    <div class="schedule-management-actions">
                        <button
                            class="btn btn-small btn-outline"
                            onclick="
                                editSchedule(
                                    ${schedule.id}
                                )
                            "
                        >
                            <i class="fa-solid fa-pen"></i>
                            Sửa
                        </button>
                        <button
                            class="btn btn-small btn-danger"
                            onclick="
                                deleteSchedule(
                                    ${schedule.id}
                                )
                            "
                        >
                            <i class="fa-solid fa-trash"></i>
                            Xóa
                        </button>
                    </div>
                </div>
            `
        )
        .join("");
}
/* =====================================================
   FORM
===================================================== */
function setupScheduleForm() {
    const form =
        document.getElementById(
            "doctorScheduleForm"
        );
    form.addEventListener(
        "submit",
        saveSchedule
    );
    document
        .getElementById(
            "cancelEditButton"
        )
        .addEventListener(
            "click",
            resetForm
        );
}
/* =====================================================
   TẠO / SỬA
===================================================== */
async function saveSchedule(
    event
) {
    event.preventDefault();
    const date =
        document.getElementById(
            "scheduleDate"
        ).value;
    const startTime =
        document.getElementById(
            "startTime"
        ).value;
    const endTime =
        document.getElementById(
            "endTime"
        ).value;
    if (startTime >= endTime) {
        showMessage(
            "Thời gian kết thúc phải lớn hơn thời gian bắt đầu.",
            "error"
        );
        return;
    }
    const payload = {
        schedule_date: date,
        start_time:
            startTime + ":00",
        end_time:
            endTime + ":00"
    };
    const button =
        document.getElementById(
            "saveScheduleButton"
        );
    try {
        button.disabled = true;
        if (editingScheduleId) {
            await apiFetch(
                `/api/schedules/${editingScheduleId}`,
                {
                    method: "PUT",
                    headers: {
                        "Content-Type":
                            "application/json"
                    },
                    body:
                        JSON.stringify(
                            payload
                        )
                }
            );
            showMessage(
                "Cập nhật lịch làm việc thành công.",
                "success"
            );
        }
        else {
            await apiFetch(
                "/api/schedules",
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json"
                    },
                    body:
                        JSON.stringify(
                            payload
                        )
                }
            );
            showMessage(
                "Tạo lịch làm việc thành công.",
                "success"
            );
        }
        resetForm();
        await loadMySchedules();
    }
    catch (error) {
        console.error(error);
        showMessage(
            error.message ||
            "Không thể lưu lịch làm việc.",
            "error"
        );
    }
    finally {
        button.disabled = false;
    }
}
/* =====================================================
   EDIT
===================================================== */
async function editSchedule(
    scheduleId
) {
    try {
        const result =
            await apiFetch(
                `/api/schedules/${scheduleId}`
            );
        const schedule =
            result.data ||
            result;
        editingScheduleId =
            schedule.id;
        document.getElementById(
            "scheduleId"
        ).value =
            schedule.id;
        document.getElementById(
            "scheduleDate"
        ).value =
            formatInputDate(
                schedule.schedule_date
            );
        document.getElementById(
            "startTime"
        ).value =
            formatTime(
                schedule.start_time
            );
        document.getElementById(
            "endTime"
        ).value =
            formatTime(
                schedule.end_time
            );
        document.getElementById(
            "scheduleFormTitle"
        ).textContent =
            "Chỉnh sửa lịch";
        document.getElementById(
            "saveScheduleButton"
        ).innerHTML =
            `
                <i class="fa-solid fa-save"></i>
                Lưu thay đổi
            `;
        document.getElementById(
            "cancelEditButton"
        ).style.display =
            "inline-flex";
        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    }
    catch (error) {
        showMessage(
            error.message ||
            "Không thể lấy lịch.",
            "error"
        );
    }
}
/* =====================================================
   XÓA
===================================================== */
async function deleteSchedule(
    scheduleId
) {
    if (
        !confirm(
            "Bạn có chắc muốn xóa lịch này?"
        )
    ) {
        return;
    }
    try {
        await apiFetch(
            `/api/schedules/${scheduleId}`,
            {
                method: "DELETE"
            }
        );
        await loadMySchedules();
    }
    catch (error) {
        alert(
            error.message ||
            "Không thể xóa lịch."
        );
    }
}
/* =====================================================
   RESET
===================================================== */
function resetForm() {
    editingScheduleId = null;
    document
        .getElementById(
            "doctorScheduleForm"
        )
        .reset();
    document.getElementById(
        "scheduleFormTitle"
    ).textContent =
        "Tạo lịch mới";
    document.getElementById(
        "saveScheduleButton"
    ).innerHTML =
        `
            <i class="fa-solid fa-plus"></i>
            Tạo lịch
        `;
    document.getElementById(
        "cancelEditButton"
    ).style.display =
        "none";
}
/* =====================================================
   MESSAGE
===================================================== */
function showMessage(
    message,
    type
) {
    const element =
        document.getElementById(
            "scheduleMessage"
        );
    element.textContent =
        message;
    element.className =
        `form-message ${type}`;
}
/* =====================================================
   HELPER
===================================================== */
function formatDate(value) {
    return new Date(value)
        .toLocaleDateString(
            "vi-VN"
        );
}
function formatInputDate(value) {
    if (!value) return "";
    return String(value)
        .substring(0, 10);
}
function formatTime(value) {
    if (!value) return "";
    return String(value)
        .substring(0, 5);
}