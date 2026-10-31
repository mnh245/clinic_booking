// =====================================================
// CLINIC BOOKING - HOME PAGE
// =====================================================

let allDoctors = [];
let selectedDoctor = null;
let currentAppointmentType = "GENERAL";
// =====================================================
// KHỞI TẠO TRANG
// =====================================================

document.addEventListener("DOMContentLoaded", async function () {
    setupLoginState();
    setupSearch();
    setupBookingForm();
    setupBookingPanel();
    await loadDoctors();
});
// =====================================================
// 1. TRẠNG THÁI ĐĂNG NHẬP
// =====================================================

function setupLoginState() {
    const loginLink = document.getElementById("loginLink");
    const registerLink = document.getElementById("registerLink");
    const userInfo = document.getElementById("userInfo");
    const welcomeUser = document.getElementById("welcomeUser");
    const logoutButton = document.getElementById("logoutButton");
    const user = getCurrentUser();
    if (!user) {
        if (loginLink) loginLink.style.display = "inline-flex";
        if (registerLink) registerLink.style.display = "inline-flex";
        if (userInfo) userInfo.style.display = "none";
    } else {
        if (loginLink) loginLink.style.display = "none";
        if (registerLink) registerLink.style.display = "none";
        if (userInfo) userInfo.style.display = "flex";
        if (welcomeUser) {
            welcomeUser.textContent =
                "Xin chào, " +
                (
                    user.full_name ||
                    user.fullName ||
                    user.email ||
                    "bạn"
                );
        }
    }
    if (logoutButton) {
        logoutButton.addEventListener("click", handleLogout);
    }
}
// =====================================================
// 2. LẤY USER HIỆN TẠI
// =====================================================

function getCurrentUser() {
    const value = localStorage.getItem("user");
    if (!value) {
        return null;
    }
    try {
        return JSON.parse(value);
    } catch (error) {
        console.error("Không thể đọc user:", error);
        localStorage.removeItem("user");
        return null;
    }
}
// =====================================================
// 2.1. ĐIỀN TRƯỚC THÔNG TIN LIÊN HỆ ĐẶT LỊCH
// =====================================================

function setBookingFieldIfEmpty(id, value) {
    const field = document.getElementById(id);
    if (!field || field.value.trim()) {
        return;
    }
    const text = String(value ?? "").trim();
    if (text) {
        field.value = text;
    }
}

async function prefillBookingContact() {
    const user = getCurrentUser() || {};
    setBookingFieldIfEmpty(
        "bookingContactName",
        user.full_name || user.name
    );
    setBookingFieldIfEmpty(
        "bookingContactEmail",
        user.email
    );
    setBookingFieldIfEmpty(
        "bookingContactPhone",
        user.phone
    );
    setBookingFieldIfEmpty(
        "bookingContactAddress",
        user.address
    );
    try {
        const result = await apiFetch("/api/profile", {
            cache: "no-store"
        });
        const profile =
            result?.data?.user ||
            result?.data ||
            result?.user ||
            result?.profile ||
            null;
        if (!profile || typeof profile !== "object") {
            return;
        }
        setBookingFieldIfEmpty(
            "bookingContactName",
            profile.full_name || profile.name
        );
        setBookingFieldIfEmpty(
            "bookingContactEmail",
            profile.email
        );
        setBookingFieldIfEmpty(
            "bookingContactPhone",
            profile.phone
        );
        setBookingFieldIfEmpty(
            "bookingContactAddress",
            profile.address
        );
    } catch (error) {
        console.warn(
            "Không thể tự điền hồ sơ vào form đặt lịch:",
            error.message
        );
    }
}
// =====================================================
// 3. ĐĂNG XUẤT
// =====================================================

async function handleLogout() {
    const confirmed = window.confirm(
        "Bạn có chắc chắn muốn đăng xuất?"
    );
    if (!confirmed) {
        return;
    }
    try {
        await fetch("/api/logout", {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            }
        });
    } catch (error) {
        console.warn(
            "Không thể gọi API logout:",
            error
        );
    }
    localStorage.removeItem("user");
    localStorage.removeItem("role");
    localStorage.removeItem("vaiTro");
    sessionStorage.clear();
    window.location.href = "login.html";
}
// =====================================================
// 4. LẤY BÁC SĨ TỪ DATABASE
// =====================================================

