
/* =====================================================
   DOCTORS PAGE - CLINIC BOOKING

   1. Tải danh sách bác sĩ
   2. Tải danh sách chuyên khoa
   3. Hiển thị thông tin bác sĩ
   4. Hiển thị đánh giá và kinh nghiệm
   5. Tìm kiếm bác sĩ
   6. Lọc theo chuyên khoa
   7. Chuyển đến trang đặt lịch
===================================================== */

let allDoctors = [];

/* =====================================================
   KHỞI TẠO TRANG
===================================================== */

document.addEventListener("DOMContentLoaded", async function () {
    setupSearch();

    await loadDoctors();
    await loadSpecialties();
});


/* =====================================================
   LẤY DANH SÁCH BÁC SĨ
===================================================== */

async function loadDoctors() {
    const doctorList = document.getElementById("doctorList");
    const resultCount = document.getElementById("doctorResultCount");

    if (!doctorList) return;

    doctorList.innerHTML = `
        <div class="page-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            <p>Đang tải danh sách bác sĩ...</p>
        </div>
    `;

    if (resultCount) {
        resultCount.textContent = "Đang tải danh sách...";
    }

    try {
        const result = await apiFetch("/api/doctors");

        const doctors = Array.isArray(result)
            ? result
            : Array.isArray(result?.data)
                ? result.data
                : [];

        allDoctors = doctors;

        renderDoctors(allDoctors);
    } catch (error) {
        console.error("Lỗi tải danh sách bác sĩ:", error);

        doctorList.innerHTML = `
            <div class="doctor-page-error">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <h3>Không thể tải danh sách bác sĩ</h3>
                <p>
                    Vui lòng kiểm tra kết nối máy chủ
                    và thử lại.
                </p>
                <button
                    type="button"
                    class="btn btn-primary"
                    onclick="loadDoctors()">
                    <i class="fa-solid fa-rotate-right"></i>
                    Thử lại
                </button>
            </div>
        `;

        if (resultCount) {
            resultCount.textContent = "Không tải được dữ liệu";
        }
    }
}


/* =====================================================
   HIỂN THỊ DANH SÁCH BÁC SĨ
===================================================== */

function renderDoctors(doctors) {
    const doctorList = document.getElementById("doctorList");
    const resultCount = document.getElementById("doctorResultCount");

    if (!doctorList) return;

    if (!Array.isArray(doctors) || doctors.length === 0) {
        doctorList.innerHTML = `
            <div class="doctor-page-empty">
                <i class="fa-solid fa-user-doctor"></i>
                <h3>Không tìm thấy bác sĩ</h3>
                <p>
                    Không có bác sĩ phù hợp với điều kiện tìm kiếm.
                </p>
            </div>
        `;

        if (resultCount) {
            resultCount.textContent = "Không có kết quả";
        }

        return;
    }

    doctorList.innerHTML = doctors
        .map(doctor => createDoctorCard(doctor))
        .join("");

    if (resultCount) {
        resultCount.textContent = `Tìm thấy ${doctors.length} bác sĩ`;
    }
}


/* =====================================================
   TẠO THẺ BÁC SĨ
===================================================== */

