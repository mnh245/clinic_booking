/*
=====================================================
CLINIC BOOKING - HOME PAGE
=====================================================

Nhiệm vụ của file:

1. Kiểm tra trạng thái đăng nhập
2. Hiển thị user trên header
3. Đăng xuất
4. Tải danh sách bác sĩ
5. Tải và hiển thị chuyên khoa
6. Hiển thị bác sĩ nổi bật
7. Mở form đặt lịch
8. Chọn bác sĩ
9. Chọn ngày
10. Tải giờ khám
11. Chọn giờ khám
12. Tạo lịch hẹn
13. Tìm kiếm
=====================================================
*/
/*
=====================================================
BIẾN TOÀN CỤC
=====================================================
*/

let allDoctors = [];

let selectedDoctor = null;
/*
=====================================================
KHỞI TẠO TRANG
=====================================================
*/

document.addEventListener(
    "DOMContentLoaded",
    async function () {
        /*
        ==============================================
        ĐĂNG KÝ SỰ KIỆN
        ==============================================
        */
        setupLoginState();
        setupSearch();
        setupBookingForm();
        setupBookingPanel();
        await loadDoctors();
    }
);
/*
=====================================================
1. TRẠNG THÁI ĐĂNG NHẬP
=====================================================
*/

function setupLoginState() {
    const loginLink =
        document.getElementById(
            "loginLink"
        );
    const registerLink =
        document.getElementById(
            "registerLink"
        );
    const userInfo =
        document.getElementById(
            "userInfo"
        );
    const welcomeUser =
        document.getElementById(
            "welcomeUser"
        );
    const logoutButton =
        document.getElementById(
            "logoutButton"
        );
    /*
    ==============================================
    LẤY USER TỪ LOCAL STORAGE
    ==============================================
    */
    const user =
        getCurrentUser();
    /*
    ==============================================
    CHƯA ĐĂNG NHẬP
    ==============================================
    */
    if (!user) {
        if (loginLink) {
            loginLink.style.display =
                "inline-flex";
        }
        if (registerLink) {
            registerLink.style.display =
                "inline-flex";
        }
        if (userInfo) {
            userInfo.style.display =
                "none";
        }
    }
    /*
    ==============================================
    ĐÃ ĐĂNG NHẬP
    ==============================================
    */
    else {
        if (loginLink) {
            loginLink.style.display =
                "none";
        }
        if (registerLink) {
            registerLink.style.display =
                "none";
        }
        if (userInfo) {
            userInfo.style.display =
                "flex";
        }
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
    /*
    ==============================================
    ĐĂNG XUẤT
    ==============================================
    */
    if (logoutButton) {
        logoutButton.addEventListener(
            "click",
            handleLogout
        );
    }
}
/*
=====================================================
2. LẤY USER HIỆN TẠI
=====================================================
*/

function getCurrentUser() {
    const value =
        localStorage.getItem(
            "user"
        );
    if (!value) {
        return null;
    }
    try {
        return JSON.parse(
            value
        );
    } catch (error) {
        console.error(
            "Không thể đọc user:",
            error
        );
        localStorage.removeItem(
            "user"
        );
        return null;
    }
}
/*
=====================================================
3. ĐĂNG XUẤT
=====================================================
*/

async function handleLogout() {
    const confirmed =
        window.confirm(
            "Bạn có chắc chắn muốn đăng xuất?"
        );
    if (!confirmed) {
        return;
    }
    try {
        /*
        ==========================================
        Hủy session phía server
        ==========================================
        */
        await fetch(
            "/api/logout",
            {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type":
                        "application/json"
                }
            }
        );
    } catch (error) {
        console.warn(
            "Không thể gọi API logout:",
            error
        );
    }
    /*
    ==========================================
    Xóa dữ liệu frontend
    ==========================================
    */
    localStorage.removeItem(
        "user"
    );
    localStorage.removeItem(
        "role"
    );
    localStorage.removeItem(
        "vaiTro"
    );
    sessionStorage.clear();
    window.location.href =
        "login.html";
}
/*
=====================================================
4. LẤY BÁC SĨ TỪ DATABASE
=====================================================
*/