async function loadDoctors() {
    const doctorGrid = document.getElementById("doctorList");
    if (!doctorGrid) {
        return;
    }
    doctorGrid.innerHTML = `
        <div class="loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            Đang tải danh sách bác sĩ...
        </div>
    `;
    try {
      const result = await getDoctorsFromAPI();
        if (
            !result ||
            !result.success ||
            !Array.isArray(result.data)
        ) {
            throw new Error("Dữ liệu bác sĩ không hợp lệ.");
        }
        allDoctors = result.data;
        renderSpecialties(allDoctors);
        renderFeaturedDoctors(allDoctors);
        populateDoctorSelect();
        applyHomeSearch();
        // Áp dụng bộ lọc theo hình thức khám mặc định.
        applyAppointmentTypeFilter();
    } catch (error) {
        console.error("LOAD DOCTORS ERROR:", error);
        doctorGrid.innerHTML = `
            <div class="card specialty-card">
                <div class="specialty-icon">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                </div>
                <h3>Không thể tải dữ liệu</h3>
                <p>
                    Không thể kết nối đến hệ thống bác sĩ.
                </p>
                <button
                    type="button"
                    class="btn btn-primary retry-doctors"
                >
                    <i class="fa-solid fa-rotate"></i>
                    Thử lại
                </button>
            </div>
        `;
        const retryButton =
            doctorGrid.querySelector(".retry-doctors");
        if (retryButton) {
            retryButton.addEventListener(
                "click",
                loadDoctors
            );
        }
    }
}
// =====================================================
// 5. TẠO SLUG CHUYÊN KHOA
// =====================================================

