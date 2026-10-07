let allDoctors = [];
/* =====================================================
   KHỞI TẠO
===================================================== */
document.addEventListener(
    "DOMContentLoaded",
    async function () {
        await loadDoctors();
        await loadSpecialties();
        setupSearch();
    }
);
/* =====================================================
   LẤY DANH SÁCH BÁC SĨ
===================================================== */
async function loadDoctors() {
    const doctorList =
        document.getElementById("doctorList");
    if (!doctorList) return;
    try {
        doctorList.innerHTML = `
            <div class="page-loading">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <p>Đang tải danh sách bác sĩ...</p>
            </div>
        `;
        const result =
            await apiFetch("/api/doctors");
        const doctors =
            Array.isArray(result)
                ? result
                : Array.isArray(result.data)
                    ? result.data
                    : [];
        allDoctors = doctors;
        renderDoctors(doctors);
    }
    catch (error) {
        console.error(
            "Lỗi tải bác sĩ:",
            error
        );
        doctorList.innerHTML = `
            <div class="doctor-page-error">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <h3>
                    Không thể tải danh sách bác sĩ
                </h3>
                <p>
                    Vui lòng kiểm tra máy chủ
                    và thử lại.
                </p>
                <button
                    class="btn btn-primary"
                    onclick="loadDoctors()"
                >
                    Thử lại
                </button>
            </div>
        `;
    }
}
/* =====================================================
   HIỂN THỊ BÁC SĨ
===================================================== */
function renderDoctors(doctors) {
    const doctorList =
        document.getElementById("doctorList");
    if (!doctorList) return;
    if (!doctors.length) {
        doctorList.innerHTML = `
            <div class="doctor-page-empty">
                <i class="fa-solid fa-user-doctor"></i>
                <h3>
                    Không tìm thấy bác sĩ
                </h3>
                <p>
                    Không có bác sĩ phù hợp với
                    điều kiện tìm kiếm.
                </p>
            </div>
        `;
        return;
    }
    doctorList.innerHTML =
        doctors.map(
            doctor => createDoctorCard(doctor)
        ).join("");
}
/* =====================================================
   CARD BÁC SĨ
===================================================== */
function createDoctorCard(doctor) {
    const avatar =
        doctor.avatar
            ? `
                <img
                    src="${doctor.avatar}"
                    alt="${escapeHtml(doctor.full_name)}"
                    onerror="
                        this.style.display='none';
                        this.nextElementSibling.style.display='flex';
                    "
                >
                <div
                    class="doctor-avatar-placeholder"
                    style="display:none"
                >
                    <i class="fa-solid fa-user-doctor"></i>
                </div>
            `
            : `
                <div class="doctor-avatar-placeholder">
                    <i class="fa-solid fa-user-doctor"></i>
                </div>
            `;
    return `
        <article class="doctor-page-card">
            <div class="doctor-page-avatar">
                ${avatar}
            </div>
            <div class="doctor-page-content">
                <span class="doctor-page-specialty">
                    ${
                        escapeHtml(
                            doctor.specialty_name ||
                            "Chưa cập nhật chuyên khoa"
                        )
                    }
                </span>
                <h2>
                    BS.
                    ${
                        escapeHtml(
                            doctor.full_name ||
                            "Bác sĩ"
                        )
                    }
                </h2>
                <div class="doctor-page-meta">
                    <span>
                        <i class="fa-solid fa-briefcase"></i>
                        ${
                            doctor.experience_years ?? 0
                        }
                        năm kinh nghiệm
                    </span>
                    <span>
                        <i class="fa-solid fa-id-card"></i>
                        ${
                            escapeHtml(
                                doctor.license_number ||
                                "Chưa cập nhật"
                            )
                        }
                    </span>
                </div>
                <p>
                    ${
                        escapeHtml(
                            doctor.introduction ||
                            "Bác sĩ đang cập nhật thông tin."
                        )
                    }
                </p>
                <div class="doctor-page-actions">
                    <a
                        class="btn btn-outline"
                        href="doctor-detail.html?id=${doctor.id}"
                    >
                        <i class="fa-solid fa-eye"></i>
                        Xem chi tiết
                    </a>
                    <button
                        type="button"
                        class="btn btn-primary"
                        onclick="bookDoctor(${doctor.id})"
                    >
                        <i class="fa-solid fa-calendar-check"></i>
                        Đặt lịch
                    </button>
                </div>
            </div>
        </article>
    `;
}
/* =====================================================
   CHUYÊN KHOA
===================================================== */
async function loadSpecialties() {
    const select =
        document.getElementById(
            "specialtyFilter"
        );
    if (!select) return;
    try {
        const result =
            await apiFetch("/api/specialties");
        const specialties =
            Array.isArray(result)
                ? result
                : Array.isArray(result.data)
                    ? result.data
                    : [];
        specialties.forEach(
            specialty => {
                const option =
                    document.createElement(
                        "option"
                    );
                option.value =
                    specialty.id;
                option.textContent =
                    specialty.name;
                select.appendChild(option);
            }
        );
    }
    catch (error) {
        console.warn(
            "Không tải được chuyên khoa:",
            error
        );
        /*
         * Nếu API chuyên khoa chưa có,
         * lấy chuyên khoa trực tiếp từ
         * danh sách bác sĩ.
         */
        const names =
            [
                ...new Set(
                    allDoctors
                        .map(
                            doctor =>
                                doctor.specialty_name
                        )
                        .filter(Boolean)
                )
            ];
        names.forEach(
            name => {
                const option =
                    document.createElement(
                        "option"
                    );
                option.value = name;
                option.textContent = name;
                select.appendChild(option);
            }
        );
    }
}
/* =====================================================
   TÌM KIẾM
===================================================== */
function setupSearch() {
    const keyword =
        document.getElementById(
            "doctorKeyword"
        );
    const specialty =
        document.getElementById(
            "specialtyFilter"
        );
    const button =
        document.getElementById(
            "searchDoctorButton"
        );
    function search() {
        const keywordValue =
            keyword.value
                .trim()
                .toLowerCase();
        const specialtyValue =
            specialty.value;
        const filtered =
            allDoctors.filter(
                doctor => {
                    const name =
                        (
                            doctor.full_name ||
                            ""
                        ).toLowerCase();
                    const specialtyName =
                        String(
                            doctor.specialty_id ||
                            ""
                        );
                    const specialtyText =
                        (
                            doctor.specialty_name ||
                            ""
                        ).toLowerCase();
                    const matchKeyword =
                        !keywordValue ||
                        name.includes(
                            keywordValue
                        );
                    const matchSpecialty =
                        !specialtyValue ||
                        specialtyName ===
                            String(
                                specialtyValue
                            ) ||
                        specialtyText ===
                            String(
                                specialtyValue
                            ).toLowerCase();
                    return (
                        matchKeyword &&
                        matchSpecialty
                    );
                }
            );
        renderDoctors(filtered);
    }
    button.addEventListener(
        "click",
        search
    );
    keyword.addEventListener(
        "keydown",
        function (event) {
            if (event.key === "Enter") {
                search();
            }
        }
    );
    specialty.addEventListener(
        "change",
        search
    );
}
/* =====================================================
   ĐẶT LỊCH
===================================================== */
function bookDoctor(doctorId) {
    window.location.href =
        `index.html?doctor=${encodeURIComponent(doctorId)}#appointmentPanel`;
}
/* =====================================================
   ESCAPE HTML
===================================================== */
function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}