async function loadDoctors() {
    const doctorGrid =
        document.getElementById(
            "doctorList"
        );
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
        const result =
            await getDoctors();
        /*
        ==========================================
        KIỂM TRA RESPONSE
        ==========================================
        */
        if (
            !result ||
            !result.success ||
            !Array.isArray(
                result.data
            )
        ) {
            throw new Error(
                "Dữ liệu bác sĩ không hợp lệ."
            );
        }
        allDoctors =
            result.data;
        /*
        ==========================================
        HIỂN THỊ
        ==========================================
        */
        renderSpecialties(
            allDoctors
        );
        renderDoctors(
            allDoctors
        );
        renderFeaturedDoctors(
            allDoctors
        );
        populateDoctorSelect();
    } catch (error) {
        console.error(
            "LOAD DOCTORS ERROR:",
            error
        );
        doctorGrid.innerHTML = `
            <div class="card specialty-card">
                <div class="specialty-icon">
                    <i
                        class="fa-solid fa-triangle-exclamation"
                    ></i>
                </div>
                <h3>
                    Không thể tải dữ liệu
                </h3>
                <p>
                    Không thể kết nối đến
                    hệ thống bác sĩ.
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
            doctorGrid.querySelector(
                ".retry-doctors"
            );
        if (retryButton) {
            retryButton.addEventListener(
                "click",
                loadDoctors
            );
        }
    }
}
/*
=====================================================
5. TẠO SLUG CHUYÊN KHOA
=====================================================
*/

function createSpecialtySlug(
    name
) {
    return String(name || "")
        .normalize("NFD")
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .toLowerCase()
        .replace(
            /đ/g,
            "d"
        )
        .replace(
            /[^a-z0-9]+/g,
            "-"
        )
        .replace(
            /^-+|-+$/g,
            "");
}
/*
=====================================================
6. ICON CHUYÊN KHOA
=====================================================
*/

function getSpecialtyIcon(
    name
) {
    const value =
        String(name || "")
            .toLowerCase();
    if (
        value.includes("tim")
    ) {
        return "fa-heart-pulse";
    }
    if (
        value.includes("nhi")
    ) {
        return "fa-child";
    }
    if (
        value.includes("thần kinh")
    ) {
        return "fa-brain";
    }
    if (
        value.includes("da liễu")
    ) {
        return "fa-hand-dots";
    }
    if (
        value.includes("tai") ||
        value.includes("mũi") ||
        value.includes("họng")
    ) {
        return "fa-ear-listen";
    }
    if (
        value.includes("ngoại")
    ) {
        return "fa-scissors";
    }
    if (
        value.includes("nội")
    ) {
        return "fa-stethoscope";
    }
    if (
        value.includes("răng")
    ) {
        return "fa-tooth";
    }
    return "fa-stethoscope";
}
/*
=====================================================
7. FORMAT KINH NGHIỆM
=====================================================
*/

function formatExperience(
    years
) {
    if (
        years === null ||
        years === undefined
    ) {
        return "Chưa cập nhật kinh nghiệm";
    }
    const value =
        Number(years);
    if (value === 0) {
        return "Dưới 1 năm kinh nghiệm";
    }
    return (
        value +
        " năm kinh nghiệm"
    );
}
/*
=====================================================
8. HIỂN THỊ CHUYÊN KHOA
=====================================================
*/

function renderSpecialties(
    doctors
) {
    const specialtyGrid =
        document.getElementById(
            "specialtyGrid"
        );
    if (!specialtyGrid) {
        return;
    }
    const specialtyMap =
        new Map();
    doctors.forEach(
        function (doctor) {
            if (
                !doctor.specialty_id ||
                !doctor.specialty_name
            ) {
                return;
            }
            if (
                !specialtyMap.has(
                    doctor.specialty_id
                )
            ) {
                specialtyMap.set(
                    doctor.specialty_id,
                    {
                        id:
                            doctor.specialty_id,
                        name:
                            doctor.specialty_name,
                        count: 0
                    }
                );
            }
            specialtyMap
                .get(
                    doctor.specialty_id
                )
                .count++;
        }
    );
    const specialties =
        Array.from(
            specialtyMap.values()
        );
    if (!specialties.length) {
        specialtyGrid.innerHTML = `
            <div class="card specialty-card">
                <div class="specialty-icon">
                    <i
                        class="fa-solid fa-circle-exclamation"
                    ></i>
                </div>
                <h3>
                    Chưa có chuyên khoa
                </h3>
                <p>
                    Hiện chưa có dữ liệu
                    chuyên khoa.
                </p>
            </div>
        `;
        return;
    }
    /*
    ==========================================
    RENDER 4 CHUYÊN KHOA ĐẦU
    ==========================================
    */
    specialtyGrid.innerHTML =
        specialties
            .slice(0, 4)
            .map(
                function (specialty) {
                    const slug =
                        createSpecialtySlug(
                            specialty.name
                        );
                    const icon =
                        getSpecialtyIcon(
                            specialty.name
                        );
                    return `
                        <a
                            href="doctors.html?specialty=${encodeURIComponent(slug)}"
                            class="card specialty-card"
                        >
                            <div class="specialty-icon">
                                <i
                                    class="fa-solid ${icon}"
                                ></i>
                            </div>
                            <h3>
                                ${escapeHtml(
                                    specialty.name
                                )}
                            </h3>
                            <p>
                                ${specialty.count}
                                bác sĩ đang hoạt động
                                trong chuyên khoa này.
                            </p>
                            <span class="specialty-more">
                                Xem bác sĩ
                                <i
                                    class="fa-solid fa-arrow-right"
                                ></i>
                            </span>
                        </a>
                    `;
                }
            )
            .join("");
    /*
    ==========================================
    CẬP NHẬT SELECT CHUYÊN KHOA
    ==========================================
    */
    const specialtySelect =
        document.getElementById(
            "specialtySelect"
        );
    if (specialtySelect) {
        specialtySelect.innerHTML = `
            <option value="">
                Tất cả chuyên khoa
            </option>
        `;
        specialties.forEach(
            function (specialty) {
                const option =
                    document.createElement(
                        "option"
                    );
                option.value =
                    createSpecialtySlug(
                        specialty.name
                    );
                option.textContent =
                    specialty.name;
                specialtySelect.appendChild(
                    option
                );
            }
        );
    }
}
/*
=====================================================
9. HIỂN THỊ BÁC SĨ
=====================================================
*/

function renderDoctors(
    doctors
) {
    const doctorGrid =
        document.getElementById(
            "doctorList"
        );
    if (!doctorGrid) {
        return;
    }
    if (!doctors.length) {
        doctorGrid.innerHTML = `
            <div class="card specialty-card">
                <div class="specialty-icon">
                    <i
                        class="fa-solid fa-user-doctor"
                    ></i>
                </div>
                <h3>
                    Chưa có bác sĩ
                </h3>
                <p>
                    Hiện chưa có dữ liệu
                    bác sĩ.
                </p>
            </div>
        `;
        return;
    }
    doctorGrid.innerHTML =
        doctors
            .slice(0, 6)
            .map(
                function (doctor) {
                    const experience =
                        formatExperience(
                            doctor.experience_years
                        );
                    const introduction =
                        doctor.introduction ||
                        "Bác sĩ đang cập nhật thông tin giới thiệu.";
                    return `
                        <article
                            class="card doctor-card"
                        >
                            <div class="doctor-cover"></div>
                            <div class="doctor-body">
                                <div class="doctor-avatar">
                                    ${
                                        doctor.avatar
                                            ? `
                                                <img
                                                    src="${escapeHtml(
                                                        doctor.avatar
                                                    )}"
                                                    alt="BS. ${escapeHtml(
                                                        doctor.full_name
                                                    )}"
                                                    style="
                                                        width:100%;
                                                        height:100%;
                                                        object-fit:cover;
                                                        border-radius:inherit;
                                                    "
                                                >
                                              `
                                            : `
                                                <i
                                                    class="fa-solid fa-user-doctor"
                                                ></i>
                                              `
                                    }
                                </div>
                                <h3>
                                    BS.
                                    ${escapeHtml(
                                        doctor.full_name ||
                                        "Bác sĩ"
                                    )}
                                </h3>
                                <div class="doctor-specialty">
                                    ${escapeHtml(
                                        doctor.specialty_name ||
                                        "Chưa cập nhật chuyên khoa"
                                    )}
                                </div>
                                <div class="doctor-info">
                                    ${escapeHtml(
                                        introduction
                                    )}
                                </div>
                                <span class="chip">
                                    <i
                                        class="fa-regular fa-clock"
                                    ></i>
                                    ${experience}
                                </span>
                                <div class="doctor-card-footer">
                                    <span class="rating">
                                        <i
                                            class="fa-solid fa-star"
                                        ></i>
                                        <span>
                                            ${
                                                doctor.rating
                                                    ? Number(
                                                        doctor.rating
                                                    ).toFixed(1)
                                                    : "Chưa có đánh giá"
                                            }
                                        </span>
                                    </span>
                                    <button
                                        type="button"
                                        class="btn btn-primary doctor-book-button"
                                        data-doctor-id="${doctor.id}"
                                    >
                                        <i
                                            class="fa-solid fa-calendar-check"
                                        ></i>
                                        Đặt lịch
                                    </button>
                                </div>
                            </div>
                        </article>
                    `;
                }
            )
            .join("");
    /*
    ==========================================
    GẮN SỰ KIỆN NÚT ĐẶT LỊCH
    ==========================================
    */
    doctorGrid
        .querySelectorAll(
            ".doctor-book-button"
        )
        .forEach(
            function (button) {
                button.addEventListener(
                    "click",
                    function () {
                        const doctorId =
                            Number(
                                this.dataset.doctorId
                            );
                        openBookingPanel(
                            doctorId
                        );
                    }
                );
            }
        );
}
/*
=====================================================
10. BÁC SĨ NỔI BẬT
=====================================================
*/

function renderFeaturedDoctors(
    doctors
) {
    const featuredDoctors =
        document.getElementById(
            "featuredDoctors"
        );
    if (!featuredDoctors) {
        return;
    }
    if (!doctors.length) {
        featuredDoctors.innerHTML = `
            <div class="doctor-mini">
                <div class="doctor-avatar">
                    <i
                        class="fa-solid fa-user-doctor"
                    ></i>
                </div>
                <div class="doctor-info">
                    <strong>
                        Chưa có bác sĩ
                    </strong>
                    <span>
                        Chưa có dữ liệu bác sĩ
                    </span>
                </div>
            </div>
        `;
        return;
    }
    featuredDoctors.innerHTML =
        doctors
            .slice(0, 3)
            .map(
                function (doctor) {
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
                                                src="${escapeHtml(
                                                    doctor.avatar
                                                )}"
                                                alt="BS. ${escapeHtml(
                                                    doctor.full_name
                                                )}"
                                                style="
                                                    width:100%;
                                                    height:100%;
                                                    object-fit:cover;
                                                    border-radius:inherit;
                                                "
                                            >
                                          `
                                        : `
                                            <i
                                                class="fa-solid fa-user-doctor"
                                            ></i>
                                          `
                                }
                            </div>
                            <div class="doctor-info">
                                <strong>
                                    BS.
                                    ${escapeHtml(
                                        doctor.full_name ||
                                        "Bác sĩ"
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
                            <i
                                class="fa-solid fa-chevron-right"
                            ></i>
                        </button>
                    `;
                }
            )
            .join("");
    /*
    ==========================================
    GẮN SỰ KIỆN
    ==========================================
    */
    featuredDoctors
        .querySelectorAll(
            ".doctor-featured-button"
        )
        .forEach(
            function (button) {
                button.addEventListener(
                    "click",
                    function () {
                        const doctorId =
                            Number(
                                this.dataset.doctorId
                            );
                        openBookingPanel(
                            doctorId
                        );
                    }
                );
            }
        );
}
/*
=====================================================
11. ĐỔ BÁC SĨ VÀO SELECT
=====================================================
*/

function populateDoctorSelect() {
    const doctorSelect =
        document.getElementById(
            "doctorSelect"
        );
    if (!doctorSelect) {
        return;
    }
    doctorSelect.innerHTML = `
        <option value="">
            -- Chọn bác sĩ --
        </option>
    `;
    allDoctors.forEach(
        function (doctor) {
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
            doctorSelect.appendChild(
                option
            );
        }
    );
}
/*
=====================================================
12. MỞ FORM ĐẶT LỊCH
=====================================================
*/

function openBookingPanel(
    doctorId = null
) {
    const panel =
        document.getElementById(
            "appointmentPanel"
        );
    if (!panel) {
        return;
    }
    /*
    ==========================================
    KIỂM TRA ĐĂNG NHẬP
    ==========================================
    */
    const user =
        getCurrentUser();
    if (!user) {
        alert(
            "Bạn cần đăng nhập trước khi đặt lịch."
        );
        window.location.href =
            "login.html";
        return;
    }
    /*
    ==========================================
    MỞ PANEL
    ==========================================
    */
    panel.classList.add(
        "is-open"
    );
    /*
    ==========================================
    CHỌN BÁC SĨ
    ==========================================
    */
    if (doctorId) {
        const doctor =
            getDoctorById(
                doctorId
            );
        selectedDoctor =
            doctor;
        const doctorSelect =
            document.getElementById(
                "doctorSelect"
            );
        if (doctorSelect) {
            doctorSelect.value =
                String(
                    doctorId
                );
        }
        const bookingDoctorId =
            document.getElementById(
                "bookingDoctorId"
            );
        if (bookingDoctorId) {
            bookingDoctorId.value =
                String(
                    doctorId
                );
        }
        updateSelectedDoctorInfo(
            doctor
        );
        resetSlots();
        const appointmentDate =
            document.getElementById(
                "appointmentDate"
            );
        if (appointmentDate) {
            appointmentDate.disabled =
                false;
        }
    }
    /*
    ==========================================
    SCROLL
    ==========================================
    */
    setTimeout(
        function () {
            panel.scrollIntoView(
                {
                    behavior:
                        "smooth",
                    block:
                        "start"
                }
            );
        },
        50
    );
}
/*
=====================================================
13. ĐÓNG FORM
=====================================================
*/

function closeBookingPanel() {
    const panel =
        document.getElementById(
            "appointmentPanel"
        );
    if (panel) {
        panel.classList.remove(
            "is-open"
        );
    }
}
/*
=====================================================
14. CẤU HÌNH FORM ĐẶT LỊCH
=====================================================
*/

function setupBookingPanel() {
    const heroBookingButton =
        document.getElementById(
            "heroBookingButton"
        );
    const closeAppointment =
        document.getElementById(
            "closeAppointment"
        );
    const cancelBooking =
        document.getElementById(
            "cancelBooking"
        );
    /*
    ==========================================
    ĐẶT LỊCH NGAY
    ==========================================
    */
    if (heroBookingButton) {
        heroBookingButton.addEventListener(
            "click",
            function () {
                openBookingPanel();
            }
        );
    }
    /*
    ==========================================
    ĐÓNG BẰNG X
    ==========================================
    */
    if (closeAppointment) {
        closeAppointment.addEventListener(
            "click",
            closeBookingPanel
        );
    }
    /*
    ==========================================
    ĐÓNG BẰNG HỦY
    ==========================================
    */
    if (cancelBooking) {
        cancelBooking.addEventListener(
            "click",
            closeBookingPanel
        );
    }
}
/*
=====================================================
15. FORM ĐẶT LỊCH
=====================================================
*/

function setupBookingForm() {
    const doctorSelect =
        document.getElementById(
            "doctorSelect"
        );
    const appointmentDate =
        document.getElementById(
            "appointmentDate"
        );
    const appointmentForm =
        document.getElementById(
            "appointmentForm"
        );
    /*
    ==========================================
    CHỌN BÁC SĨ
    ==========================================
    */
    if (doctorSelect) {
        doctorSelect.addEventListener(
            "change",
            async function () {
                const doctorId =
                    this.value;
                resetSlots();
                if (!doctorId) {
                    selectedDoctor =
                        null;
                    updateSelectedDoctorInfo(
                        null
                    );
                    if (appointmentDate) {
                        appointmentDate.disabled =
                            true;
                    }
                    return;
                }
                const doctor =
                    getDoctorById(
                        doctorId
                    );
                selectedDoctor =
                    doctor;
                const bookingDoctorId =
                    document.getElementById(
                        "bookingDoctorId"
                    );
                if (bookingDoctorId) {
                    bookingDoctorId.value =
                        String(
                            doctorId
                        );
                }
                updateSelectedDoctorInfo(
                    doctor
                );
                if (appointmentDate) {
                    appointmentDate.disabled =
                        false;
                }
                /*
                Không tự gọi API khi chỉ chọn bác sĩ.
                Chỉ gọi khi người dùng chọn ngày.
                */
            }
        );
    }
    /*
    ==========================================
    CHỌN NGÀY
    ==========================================
    */
    if (appointmentDate) {
        const today =
            new Date()
                .toISOString()
                .split("T")[0];
        appointmentDate.min =
            today;
        appointmentDate.addEventListener(
            "change",
            async function () {
                const doctorSelect =
                    document.getElementById(
                        "doctorSelect"
                    );
                const doctorId =
                    doctorSelect?.value;
                const date =
                    this.value;
                resetSelectedTime();
                if (
                    !doctorId ||
                    !date
                ) {
                    return;
                }
                await loadAvailableSlotsUI(
                    doctorId,
                    date
                );
            }
        );
    }
    /*
    ==========================================
    SUBMIT
    ==========================================
    */
    if (appointmentForm) {
        appointmentForm.addEventListener(
            "submit",
            submitAppointment
        );
    }
}
/*
=====================================================
16. CẬP NHẬT THÔNG TIN BÁC SĨ
=====================================================
*/

function updateSelectedDoctorInfo(
    doctor
) {
    const name =
        document.getElementById(
            "selectedDoctorName"
        );
    const specialty =
        document.getElementById(
            "selectedDoctorSpecialty"
        );
    const experience =
        document.getElementById(
            "selectedDoctorExperience"
        );
    const qualification =
        document.getElementById(
            "selectedDoctorQualification"
        );
    const license =
        document.getElementById(
            "selectedDoctorLicense"
        );
    const introduction =
        document.getElementById(
            "selectedDoctorIntroduction"
        );
    const avatar =
        document.getElementById(
            "selectedDoctorAvatar"
        );
    if (!doctor) {
        if (name) {
            name.textContent =
                "Chưa chọn bác sĩ";
        }
        if (specialty) {
            specialty.textContent =
                "Vui lòng chọn bác sĩ để xem thông tin.";
        }
        if (experience) {
            experience.textContent =
                "--";
        }
        if (qualification) {
            qualification.textContent =
                "--";
        }
        if (license) {
            license.textContent =
                "--";
        }
        if (introduction) {
            introduction.textContent =
                "Thông tin bác sĩ sẽ được hiển thị tại đây.";
        }
        if (avatar) {
            avatar.innerHTML =
                `
                    <i
                        class="fa-solid fa-user-doctor"
                    ></i>
                `;
        }
        return;
    }
    if (name) {
        name.textContent =
            `BS. ${
                doctor.full_name ||
                "Bác sĩ"
            }`;
    }
    if (specialty) {
        specialty.textContent =
            doctor.specialty_name ||
            "Chưa cập nhật chuyên khoa";
    }
    if (experience) {
        experience.textContent =
            doctor.experience_years ==
            null
                ? "Chưa cập nhật"
                : `${doctor.experience_years} năm`;
    }
    if (qualification) {
        qualification.textContent =
            doctor.qualification ||
            "Chưa cập nhật";
    }
    if (license) {
        license.textContent =
            doctor.license_number ||
            "Chưa cập nhật";
    }
    if (introduction) {
        introduction.textContent =
            doctor.introduction ||
            "Bác sĩ đang cập nhật thông tin giới thiệu.";
    }
    if (avatar) {
        avatar.innerHTML =
            doctor.avatar
                ? `
                    <img
                        src="${escapeHtml(
                            doctor.avatar
                        )}"
                        alt="BS. ${
                            escapeHtml(
                                doctor.full_name ||
                                "Bác sĩ"
                            )
                        }"
                    >
                  `
                : `
                    <i
                        class="fa-solid fa-user-doctor"
                    ></i>
                  `;
    }
}
/*
=====================================================
17. TÌM BÁC SĨ
=====================================================
*/

function getDoctorById(
    id
) {
    return (
        allDoctors.find(
            function (doctor) {
                return (
                    Number(
                        doctor.id
                    ) ===
                    Number(id)
                );
            }
        ) ||
        null
    );
}
/*
=====================================================
18. LOAD GIỜ KHÁM
=====================================================
*/

async function loadAvailableSlotsUI(
    doctorId,
    date
) {
    const slotList =
        document.getElementById(
            "slotList"
        );
    if (!slotList) {
        return;
    }
    slotList.innerHTML = `
        <div class="slot-empty">
            <i
                class="fa-solid fa-spinner fa-spin"
            ></i>
            Đang tải giờ khám...
        </div>
    `;
    try {
        const result =
            await getAvailableSlots(
                doctorId,
                date
            );
        const slots =
            Array.isArray(
                result?.data
            )
                ? result.data
                : [];
        /*
        ==========================================
        KHÔNG CÓ LỊCH
        ==========================================
        */
        if (!slots.length) {
            slotList.innerHTML = `
                <div class="slot-empty">
                    Bác sĩ không có lịch khám
                    trong ngày này.
                </div>
            `;
            resetSelectedTime();
            return;
        }
        /*
        ==========================================
        RENDER SLOT
        ==========================================
        */
        slotList.innerHTML =
            slots
                .map(
                    function (slot) {
                        const disabled =
                            !slot.available;
                        return `
                            <button
                                type="button"
                                class="appointment-slot ${
                                    disabled
                                        ? "is-booked"
                                        : ""
                                }"
                                data-schedule-id="${
                                    slot.schedule_id
                                }"
                                data-time="${
                                    slot.time
                                }"
                                ${
                                    disabled
                                        ? "disabled"
                                        : ""
                                }
                            >
                                ${formatTime(
                                    slot.time
                                )}
                            </button>
                        `;
                    }
                )
                .join("");
        /*
        ==========================================
        BẮT EVENT CHỌN SLOT
        ==========================================
        */
        slotList
            .querySelectorAll(
                ".appointment-slot:not(:disabled)"
            )
            .forEach(
                function (button) {
                    button.addEventListener(
                        "click",
                        function () {
                            slotList
                                .querySelectorAll(
                                    ".appointment-slot"
                                )
                                .forEach(
                                    function (item) {
                                        item.classList.remove(
                                            "is-selected"
                                        );
                                    }
                                );
                            this.classList.add(
                                "is-selected"
                            );
                            const scheduleInput =
                                document.getElementById(
                                    "selectedScheduleId"
                                );
                            const timeInput =
                                document.getElementById(
                                    "selectedAppointmentTime"
                                );
                            if (scheduleInput) {
                                scheduleInput.value =
                                    this.dataset.scheduleId ||
                                    "";
                            }
                            if (timeInput) {
                                timeInput.value =
                                    this.dataset.time ||
                                    "";
                            }
                        }
                    );
                }
            );
    } catch (error) {
        console.error(
            "LOAD SLOTS ERROR:",
            error
        );
        slotList.innerHTML = `
            <div class="slot-empty">
                Không thể tải giờ khám.
                Vui lòng thử lại.
            </div>
        `;
        resetSelectedTime();
    }
}
/*
=====================================================
19. SUBMIT ĐẶT LỊCH
=====================================================
*/

async function submitAppointment(
    event
) {
    event.preventDefault();
    /*
    ==========================================
    KIỂM TRA USER
    ==========================================
    */
    const user =
        getCurrentUser();
    if (!user) {
        alert(
            "Bạn cần đăng nhập trước khi đặt lịch."
        );
        window.location.href =
            "login.html";
        return;
    }
    /*
    ==========================================
    LẤY DỮ LIỆU FORM
    ==========================================
    */
    const doctorId =
        document.getElementById(
            "doctorSelect"
        )?.value;
    const date =
        document.getElementById(
            "appointmentDate"
        )?.value;
    const scheduleId =
        document.getElementById(
            "selectedScheduleId"
        )?.value;
    const appointmentTime =
        document.getElementById(
            "selectedAppointmentTime"
        )?.value;
    const reason =
        document.getElementById(
            "appointmentReason"
        )?.value.trim() ||
        "";
    /*
    ==========================================
    VALIDATION
    ==========================================
    */
    if (!doctorId) {
        alert(
            "Vui lòng chọn bác sĩ."
        );
        return;
    }
    if (!date) {
        alert(
            "Vui lòng chọn ngày khám."
        );
        return;
    }
    if (!scheduleId) {
        alert(
            "Vui lòng chọn giờ khám."
        );
        return;
    }
    if (!appointmentTime) {
        alert(
            "Vui lòng chọn giờ khám."
        );
        return;
    }
    /*
    ==========================================
    BUTTON
    ==========================================
    */
    const form =
        document.getElementById(
            "appointmentForm"
        );
    const submitButton =
        form?.querySelector(
            'button[type="submit"]'
        );
    const oldButtonHTML =
        submitButton?.innerHTML;
    if (submitButton) {
        submitButton.disabled =
            true;
        submitButton.innerHTML = `
            <i
                class="fa-solid fa-spinner fa-spin"
            ></i>
            Đang đặt lịch...
        `;
    }
    try {
        /*
        ==========================================
        PAYLOAD
        ==========================================
        */
        const payload = {
            patient_id:
                Number(user.id),
            doctor_id:
                Number(doctorId),
            schedule_id:
                Number(scheduleId),
            appointment_time:
                appointmentTime,
            reason:
                reason || null
        };
        console.log(
            "Dữ liệu đặt lịch gửi API:",
            payload
        );
        /*
        ==========================================
        GỌI API
        ==========================================
        */
        const result =
            await apiFetch(
                "/api/appointments",
                {
                    method: "POST",
                    body:
                        JSON.stringify(
                            payload
                        )
                }
            );
        /*
        ==========================================
        THÀNH CÔNG
        ==========================================
        */
        alert(
            result.message ||
            "Đặt lịch khám thành công."
        );
        /*
        ==========================================
        RESET
        ==========================================
        */
        resetSlots();
        const reasonInput =
            document.getElementById(
                "appointmentReason"
            );
        if (reasonInput) {
            reasonInput.value =
                "";
        }
        /*
        ==========================================
        TẢI LẠI SLOT
        ==========================================
        */
        await loadAvailableSlotsUI(
            doctorId,
            date
        );
    } catch (error) {
        console.error(
            "CREATE APPOINTMENT ERROR:",
            error
        );
        alert(
            error.message ||
            "Không thể đặt lịch khám."
        );
    } finally {
        if (submitButton) {
            submitButton.disabled =
                false;
            submitButton.innerHTML =
                oldButtonHTML;
        }
    }
}
/*
=====================================================
20. RESET SLOT
=====================================================
*/

function resetSlots() {
    const slotList =
        document.getElementById(
            "slotList"
        );
    const scheduleInput =
        document.getElementById(
            "selectedScheduleId"
        );
    const timeInput =
        document.getElementById(
            "selectedAppointmentTime"
        );
    if (slotList) {
        slotList.innerHTML = `
            <div class="slot-empty">
                Chọn ngày để xem giờ khám.
            </div>
        `;
    }
    if (scheduleInput) {
        scheduleInput.value =
            "";
    }
    if (timeInput) {
        timeInput.value =
            "";
    }
}
/*
=====================================================
21. RESET GIỜ ĐƯỢC CHỌN
=====================================================
*/

function resetSelectedTime() {
    const scheduleInput =
        document.getElementById(
            "selectedScheduleId"
        );
    const timeInput =
        document.getElementById(
            "selectedAppointmentTime"
        );
    if (scheduleInput) {
        scheduleInput.value =
            "";
    }
    if (timeInput) {
        timeInput.value =
            "";
    }
    document
        .querySelectorAll(
            ".appointment-slot"
        )
        .forEach(
            function (item) {
                item.classList.remove(
                    "is-selected"
                );
            }
        );
}
/*
=====================================================
22. TÌM KIẾM
=====================================================
*/

function setupSearch() {
    const searchForm =
        document.getElementById(
            "searchForm"
        );
    if (!searchForm) {
        return;
    }
    searchForm.addEventListener(
        "submit",
        function (event) {
            event.preventDefault();
            const keyword =
                document
                    .getElementById(
                        "searchKeyword"
                    )
                    ?.value.trim() ||
                "";
            const specialty =
                document
                    .getElementById(
                        "specialtySelect"
                    )
                    ?.value ||
                "";
            const params =
                new URLSearchParams();
            if (keyword) {
                params.set(
                    "keyword",
                    keyword
                );
            }
            if (specialty) {
                params.set(
                    "specialty",
                    specialty
                );
            }
            const query =
                params.toString();
            window.location.href =
                "doctors.html" +
                (
                    query
                        ? "?" + query
                        : ""
                );
        }
    );
}
/*
=====================================================
23. FORMAT TIME
=====================================================
*/

function formatTime(
    value
) {
    if (!value) {
        return "";
    }
    return String(value)
        .slice(0, 5);
}
/*
=====================================================
24. ESCAPE HTML
=====================================================
*/

function escapeHtml(
    value
) {
    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }
    return String(value)
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );
}