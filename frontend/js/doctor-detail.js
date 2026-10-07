document.addEventListener(
    "DOMContentLoaded",
    async function () {
        const params =
            new URLSearchParams(
                window.location.search
            );
        const doctorId =
            params.get("id");
        if (!doctorId) {
            showDoctorError(
                "Không xác định được bác sĩ."
            );
            return;
        }
        await loadDoctorDetail(
            doctorId
        );
        await loadDoctorSchedules(
            doctorId
        );
    }
);
/* =====================================================
   CHI TIẾT BÁC SĨ
===================================================== */
async function loadDoctorDetail(
    doctorId
) {
    const container =
        document.getElementById(
            "doctorDetail"
        );
    try {
        const result =
            await apiFetch(
                `/api/doctors/${doctorId}`
            );
        const doctor =
            result.data ||
            result.doctor ||
            result;
        renderDoctorDetail(
            doctor
        );
    }
    catch (error) {
        console.error(error);
        /*
         * Nếu backend hiện tại chưa có API
         * /api/doctors/:id thì lấy từ
         * danh sách bác sĩ.
         */
        try {
            const result =
                await apiFetch(
                    "/api/doctors"
                );
            const doctors =
                Array.isArray(result)
                    ? result
                    : result.data || [];
            const doctor =
                doctors.find(
                    item =>
                        Number(item.id) ===
                        Number(doctorId)
                );
            if (!doctor) {
                throw new Error(
                    "Không tìm thấy bác sĩ."
                );
            }
            renderDoctorDetail(
                doctor
            );
        }
        catch (fallbackError) {
            console.error(
                fallbackError
            );
            showDoctorError(
                "Không thể tải thông tin bác sĩ."
            );
        }
    }
}
/* =====================================================
   HIỂN THỊ
===================================================== */
function renderDoctorDetail(
    doctor
) {
    const container =
        document.getElementById(
            "doctorDetail"
        );
    const avatar =
        doctor.avatar
            ? `
                <img
                    src="${doctor.avatar}"
                    alt="${escapeHtml(doctor.full_name)}"
                >
            `
            : `
                <div class="doctor-detail-placeholder">
                    <i class="fa-solid fa-user-doctor"></i>
                </div>
            `;
    container.innerHTML = `
        <div class="doctor-detail-top">
            <div class="doctor-detail-avatar">
                ${avatar}
            </div>
            <div class="doctor-detail-main">
                <span class="doctor-detail-specialty">
                    ${
                        escapeHtml(
                            doctor.specialty_name ||
                            "Chưa cập nhật chuyên khoa"
                        )
                    }
                </span>
                <h1>
                    BS.
                    ${
                        escapeHtml(
                            doctor.full_name ||
                            "Bác sĩ"
                        )
                    }
                </h1>
                <p class="doctor-detail-intro">
                    ${
                        escapeHtml(
                            doctor.introduction ||
                            "Bác sĩ đang cập nhật thông tin."
                        )
                    }
                </p>
                <div class="doctor-detail-actions">
                    <button
                        class="btn btn-primary"
                        onclick="
                            bookDoctor(
                                ${doctor.id}
                            )
                        "
                    >
                        <i class="fa-solid fa-calendar-check"></i>
                        Đặt lịch khám
                    </button>
                </div>
            </div>
        </div>
        <div class="doctor-detail-information">
            <div class="detail-information-item">
                <i class="fa-solid fa-briefcase-medical"></i>
                <span>
                    Kinh nghiệm
                </span>
                <strong>
                    ${
                        doctor.experience_years ??
                        0
                    }
                    năm
                </strong>
            </div>
            <div class="detail-information-item">
                <i class="fa-solid fa-graduation-cap"></i>
                <span>
                    Trình độ
                </span>
                <strong>
                    ${
                        escapeHtml(
                            doctor.qualification ||
                            "Chưa cập nhật"
                        )
                    }
                </strong>
            </div>
            <div class="detail-information-item">
                <i class="fa-solid fa-id-card"></i>
                <span>
                    Giấy phép
                </span>
                <strong>
                    ${
                        escapeHtml(
                            doctor.license_number ||
                            "Chưa cập nhật"
                        )
                    }
                </strong>
            </div>
            <div class="detail-information-item">
                <i class="fa-solid fa-stethoscope"></i>
                <span>
                    Chuyên khoa
                </span>
                <strong>
                    ${
                        escapeHtml(
                            doctor.specialty_name ||
                            "Chưa cập nhật"
                        )
                    }
                </strong>
            </div>
        </div>
    `;
}
/* =====================================================
   LỊCH LÀM VIỆC
===================================================== */
async function loadDoctorSchedules(
    doctorId
) {
    const container =
        document.getElementById(
            "doctorScheduleList"
        );
    try {
        const result =
            await apiFetch(
                `/api/doctors/${doctorId}/schedules`
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
                    <p>
                        Bác sĩ chưa được thiết lập
                        lịch làm việc.
                    </p>
                </div>
            `;
            return;
        }
        container.innerHTML =
            schedules
                .map(
                    schedule => `
                        <div class="schedule-preview-card">
                            <div class="schedule-date">
                                <i class="fa-regular fa-calendar"></i>
                                ${formatDate(
                                    schedule.schedule_date
                                )}
                            </div>
                            <div class="schedule-time">
                                <i class="fa-regular fa-clock"></i>
                                ${formatTime(
                                    schedule.start_time
                                )}
                                -
                                ${formatTime(
                                    schedule.end_time
                                )}
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
                        </div>
                    `
                )
                .join("");
    }
    catch (error) {
        console.error(error);
        container.innerHTML = `
            <div class="schedule-empty">
                Không thể tải lịch làm việc.
            </div>
        `;
    }
}
/* =====================================================
   ĐẶT LỊCH
===================================================== */
function bookDoctor(
    doctorId
) {
    window.location.href =
        `index.html?doctor=${doctorId}#appointmentPanel`;
}
/* =====================================================
   HELPER
===================================================== */
function formatDate(value) {
    if (!value) return "--";
    const date =
        new Date(value);
    return date.toLocaleDateString(
        "vi-VN"
    );
}
function formatTime(value) {
    if (!value) return "--";
    return String(value)
        .substring(0, 5);
}
function showDoctorError(
    message
) {
    document.getElementById(
        "doctorDetail"
    ).innerHTML = `
        <div class="doctor-page-error">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <h3>
                ${message}
            </h3>
            <a
                href="doctors.html"
                class="btn btn-primary"
            >
                Quay lại
            </a>
        </div>
    `;
}
function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}