function createSpecialtySlug(name) {
    return String(name || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/đ/g, "d")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
// =====================================================
// 6. ICON CHUYÊN KHOA
// =====================================================

function getSpecialtyIcon(name) {
    const value = String(name || "").toLowerCase();
    if (value.includes("tim")) {
        return "fa-heart-pulse";
    }
    if (value.includes("nhi")) {
        return "fa-child";
    }
    if (value.includes("thần kinh")) {
        return "fa-brain";
    }
    if (value.includes("da liễu")) {
        return "fa-hand-dots";
    }
    if (
        value.includes("tai") ||
        value.includes("mũi") ||
        value.includes("họng")
    ) {
        return "fa-ear-listen";
    }
    if (value.includes("ngoại")) {
        return "fa-scissors";
    }
    if (value.includes("nội")) {
        return "fa-stethoscope";
    }
    if (value.includes("răng")) {
        return "fa-tooth";
    }
    return "fa-stethoscope";
}
// =====================================================
// 7. FORMAT KINH NGHIỆM
// =====================================================

function formatExperience(years) {
    if (years === null || years === undefined) {
        return "Chưa cập nhật kinh nghiệm";
    }
    const value = Number(years);
    if (value === 0) {
        return "Dưới 1 năm kinh nghiệm";
    }
    return value + " năm kinh nghiệm";
}
// =====================================================
// 8. HIỂN THỊ CHUYÊN KHOA
// =====================================================

function renderSpecialties(doctors) {
    const specialtyGrid =
        document.getElementById("specialtyGrid");
    if (!specialtyGrid) {
        return;
    }
    const specialtyMap = new Map();
    doctors.forEach(function (doctor) {
        if (
            !doctor.specialty_id ||
            !doctor.specialty_name
        ) {
            return;
        }
        if (!specialtyMap.has(doctor.specialty_id)) {
            specialtyMap.set(
                doctor.specialty_id,
                {
                    id: doctor.specialty_id,
                    name: doctor.specialty_name,
                    count: 0
                }
            );
        }
        specialtyMap.get(doctor.specialty_id).count++;
    });
    const specialties =
        Array.from(specialtyMap.values());
    if (!specialties.length) {
        specialtyGrid.innerHTML = `
            <div class="card specialty-card">
                <div class="specialty-icon">
                    <i class="fa-solid fa-circle-exclamation"></i>
                </div>
                <h3>Chưa có chuyên khoa</h3>
                <p>
                    Hiện chưa có dữ liệu chuyên khoa.
                </p>
            </div>
        `;
        return;
    }
    specialtyGrid.innerHTML = specialties
        .slice(0, 4)
        .map(function (specialty) {
            const slug =
                createSpecialtySlug(specialty.name);
            const icon =
                getSpecialtyIcon(specialty.name);
            return `
                <a
                    href="doctors.html?specialty=${encodeURIComponent(slug)}"
                    class="card specialty-card"
                >
                    <div class="specialty-icon">
                        <i class="fa-solid ${icon}"></i>
                    </div>
                    <h3>${escapeHtml(specialty.name)}</h3>
                    <p>
                        ${specialty.count}
                        bác sĩ đang hoạt động
                        trong chuyên khoa này.
                    </p>
                    <span class="specialty-more">
                        Xem bác sĩ
                        <i class="fa-solid fa-arrow-right"></i>
                    </span>
                </a>
            `;
        })
        .join("");
    const specialtySelect =
        document.getElementById("specialtySelect");
    if (specialtySelect) {
        specialtySelect.innerHTML = `
            <option value="">
                Tất cả chuyên khoa
            </option>
        `;
        specialties.forEach(function (specialty) {
            const option =
                document.createElement("option");
            option.value =
                createSpecialtySlug(specialty.name);
            option.textContent = specialty.name;
            specialtySelect.appendChild(option);
        });
    }
}
// =====================================================
// 9. HIỂN THỊ BÁC SĨ
// =====================================================

function renderDoctors(doctors, options = {}) {
    const doctorGrid =
        document.getElementById("doctorList");
    if (!doctorGrid) {
        return;
    }
    const searchActive =
        Boolean(options.searchActive);
    const visibleDoctors =
        options.showAll
            ? doctors
            : doctors.slice(0, 6);
    if (!visibleDoctors.length) {
        doctorGrid.innerHTML = `
            <div class="card specialty-card">
                <div class="specialty-icon">
                    <i class="fa-solid fa-user-doctor"></i>
                </div>
                <h3>
                    ${
                        searchActive
                            ? "Không tìm thấy bác sĩ phù hợp"
                            : "Chưa có bác sĩ"
                    }
                </h3>
                <p>
                    ${
                        searchActive
                            ? "Hãy thử tên bác sĩ khác hoặc chọn một chuyên khoa khác."
                            : "Hiện chưa có dữ liệu bác sĩ."
                    }
                </p>
            </div>
        `;
        return;
    }
    doctorGrid.innerHTML = visibleDoctors
        .map(doctor => {
            const fullName =
                doctor.full_name || "Bác sĩ";
            const specialtyName =
                doctor.specialty_name ||
                "Chưa cập nhật chuyên khoa";
            const introduction =
                doctor.introduction ||
                "Bác sĩ đang cập nhật thông tin giới thiệu.";
            const experience =
                formatExperience(doctor.experience_years);
            const rating =
                doctor.rating
                    ? Number(doctor.rating).toFixed(1)
                    : "Chưa có đánh giá";
            const avatar = doctor.avatar
                ? `
                    <img
                        src="${escapeHtml(doctor.avatar)}"
                        alt="BS. ${escapeHtml(fullName)}"
                        loading="lazy"
                    >
                `
                : `
                    <i
                        class="fa-solid fa-user-doctor"
                        aria-hidden="true"
                    ></i>
                `;
            return `
                <article class="card doctor-card">
                    <div class="doctor-cover"></div>
                    <div class="doctor-body">
                        <div class="doctor-avatar">
                            ${avatar}
                        </div>
                        <h3>
                            BS. ${escapeHtml(fullName)}
                        </h3>
                        <div class="doctor-specialty">
                            ${escapeHtml(specialtyName)}
                        </div>
                        <div class="doctor-info">
                            ${escapeHtml(introduction)}
                        </div>
                        <span class="chip">
                            <i
                                class="fa-regular fa-clock"
                                aria-hidden="true"
                            ></i>
                            ${escapeHtml(experience)}
                        </span>
                        <div class="doctor-card-footer">
                            <span class="rating">
                                <i
                                    class="fa-solid fa-star"
                                    aria-hidden="true"
                                ></i>
                                <span>
                                    ${escapeHtml(rating)}
                                </span>
                            </span>
                            <button
                                type="button"
                                class="btn btn-primary doctor-book-button"
                                data-doctor-id="${Number(doctor.id)}"
                            >
                                <i
                                    class="fa-solid fa-calendar-check"
                                    aria-hidden="true"
                                ></i>
                                Đặt lịch
                            </button>
                        </div>
                    </div>
                </article>
            `;
        })
        .join("");
    doctorGrid
        .querySelectorAll(".doctor-book-button")
        .forEach(button => {
            button.addEventListener("click", function () {
                openBookingPanel(
                    Number(this.dataset.doctorId)
                );
            });
        });
}
// =====================================================
// 10. HIỂN THỊ BÁC SĨ NỔI BẬT
// =====================================================

function renderFeaturedDoctors(doctors) {
    const featuredDoctors =
        document.getElementById("featuredDoctors");
    if (!featuredDoctors) {
        return;
    }
    if (!doctors.length) {
        featuredDoctors.innerHTML = `
            <div class="doctor-mini">
                <div class="doctor-avatar">
                    <i class="fa-solid fa-user-doctor"></i>
                </div>
                <div class="doctor-info">
                    <strong>Chưa có bác sĩ</strong>
                    <span>Chưa có dữ liệu bác sĩ</span>
                </div>
            </div>
        `;
        return;
    }
    featuredDoctors.innerHTML = doctors
        .slice(0, 3)
        .map(function (doctor) {
            return `
                <button
                    type="button"
                    class="doctor-mini doctor-featured-button"
                    data-doctor-id="${doctor.id}"
                >
                    <div class="doctor-avatar">
                        ${
                            doctor.avatar
                                ? `
                                    <img
                                        src="${escapeHtml(doctor.avatar)}"
                                        alt="BS. ${escapeHtml(doctor.full_name)}"
                                        style="
                                            width:100%;
                                            height:100%;
                                            object-fit:cover;
                                            border-radius:50%;
                                        "
                                    >
                                `
                                : `
                                    <i class="fa-solid fa-user-doctor"></i>
                                `
                        }
                    </div>
                    <div class="doctor-info">
                        <strong>
                            BS. ${escapeHtml(
                                doctor.full_name || "Bác sĩ"
                            )}
                        </strong>
                        <span>
                            ${escapeHtml(
                                doctor.specialty_name ||
                                "Chưa cập nhật chuyên khoa"
                            )}
                            •
                            ${formatExperience(
                                doctor.experience_years
                            )}
                        </span>
                    </div>
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
            `;
        })
        .join("");
    featuredDoctors
        .querySelectorAll(".doctor-featured-button")
        .forEach(function (button) {
            button.addEventListener("click", function () {
                const doctorId =
                    Number(this.dataset.doctorId);
                openBookingPanel(doctorId);
            });
        });
}
// =====================================================
// 11. LỌC BÁC SĨ THEO HÌNH THỨC KHÁM
// =====================================================
// Chuẩn hóa tên chuyên khoa để so sánh.
function normalizeSpecialtyName(name) {
    return String(name || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/đ/g, "d")
        .trim();
}
// Nhận diện bác sĩ thuộc chuyên khoa khám tổng quát.
function isGeneralCheckupDoctor(doctor) {
    const specialtyName =
        normalizeSpecialtyName(doctor.specialty_name);
    return (
        specialtyName.includes("kham tong quat") ||
        specialtyName.includes("tong quat") ||
        specialtyName.includes("bac si gia dinh")
    );
}
// Lấy danh sách bác sĩ theo hình thức khám.
function getDoctorsByAppointmentType(type) {
    if (type === "GENERAL") {
        return allDoctors.filter(function (doctor) {
            return isGeneralCheckupDoctor(doctor);
        });
    }
    if (type === "SPECIALTY") {
        return allDoctors.filter(function (doctor) {
            return !isGeneralCheckupDoctor(doctor);
        });
    }
    return [];
}
// Cập nhật danh sách bác sĩ trong select.
function populateDoctorSelect() {
    const doctorSelect =
        document.getElementById("doctorSelect");
    if (!doctorSelect) {
        return;
    }
     console.log("Appointment type:", currentAppointmentType);
    console.log("All doctors:", allDoctors);

    console.log(
        "General doctors:",
        allDoctors.filter(isGeneralCheckupDoctor)
    );
    const filteredDoctors =
        getDoctorsByAppointmentType(currentAppointmentType);
    doctorSelect.innerHTML = `
        <option value="">
            -- Chọn bác sĩ --
        </option>
    `;
    if (!filteredDoctors.length) {
        const option =
            document.createElement("option");
        option.value = "";
        option.disabled = true;
        option.textContent =
            currentAppointmentType === "GENERAL"
                ? "Chưa có bác sĩ khám tổng quát"
                : "Chưa có bác sĩ chuyên khoa";
        doctorSelect.appendChild(option);
        return;
    }
    filteredDoctors.forEach(function (doctor) {
        const option =
            document.createElement("option");
        option.value = doctor.id;
        option.textContent =
            `BS. ${
                doctor.full_name || "Bác sĩ"
            } - ${
                doctor.specialty_name ||
                "Chưa cập nhật chuyên khoa"
            }`;
        doctorSelect.appendChild(option);
    });
}
// Áp dụng bộ lọc khi thay đổi hình thức khám.
function applyAppointmentTypeFilter() {
    const appointmentType =
        document.getElementById("appointmentType");
    const hint =
        document.getElementById("appointmentTypeHint");
    if (appointmentType) {
        currentAppointmentType =
            appointmentType.value || "GENERAL";
    }
    // Xóa bác sĩ và giờ khám cũ để tránh chọn nhầm.
    selectedDoctor = null;
    const doctorSelect =
        document.getElementById("doctorSelect");
    if (doctorSelect) {
        doctorSelect.value = "";
    }
    const bookingDoctorId =
        document.getElementById("bookingDoctorId");
    if (bookingDoctorId) {
        bookingDoctorId.value = "";
    }
    updateSelectedDoctorInfo(null);
    resetSlots();
    const appointmentDate =
        document.getElementById("appointmentDate");
    if (appointmentDate) {
        appointmentDate.value = "";
        appointmentDate.disabled = true;
    }
    populateDoctorSelect();
    if (hint) {
        hint.textContent =
            currentAppointmentType === "GENERAL"
                ? "Hệ thống chỉ hiển thị bác sĩ thuộc chuyên khoa Khám tổng quát."
                : "Hệ thống chỉ hiển thị bác sĩ thuộc các chuyên khoa phù hợp.";
    }
}
// =====================================================
// 12. MỞ FORM ĐẶT LỊCH
// =====================================================

function openBookingPanel(doctorId = null) {
    const panel =
        document.getElementById("appointmentPanel");
    if (!panel) {
        return;
    }
    const user = getCurrentUser();
    if (!user) {
        alert(
            "Bạn cần đăng nhập trước khi đặt lịch."
        );
        window.location.href = "login.html";
        return;
    }
    panel.classList.add("is-open");
    void prefillBookingContact();
    if (doctorId) {
        const doctor = getDoctorById(doctorId);
        if (!doctor) {
            return;
        }
        // Tự xác định hình thức khám theo bác sĩ được chọn.
        const appointmentType =
            document.getElementById("appointmentType");
        const doctorIsGeneral =
            isGeneralCheckupDoctor(doctor);
        const requiredType =
            doctorIsGeneral ? "GENERAL" : "SPECIALTY";
        if (appointmentType) {
            appointmentType.value = requiredType;
        }
        currentAppointmentType = requiredType;
        populateDoctorSelect();
        selectedDoctor = doctor;
        const doctorSelect =
            document.getElementById("doctorSelect");
        if (doctorSelect) {
            doctorSelect.value = String(doctorId);
        }
        const bookingDoctorId =
            document.getElementById("bookingDoctorId");
        if (bookingDoctorId) {
            bookingDoctorId.value = String(doctorId);
        }
        updateSelectedDoctorInfo(doctor);
        resetSlots();
        const appointmentDate =
            document.getElementById("appointmentDate");
        if (appointmentDate) {
            appointmentDate.disabled = false;
        }
    } else {
        applyAppointmentTypeFilter();
    }
    setTimeout(function () {
        panel.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }, 50);
}
// =====================================================
// 13. ĐÓNG FORM
// =====================================================

function closeBookingPanel() {
    const panel =
        document.getElementById("appointmentPanel");
    if (panel) {
        panel.classList.remove("is-open");
    }
}
// =====================================================
// 14. CẤU HÌNH FORM ĐẶT LỊCH
// =====================================================

function setupBookingPanel() {
    const heroBookingButton =
        document.getElementById("heroBookingButton");
    const closeAppointment =
        document.getElementById("closeAppointment");
    const cancelBooking =
        document.getElementById("cancelBooking");
    if (heroBookingButton) {
        heroBookingButton.addEventListener(
            "click",
            function () {
                openBookingPanel();
            }
        );
    }
    if (closeAppointment) {
        closeAppointment.addEventListener(
            "click",
            closeBookingPanel
        );
    }
    if (cancelBooking) {
        cancelBooking.addEventListener(
            "click",
            closeBookingPanel
        );
    }
}
// =====================================================
// 15. FORM ĐẶT LỊCH
// =====================================================

function setupBookingForm() {
    const doctorSelect =
        document.getElementById("doctorSelect");
    const appointmentDate =
        document.getElementById("appointmentDate");
    const appointmentForm =
        document.getElementById("appointmentForm");
    const appointmentType =
        document.getElementById("appointmentType");
    void prefillBookingContact();
    // Thay đổi hình thức khám.
    if (appointmentType) {
        currentAppointmentType =
            appointmentType.value || "GENERAL";
        appointmentType.addEventListener(
            "change",
            applyAppointmentTypeFilter
        );
    }
    // Chọn bác sĩ.
    if (doctorSelect) {
        doctorSelect.addEventListener(
            "change",
            async function () {
                const doctorId = this.value;
                resetSlots();
                if (!doctorId) {
                    selectedDoctor = null;
                    updateSelectedDoctorInfo(null);
                    if (appointmentDate) {
                        appointmentDate.disabled = true;
                    }
                    return;
                }
                const doctor = getDoctorById(doctorId);
                if (!doctor) {
                    alert("Không tìm thấy thông tin bác sĩ.");
                    this.value = "";
                    return;
                }
                // Kiểm tra bác sĩ có đúng hình thức khám không.
                if (
                    currentAppointmentType === "GENERAL" &&
                    !isGeneralCheckupDoctor(doctor)
                ) {
                    alert(
                        "Hình thức khám tổng quát chỉ được chọn bác sĩ thuộc chuyên khoa Khám tổng quát."
                    );
                    this.value = "";
                    return;
                }
                if (
                    currentAppointmentType === "SPECIALTY" &&
                    isGeneralCheckupDoctor(doctor)
                ) {
                    alert(
                        "Bác sĩ khám tổng quát không thuộc danh sách bác sĩ chuyên khoa."
                    );
                    this.value = "";
                    return;
                }
                selectedDoctor = doctor;
                const bookingDoctorId =
                    document.getElementById("bookingDoctorId");
                if (bookingDoctorId) {
                    bookingDoctorId.value = String(doctorId);
                }
                updateSelectedDoctorInfo(doctor);
                if (appointmentDate) {
                    appointmentDate.disabled = false;
                }
            }
        );
    }
    // Chọn ngày.
    if (appointmentDate) {
        const now = new Date();
        const today = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, "0"),
            String(now.getDate()).padStart(2, "0")
        ].join("-");
        appointmentDate.min = today;
        appointmentDate.addEventListener(
            "change",
            async function () {
                const currentDoctorSelect =
                    document.getElementById("doctorSelect");
                const doctorId =
                    currentDoctorSelect?.value;
                const date = this.value;
                resetSelectedTime();
                if (!doctorId || !date) {
                    return;
                }
                await loadAvailableSlotsUI(
                    doctorId,
                    date
                );
            }
        );
    }
    // Gửi form.
    if (appointmentForm) {
        appointmentForm.addEventListener(
            "submit",
            submitAppointment
        );
    }
}
// =====================================================
// 16. CẬP NHẬT THÔNG TIN BÁC SĨ
// =====================================================

