document.addEventListener("DOMContentLoaded", async function () {

    await loadDoctors();

    setupBookingForm();

    setupLoginState();

});


/* =====================================================
   TRẠNG THÁI ĐĂNG NHẬP
===================================================== */

function setupLoginState() {

    const loginLink =
        document.getElementById("loginLink");

    const registerLink =
        document.getElementById("registerLink");

    const userInfo =
        document.getElementById("userInfo");

    const welcomeUser =
        document.getElementById("welcomeUser");

    const logoutButton =
        document.getElementById("logoutButton");

    const userData =
        localStorage.getItem("user");


    if (userData) {

        try {

            const user =
                JSON.parse(userData);

            loginLink.style.display = "none";

            registerLink.style.display = "none";

            userInfo.style.display = "flex";

            welcomeUser.textContent =
                "Xin chào, " +
                (
                    user.full_name ||
                    user.fullName ||
                    "bạn"
                );

        } catch (error) {

            console.error(
                "Không thể đọc user:",
                error
            );

            localStorage.removeItem("user");
            localStorage.removeItem("role");
        }
    }


    if (logoutButton) {

        logoutButton.addEventListener(
            "click",
            function () {

                localStorage.removeItem("user");
                localStorage.removeItem("role");

                window.location.href =
                    "login.html";
            }
        );
    }
}


/* =====================================================
   LẤY BÁC SĨ TỪ DATABASE
===================================================== */

async function loadDoctors() {

    const container =
        document.getElementById("doctorList");

    if (!container) {
        return;
    }

    container.innerHTML = `
        <div class="loading">
            Đang tải danh sách bác sĩ...
        </div>
    `;


    try {

        const result =
            await getDoctors();

        if (
            !result.success ||
            !Array.isArray(result.data)
        ) {

            throw new Error(
                "Dữ liệu bác sĩ không hợp lệ."
            );
        }


        const doctors =
            result.data;


        container.innerHTML = "";


        if (doctors.length === 0) {

            container.innerHTML = `
                <div class="empty-state">
                    Hiện chưa có bác sĩ.
                </div>
            `;

            return;
        }


        doctors.forEach(
            doctor => {

                const card =
                    document.createElement("article");

                card.className =
                    "card doctor-card";


                card.innerHTML = `

                    <div class="doctor-cover"></div>

                    <div class="doctor-body">

                        <div class="doctor-avatar">

                            <i class="fa-solid fa-user-doctor"></i>

                        </div>

                        <h3>
                            BS. ${escapeHtml(
                                doctor.full_name
                            )}
                        </h3>

                        <div class="doctor-specialty">

                            ${escapeHtml(
                                doctor.specialty_name ||
                                "Chưa cập nhật chuyên khoa"
                            )}

                        </div>

                        <div class="doctor-info">

                            ${
                                doctor.introduction ||
                                "Bác sĩ giàu kinh nghiệm trong khám và điều trị."
                            }

                        </div>

                        <div class="doctor-actions">

                            <button
                                type="button"
                                class="btn btn-primary booking-doctor-btn"
                                data-doctor-id="${doctor.id}"
                            >

                                <i class="fa-solid fa-calendar-check"></i>

                                Đặt lịch

                            </button>

                        </div>

                    </div>
                `;


                container.appendChild(card);
            }
        );


        document
            .querySelectorAll(".booking-doctor-btn")
            .forEach(button => {

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
            });


    } catch (error) {

        console.error(
            "LOAD DOCTORS ERROR:",
            error
        );

        container.innerHTML = `

            <div class="error-message">

                Không thể tải danh sách bác sĩ.

                <button
                    type="button"
                    onclick="loadDoctors()"
                >
                    Thử lại
                </button>

            </div>
        `;
    }
}


/* =====================================================
   MỞ FORM ĐẶT LỊCH
===================================================== */

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


    const userData =
        localStorage.getItem("user");


    if (!userData) {

        alert(
            "Bạn cần đăng nhập trước khi đặt lịch."
        );

        window.location.href =
            "login.html";

        return;
    }


    panel.classList.add("show");

    panel.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });


    if (doctorId) {

        const doctorSelect =
            document.getElementById(
                "doctorSelect"
            );

        if (doctorSelect) {

            doctorSelect.value =
                String(doctorId);

            doctorSelect.dispatchEvent(
                new Event("change")
            );
        }
    }
}


/* =====================================================
   FORM ĐẶT LỊCH
===================================================== */