function createDoctorCard(doctor) {
    const doctorId = getDoctorId(doctor);

    const doctorName = doctor.full_name || "Bác sĩ";

    const specialtyName =
        doctor.specialty_name || "Chưa cập nhật chuyên khoa";

    const experience = Number(doctor.experience_years ?? 0);

    const licenseNumber =
        doctor.license_number || "Chưa cập nhật";

    const introduction =
        doctor.introduction || "Bác sĩ đang cập nhật thông tin.";

    const avatar = doctor.avatar || "";

    const rating = getDoctorRating(doctor);

    const reviewCount = getDoctorReviewCount(doctor);

    const ratingHtml = createRatingHtml(rating, reviewCount);

    const avatarHtml = createAvatarHtml(avatar, doctorName);

    const detailUrl = doctorId
        ? `doctor-detail.html?id=${encodeURIComponent(doctorId)}`
        : "javascript:void(0)";

    const bookingButton = doctorId
        ? `
            <button
                type="button"
                class="doctor-book-button"
                onclick="bookDoctor('${escapeHtml(String(doctorId))}')">
                <i class="fa-solid fa-calendar-check"></i>
                Đặt lịch
            </button>
        `
        : `
            <button
                type="button"
                class="doctor-book-button"
                disabled>
                <i class="fa-solid fa-calendar-xmark"></i>
                Chưa khả dụng
            </button>
        `;

    return `
        <article class="doctor-page-card">

            <div class="doctor-page-avatar">
                ${avatarHtml}
            </div>

            <div class="doctor-page-content">

                <span class="doctor-page-specialty">
                    ${escapeHtml(specialtyName)}
                </span>

                <h2>
                    BS. ${escapeHtml(doctorName)}
                </h2>

                <div class="doctor-card-stats">

                    <div class="doctor-stat">
                        <span class="doctor-stat-label">
                            <i class="fa-solid fa-star"></i>
                            Đánh giá
                        </span>

                        <div class="doctor-stat-value">
                            ${ratingHtml}
                        </div>
                    </div>

                    <div class="doctor-stat">
                        <span class="doctor-stat-label">
                            <i class="fa-solid fa-briefcase"></i>
                            Kinh nghiệm
                        </span>

                        <span class="doctor-stat-value">
                            ${experience} năm
                        </span>
                    </div>

                </div>

                <p class="doctor-page-description">
                    ${escapeHtml(introduction)}
                </p>

                <div class="doctor-license">
                    <i class="fa-solid fa-id-card"></i>
                    <span>
                        Chứng chỉ hành nghề:
                        ${escapeHtml(licenseNumber)}
                    </span>
                </div>

                <div class="doctor-page-actions">

                    <a
                        class="doctor-detail-button"
                        href="${detailUrl}">
                        <i class="fa-solid fa-eye"></i>
                        Chi tiết
                    </a>

                    ${bookingButton}

                </div>

            </div>
        </article>
    `;
}


/* =====================================================
   LẤY ID BÁC SĨ
===================================================== */

function getDoctorId(doctor) {
    return (
        doctor.doctor_id ??
        doctor.id ??
        doctor.user_id ??
        null
    );
}


/* =====================================================
   HIỂN THỊ ẢNH BÁC SĨ
===================================================== */

function createAvatarHtml(avatar, doctorName) {
    if (!avatar) {
        return `
            <div class="doctor-avatar-placeholder">
                <i class="fa-solid fa-user-doctor"></i>
            </div>
        `;
    }

    return `
        <img
            src="${escapeHtml(avatar)}"
            alt="${escapeHtml(doctorName)}"
            loading="lazy"
            onerror="
                this.style.display='none';
                this.nextElementSibling.style.display='flex';
            "
        >

        <div
            class="doctor-avatar-placeholder"
            style="display:none">
            <i class="fa-solid fa-user-doctor"></i>
        </div>
    `;
}


/* =====================================================
   LẤY ĐIỂM ĐÁNH GIÁ

   Hỗ trợ một số tên thuộc tính phổ biến.
   Nếu API chưa trả về điểm đánh giá thì hiển thị
   "Chưa có đánh giá", không tự tạo điểm giả.
===================================================== */

function getDoctorRating(doctor) {
    const value =
        doctor.average_rating ??
        doctor.averageRating ??
        doctor.rating ??
        doctor.avg_rating ??
        null;

    if (value === null || value === undefined || value === "") {
        return null;
    }

    const rating = Number(value);

    if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
        return null;
    }

    return rating;
}


/* =====================================================
   LẤY SỐ LƯỢT ĐÁNH GIÁ
===================================================== */

function getDoctorReviewCount(doctor) {
    const value =
        doctor.review_count ??
        doctor.reviewCount ??
        doctor.total_reviews ??
        doctor.totalReviews ??
        doctor.rating_count ??
        0;

    const count = Number(value);

    return Number.isFinite(count) && count >= 0
        ? count
        : 0;
}


/* =====================================================
   TẠO HIỂN THỊ SAO ĐÁNH GIÁ
===================================================== */

function createRatingHtml(rating, reviewCount) {
    if (rating === null || reviewCount === 0) {
        return `
            <div class="doctor-rating-line">
                <span class="doctor-rating-stars">
                    <i class="fa-regular fa-star"></i>
                </span>

                <span>Chưa có đánh giá</span>
            </div>
        `;
    }

    const roundedRating = Math.round(rating);

    let stars = "";

    for (let i = 1; i <= 5; i++) {
        stars += i <= roundedRating
            ? '<i class="fa-solid fa-star"></i>'
            : '<i class="fa-regular fa-star"></i>';
    }

    return `
        <div class="doctor-rating-line">

            <span class="doctor-rating-stars">
                ${stars}
            </span>

            <span>
                ${rating.toFixed(1)}
            </span>

            <span class="doctor-rating-count">
                (${reviewCount} lượt)
            </span>

        </div>
    `;
}