function updateSelectedDoctorInfo(doctor) {
    const name =
        document.getElementById("selectedDoctorName");
    const specialty =
        document.getElementById("selectedDoctorSpecialty");
    const experience =
        document.getElementById("selectedDoctorExperience");
    const qualification =
        document.getElementById("selectedDoctorQualification");
    const license =
        document.getElementById("selectedDoctorLicense");
    const introduction =
        document.getElementById("selectedDoctorIntroduction");
    const avatar =
        document.getElementById("selectedDoctorAvatar");
    if (!doctor) {
        if (name) {
            name.textContent = "Chưa chọn bác sĩ";
        }
        if (specialty) {
            specialty.textContent =
                "Vui lòng chọn bác sĩ để xem thông tin.";
        }
        if (experience) {
            experience.textContent = "--";
        }
        if (qualification) {
            qualification.textContent = "--";
        }
        if (license) {
            license.textContent = "--";
        }
        if (introduction) {
            introduction.textContent =
                "Thông tin bác sĩ sẽ được hiển thị tại đây.";
        }
        if (avatar) {
            avatar.innerHTML = `
                <i class="fa-solid fa-user-doctor"></i>
            `;
        }
        return;
    }
    if (name) {
        name.textContent =
            `BS. ${doctor.full_name || "Bác sĩ"}`;
    }
    if (specialty) {
        specialty.textContent =
            doctor.specialty_name ||
            "Chưa cập nhật chuyên khoa";
    }
    if (experience) {
        experience.textContent =
            doctor.experience_years == null
                ? "Chưa cập nhật"
                : `${doctor.experience_years} năm`;
    }
    if (qualification) {
        qualification.textContent =
            doctor.qualification || "Chưa cập nhật";
    }
    if (license) {
        license.textContent =
            doctor.license_number || "Chưa cập nhật";
    }
    if (introduction) {
        introduction.textContent =
            doctor.introduction ||
            "Bác sĩ đang cập nhật thông tin giới thiệu.";
    }
    if (avatar) {
        avatar.innerHTML = doctor.avatar
            ? `
                <img
                    src="${escapeHtml(doctor.avatar)}"
                    alt="BS. ${escapeHtml(
                        doctor.full_name || "Bác sĩ"
                    )}"
                >
            `
            : `
                <i class="fa-solid fa-user-doctor"></i>
            `;
    }
}
// =====================================================
// 17. TÌM BÁC SĨ
// =====================================================

