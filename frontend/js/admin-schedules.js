document.addEventListener(
    "DOMContentLoaded",
    async function () {
        setAdminMinimumDate();
        await loadAdminDoctors();
        await loadAllSchedules();
        setupAdminForm();
    }
);
/* =====================================================
   NGÀY
===================================================== */
function setAdminMinimumDate() {
    const input =
        document.getElementById(
            "adminScheduleDate"
        );
    if (!input) return;
    input.min =
        new Date()
            .toISOString()
            .split("T")[0];
}
/* =====================================================
   BÁC SĨ
===================================================== */
async function loadAdminDoctors() {
    const select =
        document.getElementById(
            "adminDoctorSelect"
        );
    try {
        const result =
            await apiFetch(
                "/api/doctors"
            );
        const doctors =
            Array.isArray(result)
                ? result
                : result.data || [];
        doctors.forEach(
            doctor => {
                const option =
                    document.createElement(
                        "option"
                    );
                option.value =
                    doctor.id;
                option.textContent =
                    `BS. ${
                        doctor.full_name ||
                        "Bác sĩ"
                    } - ${
                        doctor.specialty_name ||
                        "Chưa cập nhật chuyên khoa"
                    }`;
                select.appendChild(
                    option
                );
            }
        );
    }
    catch (error) {
        console.error(error);
        alert(
            "Không thể tải danh sách bác sĩ."
        );
    }
}
/* =====================================================
   DANH SÁCH LỊCH
===================================================== */
async function loadAllSchedules() {
    const container =
        document.getElementById(
            "adminScheduleList"
        );
    try {
        const result =
            await apiFetch(
                "/api/schedules/admin"
            );
        const schedules =
            Array.isArray(result)
                ? result
                : result.data || [];
        if (!schedules.length) {
            container.innerHTML = `
                <div class="schedule-empty">
                    <i class="fa-regular fa-calendar"></i>
                    <h3>
                        Chưa có lịch làm việc
                    </h3>
                </div>
            `;
            return;
        }
        container.innerHTML =
            schedules.map(
                schedule => `
                    <div
                        class="
                            schedule-management-item
                        "
                    >
                        <div>
                            <strong>
                                BS.
                                ${
                                    escapeHtml(
                                        schedule.full_name ||
                                        "Bác sĩ"
                                    )
                                }
                            </strong>
                            <span>
                                ${
                                    escapeHtml(
                                        schedule.specialty_name ||
                                        ""
                                    )
                                }
                            </span>
                        </div>
                        <div
                            class="
                                schedule-management-date
                            "
                        >
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
                        <div
                            class="
                                schedule-management-actions
                            "
                        >
                            <button
                                class="
                                    btn
                                    btn-small
                                    btn-danger
                                "
                                onclick="
                                    deleteAdminSchedule(
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
    catch (error) {
        console.error(error);
        container.innerHTML = `
            <div class="doctor-page-error">
                Không thể tải danh sách lịch.
            </div>
        `;
    }
}
/* =====================================================
   FORM
===================================================== */
function setupAdminForm() {
    document
        .getElementById(
            "adminScheduleForm"
        )
        .addEventListener(
            "submit",
            createAdminSchedule
        );
}
/* =====================================================
   TẠO LỊCH
===================================================== */
async function createAdminSchedule(
    event
) {
    event.preventDefault();
    const doctorId =
        document.getElementById(
            "adminDoctorSelect"
        ).value;
    const date =
        document.getElementById(
            "adminScheduleDate"
        ).value;
    const start =
        document.getElementById(
            "adminStartTime"
        ).value;
    const end =
        document.getElementById(
            "adminEndTime"
        ).value;
    if (start >= end) {
        showAdminMessage(
            "Giờ kết thúc phải lớn hơn giờ bắt đầu.",
            "error"
        );
        return;
    }
    try {
        await apiFetch(
            "/api/schedules",
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    doctor_id:
                        Number(doctorId),
                    schedule_date:
                        date,
                    start_time:
                        start + ":00",
                    end_time:
                        end + ":00"
                })
            }
        );
        showAdminMessage(
            "Tạo lịch cho bác sĩ thành công.",
            "success"
        );
        event.target.reset();
        await loadAllSchedules();
    }
    catch (error) {
        console.error(error);
        showAdminMessage(
            error.message ||
            "Không thể tạo lịch.",
            "error"
        );
    }
}
/* =====================================================
   XÓA
===================================================== */
async function deleteAdminSchedule(
    id
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
            `/api/schedules/${id}`,
            {
                method: "DELETE"
            }
        );
        await loadAllSchedules();
    }
    catch (error) {
        alert(
            error.message ||
            "Không thể xóa lịch."
        );
    }
}
/* =====================================================
   MESSAGE
===================================================== */
function showAdminMessage(
    message,
    type
) {
    const element =
        document.getElementById(
            "adminScheduleMessage"
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
function formatTime(value) {
    return String(value || "")
        .substring(0, 5);
}
function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}