/* =====================================================
   TẢI DANH SÁCH CHUYÊN KHOA
===================================================== */

async function loadSpecialties() {
    const select = document.getElementById("specialtyFilter");

    if (!select) return;

    try {
        const result = await apiFetch("/api/specialties");

        const specialties = Array.isArray(result)
            ? result
            : Array.isArray(result?.data)
                ? result.data
                : [];

        select.innerHTML = `
            <option value="">Tất cả chuyên khoa</option>
        `;

        if (specialties.length > 0) {
            specialties.forEach(specialty => {
                const option = document.createElement("option");

                option.value = specialty.id;
                option.textContent = specialty.name;

                select.appendChild(option);
            });

            return;
        }

        loadSpecialtiesFromDoctors();
    } catch (error) {
        console.warn("Không tải được chuyên khoa:", error);

        loadSpecialtiesFromDoctors();
    }
}


/* =====================================================
   LẤY CHUYÊN KHOA TỪ DANH SÁCH BÁC SĨ
===================================================== */

function loadSpecialtiesFromDoctors() {
    const select = document.getElementById("specialtyFilter");

    if (!select) return;

    select.innerHTML = `
        <option value="">Tất cả chuyên khoa</option>
    `;

    const specialties = new Map();

    allDoctors.forEach(doctor => {
        if (doctor.specialty_id && doctor.specialty_name) {
            specialties.set(
                String(doctor.specialty_id),
                doctor.specialty_name
            );
        }
    });

    specialties.forEach((name, id) => {
        const option = document.createElement("option");

        option.value = id;
        option.textContent = name;

        select.appendChild(option);
    });
}


/* =====================================================
   TÌM KIẾM VÀ LỌC BÁC SĨ
===================================================== */

function setupSearch() {
    const keywordInput = document.getElementById("doctorKeyword");

    const specialtySelect = document.getElementById("specialtyFilter");

    const searchButton = document.getElementById("searchDoctorButton");

    if (searchButton) {
        searchButton.addEventListener("click", searchDoctors);
    }

    if (keywordInput) {
        keywordInput.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                searchDoctors();
            }
        });

        // Tìm kiếm trực tiếp khi nhập
        keywordInput.addEventListener("input", searchDoctors);
    }

    if (specialtySelect) {
        specialtySelect.addEventListener("change", searchDoctors);
    }
}


/* =====================================================
   THỰC HIỆN TÌM KIẾM
===================================================== */

function searchDoctors() {
    const keywordInput = document.getElementById("doctorKeyword");

    const specialtySelect = document.getElementById("specialtyFilter");

    const keyword = keywordInput
        ? normalizeText(keywordInput.value.trim())
        : "";

    const specialtyValue = specialtySelect
        ? specialtySelect.value
        : "";

    const filteredDoctors = allDoctors.filter(doctor => {
        const doctorName = normalizeText(doctor.full_name || "");

        const specialtyName = normalizeText(
            doctor.specialty_name || ""
        );

        const specialtyId = String(doctor.specialty_id ?? "");

        const matchKeyword =
            !keyword || doctorName.includes(keyword);

        const matchSpecialty =
            !specialtyValue ||
            specialtyId === String(specialtyValue) ||
            specialtyName === normalizeText(specialtyValue);

        return matchKeyword && matchSpecialty;
    });

    renderDoctors(filteredDoctors);
}


/* =====================================================
   CHUẨN HÓA CHUỖI TÌM KIẾM
===================================================== */

function normalizeText(value) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .toLowerCase();
}


/* =====================================================
   ĐẶT LỊCH KHÁM
===================================================== */

function bookDoctor(doctorId) {
    if (!doctorId) {
        alert("Không xác định được bác sĩ cần đặt lịch.");
        return;
    }

    let user = null;

    try {
        user = JSON.parse(localStorage.getItem("user") || "null");
    } catch (error) {
        console.warn("Không đọc được thông tin tài khoản:", error);
    }

    // Chưa đăng nhập thì chuyển đến trang đăng nhập
    if (!user) {
        const returnUrl =
            `index.html?doctor=${encodeURIComponent(doctorId)}#appointmentPanel`;

        window.location.href =
            `login.html?redirect=${encodeURIComponent(returnUrl)}`;

        return;
    }

    // Chỉ bệnh nhân mới được đặt lịch
    const role = String(user.role || "").toUpperCase();

    if (role && role !== "PATIENT") {
        alert("Chỉ tài khoản bệnh nhân mới có thể đặt lịch khám.");
        return;
    }

    // Giữ cách chuyển trang của hệ thống hiện tại
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