function getDoctorById(id) {
    return (
        allDoctors.find(function (doctor) {
            return Number(doctor.id) === Number(id);
        }) || null
    );
}
// =====================================================
// 18. LOAD GIỜ KHÁM
// =====================================================

async function loadAvailableSlotsUI(doctorId, date) {
    const slotList =
        document.getElementById("slotList");
    if (!slotList) {
        return;
    }
    slotList.innerHTML = `
        <div class="slot-empty">
            <i class="fa-solid fa-spinner fa-spin"></i>
            Đang tải giờ khám...
        </div>
    `;
    try {
        const result =
            await getAvailableSlots(doctorId, date);
        const slots =
            Array.isArray(result?.data)
                ? result.data
                : [];
        if (!slots.length) {
            slotList.innerHTML = `
                <div class="slot-empty">
                    Bác sĩ không có lịch khám trong ngày này.
                </div>
            `;
            resetSelectedTime();
            return;
        }
        slotList.innerHTML = slots
            .map(function (slot) {
                const disabled = !slot.available;
                return `
                    <button
                        type="button"
                        class="appointment-slot ${
                            disabled ? "is-booked" : ""
                        }"
                        data-schedule-id="${slot.schedule_id}"
                        data-time="${slot.time}"
                        ${disabled ? "disabled" : ""}
                    >
                        <span class="slot-time">
                            ${formatTime(slot.time)}
                        </span>
                        ${
                            disabled
                                ? '<span class="slot-state">Đã đặt</span>'
                                : ""
                        }
                    </button>
                `;
            })
            .join("");
        slotList
            .querySelectorAll(".appointment-slot:not(:disabled)")
            .forEach(function (button) {
                button.addEventListener(
                    "click",
                    function () {
                        slotList
                            .querySelectorAll(".appointment-slot")
                            .forEach(function (item) {
                                item.classList.remove("selected");
                            });
                        this.classList.add("selected");
                        const scheduleId =
                            document.getElementById("selectedScheduleId");
                        const appointmentTime =
                            document.getElementById("selectedAppointmentTime");
                        if (scheduleId) {
                            scheduleId.value =
                                this.dataset.scheduleId;
                        }
                        if (appointmentTime) {
                            appointmentTime.value =
                                this.dataset.time;
                        }
                    }
                );
            });
    } catch (error) {
        console.error("LOAD AVAILABLE SLOTS ERROR:", error);
        slotList.innerHTML = `
            <div class="slot-empty">
                Không thể tải giờ khám. Vui lòng thử lại.
            </div>
        `;
    }
}
// =====================================================
// 19. RESET GIỜ KHÁM
// =====================================================