function setupBookingForm() {

    const doctorSelect =
        document.getElementById(
            "doctorSelect"
        );

    const dateInput =
        document.getElementById(
            "appointmentDate"
        );

    const closeButton =
        document.getElementById(
            "closeAppointment"
        );


    if (!doctorSelect) {
        return;
    }


    /* Đóng */

    if (closeButton) {

        closeButton.addEventListener(
            "click",
            closeBookingPanel
        );
    }


    /* Chọn bác sĩ */

    doctorSelect.addEventListener(
        "change",
        async function () {

            const doctorId =
                this.value;

            resetSlots();


            if (!doctorId) {
                return;
            }

            await loadDoctorDates(
                doctorId
            );
        }
    );


    /* Chọn ngày */

    if (dateInput) {

        dateInput.addEventListener(
            "change",
            async function () {

                const doctorId =
                    doctorSelect.value;

                const date =
                    this.value;


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


    /* Submit */

    const form =
        document.getElementById(
            "appointmentForm"
        );


    if (form) {

        form.addEventListener(
            "submit",
            submitAppointment
        );
    }
}


/* =====================================================
   LOAD NGÀY CÓ LỊCH
===================================================== */

async function loadDoctorDates(
    doctorId
) {

    const dateInput =
        document.getElementById(
            "appointmentDate"
        );


    if (!dateInput) {
        return;
    }


    /*
       Backend hiện tại của chúng ta
       lấy slot theo doctor + date.

       Vì vậy frontend sẽ cho người dùng
       chọn ngày bằng input date.
    */

    dateInput.disabled = false;

    dateInput.value = "";

    resetSlots();
}


/* =====================================================
   LOAD GIỜ KHÁM
===================================================== */

async function loadAvailableSlotsUI(
    doctorId,
    date
) {

    const container =
        document.getElementById(
            "slotList"
        );


    if (!container) {
        return;
    }


    container.innerHTML = `
        <div class="slot-loading">
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
            result.data || [];


        container.innerHTML = "";


        if (slots.length === 0) {

            container.innerHTML = `
                <div class="empty-state">
                    Bác sĩ không có lịch khám
                    trong ngày này.
                </div>
            `;

            return;
        }


        slots
            .filter(slot => slot.available)
            .forEach(slot => {

                const button =
                    document.createElement(
                        "button"
                    );

                button.type = "button";

                button.className =
                    "slot-button";

                button.dataset.scheduleId =
                    slot.schedule_id;

                button.dataset.time =
                    slot.time;

                button.textContent =
                    formatTime(slot.time);


                button.addEventListener(
                    "click",
                    function () {

                        document
                            .querySelectorAll(
                                ".slot-button"
                            )
                            .forEach(
                                item =>
                                    item.classList.remove(
                                        "selected"
                                    )
                            );

                        this.classList.add(
                            "selected"
                        );


                        document.getElementById(
                            "selectedScheduleId"
                        ).value =
                            this.dataset.scheduleId;


                        document.getElementById(
                            "selectedAppointmentTime"
                        ).value =
                            this.dataset.time;
                    }
                );


                container.appendChild(
                    button
                );
            });


        const availableSlots =
            slots.filter(
                slot => slot.available
            );


        if (
            availableSlots.length === 0
        ) {

            container.innerHTML = `
                <div class="empty-state">
                    Tất cả giờ khám trong ngày
                    đã được đặt.
                </div>
            `;
        }


    } catch (error) {

        console.error(
            "LOAD SLOTS ERROR:",
            error
        );

        container.innerHTML = `
            <div class="error-message">
                Không thể tải giờ khám.
            </div>
        `;
    }
}


/* =====================================================
   SUBMIT ĐẶT LỊCH
===================================================== */

async function submitAppointment(
    event
) {

    event.preventDefault();


    const userData =
        localStorage.getItem("user");


    if (!userData) {

        alert(
            "Bạn cần đăng nhập."
        );

        window.location.href =
            "login.html";

        return;
    }


    const user =
        JSON.parse(userData);


    const doctorId =
        document.getElementById(
            "doctorSelect"
        ).value;


    const scheduleId =
        document.getElementById(
            "selectedScheduleId"
        ).value;


    const appointmentTime =
        document.getElementById(
            "selectedAppointmentTime"
        ).value;


    const reason =
        document.getElementById(
            "appointmentReason"
        ).value.trim();


    if (!doctorId) {

        alert(
            "Vui lòng chọn bác sĩ."
        );

        return;
    }


    if (!scheduleId) {

        alert(
            "Vui lòng chọn giờ khám."
        );

        return;
    }


    try {

        const result =
            await createAppointment({

                patient_id: user.id,

                doctor_id:
                    Number(doctorId),

                schedule_id:
                    Number(scheduleId),

                appointment_time:
                    appointmentTime,

                reason:
                    reason || null
            });


        alert(
            result.message ||
            "Đặt lịch khám thành công."
        );


        closeBookingPanel();

        /*
           Sau khi đặt thành công,
           tải lại danh sách bác sĩ / slot.
        */

        const date =
            document.getElementById(
                "appointmentDate"
            ).value;


        if (
            doctorId &&
            date
        ) {

            await loadAvailableSlotsUI(
                doctorId,
                date
            );
        }


    } catch (error) {

        console.error(
            "CREATE APPOINTMENT ERROR:",
            error
        );

        alert(
            error.message ||
            "Không thể đặt lịch."
        );
    }
}


/* =====================================================
   ĐÓNG FORM
===================================================== */

function closeBookingPanel() {

    const panel =
        document.getElementById(
            "appointmentPanel"
        );


    if (panel) {

        panel.classList.remove(
            "show"
        );
    }
}


/* =====================================================
   RESET GIỜ
===================================================== */

function resetSlots() {

    const container =
        document.getElementById(
            "slotList"
        );


    if (container) {

        container.innerHTML = `
            <div class="slot-empty">
                Chọn ngày để xem giờ khám.
            </div>
        `;
    }


    const schedule =
        document.getElementById(
            "selectedScheduleId"
        );


    const time =
        document.getElementById(
            "selectedAppointmentTime"
        );


    if (schedule) {
        schedule.value = "";
    }


    if (time) {
        time.value = "";
    }
}


/* =====================================================
   FORMAT TIME
===================================================== */

function formatTime(time) {

    if (!time) {
        return "";
    }

    return time.substring(
        0,
        5
    );
}


/* =====================================================
   ESCAPE HTML
===================================================== */

function escapeHtml(value) {

    if (value === null ||
        value === undefined) {

        return "";
    }


    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
document.addEventListener(
    "DOMContentLoaded",
    function () {

        const button =
            document.getElementById(
                "heroBookingButton"
            );

        if (button) {

            button.addEventListener(
                "click",
                function () {

                    openBookingPanel();
                }
            );
        }
    }
);