function resetSelectedTime() {
    const scheduleId =
        document.getElementById("selectedScheduleId");
    const appointmentTime =
        document.getElementById("selectedAppointmentTime");
    if (scheduleId) {
        scheduleId.value = "";
    }
    if (appointmentTime) {
        appointmentTime.value = "";
    }
    document
        .querySelectorAll(".appointment-slot")
        .forEach(function (item) {
            item.classList.remove("selected");
        });
}

function resetSlots() {
    const slotList =
        document.getElementById("slotList");
    if (slotList) {
        slotList.innerHTML = `
            <div class="slot-empty">
                Vui lòng chọn bác sĩ và ngày khám.
            </div>
        `;
    }
    resetSelectedTime();
}
// =====================================================
// 20. SUBMIT ĐẶT LỊCH
// =====================================================

async function submitAppointment(event) {
    event.preventDefault();
    const user = getCurrentUser();
    if (!user) {
        alert("Bạn cần đăng nhập để đặt lịch.");
        window.location.href = "login.html";
        return;
    }
    const appointmentType =
        document.getElementById("appointmentType")?.value ||
        "GENERAL";
    const doctorId =
        document.getElementById("doctorSelect")?.value;
    const scheduleId =
        document.getElementById("selectedScheduleId")?.value;
    const appointmentTime =
        document.getElementById("selectedAppointmentTime")?.value;
    const doctor = getDoctorById(doctorId);
    if (!doctorId || !doctor) {
        alert("Vui lòng chọn bác sĩ.");
        return;
    }
    // Kiểm tra lại hình thức khám trước khi gửi API.
    if (
        appointmentType === "GENERAL" &&
        !isGeneralCheckupDoctor(doctor)
    ) {
        alert(
            "Bạn đang chọn hình thức khám tổng quát nhưng bác sĩ không thuộc chuyên khoa Khám tổng quát."
        );
        return;
    }
    if (
        appointmentType === "SPECIALTY" &&
        isGeneralCheckupDoctor(doctor)
    ) {
        alert(
            "Vui lòng chọn bác sĩ thuộc chuyên khoa phù hợp."
        );
        return;
    }
    if (!scheduleId || !appointmentTime) {
        alert("Vui lòng chọn ngày và giờ khám.");
        return;
    }
    const contactName =
        document.getElementById("bookingContactName")?.value.trim();
    const contactEmail =
        document.getElementById("bookingContactEmail")?.value.trim();
    const contactPhone =
        document.getElementById("bookingContactPhone")?.value.trim();
    const contactAddress =
        document.getElementById("bookingContactAddress")?.value.trim();
    const reason =
        document.getElementById("appointmentReason")?.value.trim();
    const smsOptIn =
        document.getElementById("bookingSmsConsent")?.checked || false;
    if (
        !contactName ||
        !contactEmail ||
        !contactPhone ||
        !contactAddress
    ) {
        alert("Vui lòng nhập đầy đủ thông tin liên hệ.");
        return;
    }
    const payload = {
        appointment_type: appointmentType,
        doctor_id: Number(doctorId),
        schedule_id: Number(scheduleId),
        appointment_time: appointmentTime,
        reason: reason || null,
        contact_name: contactName,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        contact_address: contactAddress,
        sms_opt_in: smsOptIn
    };
    const submitButton =
        document.querySelector(
            "#appointmentForm button[type='submit']"
        );
    const originalButtonText =
        submitButton?.innerHTML;
    try {
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.innerHTML = `
                <i class="fa-solid fa-spinner fa-spin"></i>
                Đang gửi yêu cầu...
            `;
        }
        const result = await apiFetch(
            "/api/appointments",
            {
                method: "POST",
                body: payload
            }
        );
        if (!result || !result.success) {
            throw new Error(
                result?.message || "Không thể đặt lịch khám."
            );
        }
        alert(
            result.message ||
            "Đặt lịch khám thành công."
        );
        const appointmentForm =
            document.getElementById("appointmentForm");
        if (appointmentForm) {
            appointmentForm.reset();
        }
        selectedDoctor = null;
        currentAppointmentType = "GENERAL";
        const typeSelect =
            document.getElementById("appointmentType");
        if (typeSelect) {
            typeSelect.value = "GENERAL";
        }
        populateDoctorSelect();
        updateSelectedDoctorInfo(null);
        resetSlots();
        const appointmentDate =
            document.getElementById("appointmentDate");
        if (appointmentDate) {
            appointmentDate.value = "";
            appointmentDate.disabled = true;
        }
        closeBookingPanel();
    } catch (error) {
        console.error("SUBMIT APPOINTMENT ERROR:", error);
        alert(
            error.message ||
            "Đã xảy ra lỗi khi đặt lịch."
        );
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML =
                originalButtonText ||
                "Xác nhận đặt lịch";
        }
    }
}
// =====================================================
// 21. TÌM KIẾM BÁC SĨ
// =====================================================

function setupSearch() {
    const searchInput =
        document.getElementById("doctorSearch");
    const specialtySelect =
        document.getElementById("specialtySelect");
    if (searchInput) {
        searchInput.addEventListener(
            "input",
            applyHomeSearch
        );
    }
    if (specialtySelect) {
        specialtySelect.addEventListener(
            "change",
            applyHomeSearch
        );
    }
}

function applyHomeSearch() {
    const searchInput =
        document.getElementById("doctorSearch");
    const specialtySelect =
        document.getElementById("specialtySelect");
    const keyword =
        searchInput?.value.trim().toLowerCase() || "";
    const specialty =
        specialtySelect?.value || "";
    let filteredDoctors = [...allDoctors];
    if (keyword) {
        filteredDoctors = filteredDoctors.filter(
            function (doctor) {
                const name =
                    String(doctor.full_name || "").toLowerCase();
                const specialtyName =
                    String(doctor.specialty_name || "").toLowerCase();
                return (
                    name.includes(keyword) ||
                    specialtyName.includes(keyword)
                );
            }
        );
    }
    if (specialty) {
        filteredDoctors = filteredDoctors.filter(
            function (doctor) {
                return (
                    createSpecialtySlug(doctor.specialty_name) ===
                    specialty
                );
            }
        );
    }
    renderDoctors(filteredDoctors, {
        searchActive: Boolean(keyword || specialty),
        showAll: Boolean(keyword || specialty)
    });
}
// =====================================================
// 22. CÁC HÀM HỖ TRỢ
// =====================================================
async function getDoctorsFromAPI() {
    const response = await fetch("/api/doctors", {
        method: "GET",
        headers: {
            "Content-Type": "application/json"
        },
        credentials: "include"
    });

    if (!response.ok) {
        throw new Error("Không thể lấy danh sách bác sĩ");
    }

    return await response.json();
}
function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}