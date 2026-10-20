/*
=====================================================
CLINIC BOOKING - HỒ SƠ BỆNH NHÂN
1. Thông tin cá nhân
2. Thông tin sức khỏe
3. Lịch hẹn / đơn thuốc
4. Đổi mật khẩu
5. Đổi lịch / hủy lịch khám
=====================================================
*/
(() => {
    "use strict";
    const C = window.ProfileCommon;
    const { $, escapeHtml } = C;
    const PERSONAL_FIELDS = [
        "full_name",
        "phone",
        "date_of_birth",
        "gender",
        "address"
    ];
    const MEDICAL_FIELDS = [
        "blood_type",
        "insurance_number",
        "allergies",
        "medical_history",
        "emergency_contact_name",
        "emergency_contact_phone"
    ];
    let appointments = [];
    let prescriptions = [];
    let appointmentFilter = "upcoming";
    let prescriptionsLoaded = false;
    // Trạng thái chức năng đổi lịch
    let reschedulingAppointment = null;
    let rescheduleSlotRequestId = 0;
    document.addEventListener("DOMContentLoaded", init);
    /* =====================================================
       KHỞI TẠO TRANG HỒ SƠ
       ===================================================== */
    async function init() {
        const user = await C.requireRole("patient");
        if (!user) return;
        C.setupHeader();
        C.setupSectionNav();
        C.setupPasswordForm($("passwordForm"));
        const personalForm = $("personalForm");
        const medicalForm = $("medicalForm");
        const { profile, fromServer } = await C.loadProfile();
        C.fillForm(personalForm, profile);
        C.fillForm(medicalForm, profile);
        renderIdentity(profile);
        if (!fromServer) {
            C.showBanner(
                "Chưa tải được hồ sơ từ máy chủ nên đang hiển thị thông tin tài khoản đã lưu. Hãy kiểm tra kết nối/API trước khi lưu thay đổi.",
                "warn"
            );
        }
        const personalDirty = C.trackDirty(personalForm);
        const medicalDirty = C.trackDirty(medicalForm);
        C.guardUnsaved([personalDirty, medicalDirty]);
        // Cập nhật thông tin cá nhân
        personalForm?.addEventListener("submit", (event) =>
            submitForm(
                event,
                personalForm,
                PERSONAL_FIELDS,
                personalDirty,
                {
                    full_name: [
                        C.RULES.required,
                        C.RULES.maxLength(100)
                    ],
                    phone: [C.RULES.phone],
                    date_of_birth: [C.RULES.birthDate]
                }
            )
        );
        // Cập nhật thông tin sức khỏe
        medicalForm?.addEventListener("submit", (event) =>
            submitForm(
                event,
                medicalForm,
                MEDICAL_FIELDS,
                medicalDirty,
                {
                    emergency_contact_phone: [C.RULES.phone],
                    allergies: [C.RULES.maxLength(500)],
                    medical_history: [C.RULES.maxLength(1000)]
                }
            )
        );
        // Lọc lịch hẹn sắp tới và lịch đã qua
        document.querySelectorAll("[data-filter]").forEach((button) => {
            button.addEventListener("click", () => {
                appointmentFilter = button.dataset.filter;
                document.querySelectorAll("[data-filter]").forEach((item) =>
                    item.classList.toggle("active", item === button)
                );
                renderAppointments();
            });
        });
        setupAppointmentViews();
        // Gắn sự kiện đổi lịch, hủy lịch
        setupAppointmentActions();
        await loadAppointments();
    }
    /* =====================================================
       CHUYỂN ĐỔI GIỮA LỊCH HẸN VÀ ĐƠN THUỐC
       ===================================================== */
    function setupAppointmentViews() {
        const viewButtons = Array.from(
            document.querySelectorAll("[data-profile-view]")
        );
        const appointmentPanel = $("appointmentsView");
        const prescriptionPanel = $("prescriptionsView");
        const appointmentFilters = $("appointmentFilters");
        const showView = (view) => {
            const showAppointments = view !== "prescriptions";
            if (appointmentPanel) {
                appointmentPanel.hidden = !showAppointments;
            }
            if (prescriptionPanel) {
                prescriptionPanel.hidden = showAppointments;
            }
            if (appointmentFilters) {
                appointmentFilters.hidden = !showAppointments;
            }
            viewButtons.forEach((button) => {
                const active =
                    button.dataset.profileView ===
                    (showAppointments ? "appointments" : "prescriptions");
                button.classList.toggle("active", active);
                button.setAttribute(
                    "aria-selected",
                    active ? "true" : "false"
                );
            });
            if (!showAppointments && !prescriptionsLoaded) {
                loadPrescriptions();
            }
        };
        viewButtons.forEach((button) => {
            button.addEventListener("click", () => {
                showView(button.dataset.profileView);
            });
        });
        showView("appointments");
    }
    /* =====================================================
       HIỂN THỊ DANH TÍNH BỆNH NHÂN
       ===================================================== */
    function renderIdentity(profile) {
        const name =
            profile.full_name ||
            profile.fullName ||
            profile.email ||
            "Bệnh nhân";
        const displayName = $("displayName");
        const avatar = $("avatarBox");
        if (displayName) {
            displayName.textContent = name;
        }
        if (avatar) {
            avatar.textContent = name
                .trim()
                .split(/\s+/)
                .slice(-2)
                .map((word) => word[0])
                .join("")
                .toUpperCase();
        }
    }
    /* =====================================================
       LƯU FORM THÔNG TIN
       ===================================================== */
    async function submitForm(
        event,
        form,
        fields,
        tracker,
        rules
    ) {
        event.preventDefault();
        C.clearErrors(form);
        if (!C.validateForm(form, rules)) {
            return;
        }
        try {
            const data = C.readForm(form, fields);
            const result = await C.withBusy(
                form.querySelector('button[type="submit"]'),
                () => C.saveProfile(data)
            );
            const saved = C.extractObject(result);
            tracker.reset();
            renderIdentity({
                ...(C.getCurrentUser() || {}),
                ...data,
                ...(saved || {})
            });
            C.setupHeader();
            C.toast("Đã lưu thay đổi.");
        } catch (error) {
            C.toast(
                error.message || "Không thể lưu thay đổi.",
                "error"
            );
        }
    }
    /* =====================================================
       LỊCH HẸN VÀ LỊCH SỬ KHÁM
       ===================================================== */
    async function loadAppointments() {
        const list = $("appointmentList");
        if (!list) return;
        list.innerHTML = `
            <div class="empty">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <p>Đang tải lịch hẹn...</p>
            </div>
        `;
        try {
            const response = await C.requestFirst(
                C.ENDPOINTS.appointments
            );
            appointments = C.extractArray(response);
            renderAppointments();
        } catch (error) {
            list.innerHTML = `
                <div class="empty">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <p>${escapeHtml(
                        error.message || "Không thể tải lịch hẹn."
                    )}</p>
                    <button
                        type="button"
                        class="btn btn-outline"
                        id="retryAppointments"
                    >
                        Thử lại
                    </button>
                </div>
            `;
            $("retryAppointments")?.addEventListener(
                "click",
                loadAppointments
            );
        }
    }
    function appointmentDate(item) {
        return C.toDateInput(
            item.schedule_date ||
            item.appointment_date ||
            item.date
        );
    }
    function normalizedStatus(item) {
        return C.normalize(item?.status).toUpperCase();
    }
    function statusInfo(value) {
        const status = C.normalize(value).toUpperCase();
        if (["COMPLETED", "DONE"].includes(status)) {
            return {
                label: "Đã khám",
                cls: "tag--ok"
            };
        }
        if (["CONFIRMED", "APPROVED"].includes(status)) {
            return {
                label: "Đã xác nhận",
                cls: "tag--ok"
            };
        }
        if (["CANCELLED", "CANCELED"].includes(status)) {
            return {
                label: "Đã hủy",
                cls: "tag--bad"
            };
        }
        if (status === "REJECTED") {
            return {
                label: "Bị từ chối",
                cls: "tag--bad"
            };
        }
        if (["NO_SHOW", "NOSHOW"].includes(status)) {
            return {
                label: "Không đến khám",
                cls: "tag--bad"
            };
        }
        return {
            label: "Chờ xác nhận",
            cls: "tag--wait"
        };
    }
    /*
     * Kiểm tra lịch đã qua hay chưa.
     * Lịch đã hủy, đã khám, bị từ chối và không đến khám
     * cũng được xếp vào nhóm lịch đã qua.
     */
    function isPastAppointment(item, today) {
        const status = normalizedStatus(item);
        const terminal = [
            "COMPLETED",
            "DONE",
            "CANCELLED",
            "CANCELED",
            "REJECTED",
            "NO_SHOW",
            "NOSHOW"
        ];
        const date = appointmentDate(item);
        if (date < today || terminal.includes(status)) {
            return true;
        }
        // Nếu lịch diễn ra hôm nay, không cho đổi/hủy
        // khi giờ khám đã đến hoặc đã qua.
        if (date === today) {
            const time = C.formatTime(item.appointment_time);
            const match = /^(\d{2}):(\d{2})$/.exec(time);
            if (match) {
                const now = new Date();
                const currentMinutes =
                    now.getHours() * 60 + now.getMinutes();
                const appointmentMinutes =
                    Number(match[1]) * 60 + Number(match[2]);
                return appointmentMinutes <= currentMinutes;
            }
        }
        return false;
    }
    /* =====================================================
       HIỂN THỊ DANH SÁCH LỊCH HẸN
       ===================================================== */
    function renderAppointments() {
        const list = $("appointmentList");
        if (!list) return;
        const today = C.todayString();
        const rows = appointments
            .filter((item) =>
                appointmentFilter === "upcoming"
                    ? appointmentDate(item) >= today &&
                      !isPastAppointment(item, today)
                    : isPastAppointment(item, today)
            )
            .sort((a, b) =>
                appointmentFilter === "upcoming"
                    ? appointmentDate(a).localeCompare(
                          appointmentDate(b)
                      ) ||
                      C.formatTime(a.appointment_time).localeCompare(
                          C.formatTime(b.appointment_time)
                      )
                    : appointmentDate(b).localeCompare(
                          appointmentDate(a)
                      ) ||
                      C.formatTime(b.appointment_time).localeCompare(
                          C.formatTime(a.appointment_time)
                      )
            );
        if (!rows.length) {
            list.innerHTML = `
                <div class="empty">
                    <i class="fa-regular fa-calendar"></i>
                    <p>
                        ${
                            appointmentFilter === "upcoming"
                                ? "Bạn chưa có lịch hẹn sắp tới."
                                : "Chưa có lịch hẹn nào đã qua."
                        }
                    </p>
                    ${
                        appointmentFilter === "upcoming"
                            ? '<a href="home.html#doctors" class="btn btn-primary">Đặt lịch khám</a>'
                            : ""
                    }
                </div>
            `;
            return;
        }
        list.innerHTML = rows.map((item) => {
            const date = appointmentDate(item);
            const [year, month, day] = date
                ? date.split("-")
                : ["", "", ""];
            const status = statusInfo(item.status);
            const time = C.formatTime(
                item.appointment_time || item.start_time
            );
            const rawDoctor =
                item.doctor_name ||
                item.full_name ||
                "Bác sĩ";
            const doctor = /^bs\.?\s/i.test(rawDoctor)
                ? rawDoctor
                : `BS. ${rawDoctor}`;
            const detail = [
                item.specialty_name,
                time
            ].filter(Boolean).join(" • ");
            const arrival = item.actual_arrival_time
                ? `Đến khám: ${C.formatTime(item.actual_arrival_time)}`
                : "";
            const late = Number(item.late_minutes) > 0
                ? `Đến muộn ${Number(item.late_minutes)} phút`
                : "";
            // Chỉ cho đổi/hủy lịch tương lai thuộc trạng thái hợp lệ.
            const canManageAppointment =
                ["PENDING", "CONFIRMED"].includes(
                    normalizedStatus(item)
                ) &&
                !isPastAppointment(item, today) &&
                Number(item.id) > 0;
            const actionButtons = canManageAppointment
                ? `
                    <div class="appointment-actions">
                        <button
                            type="button"
                            class="appointment-action"
                            data-reschedule-appointment="${Number(item.id)}"
                        >
                            <i class="fa-solid fa-calendar-days"></i>
                            Đổi lịch
                        </button>
                        <button
                            type="button"
                            class="appointment-action appointment-action--danger"
                            data-cancel-appointment="${Number(item.id)}"
                        >
                            <i class="fa-solid fa-calendar-xmark"></i>
                            Hủy lịch
                        </button>
                    </div>
                `
                : "";
            return `
                <div class="item">
                    <div class="item-date">
                        <strong>${escapeHtml(day || "--")}</strong>
                        <span>
                            Th${escapeHtml(month || "--")}/${escapeHtml(year || "")}
                        </span>
                    </div>
                    <div class="item-main">
                        <strong>${escapeHtml(doctor)}</strong>
                        <span>
                            ${escapeHtml(detail || "Chưa có giờ khám")}
                        </span>
                        ${
                            item.reason
                                ? `<span>Lý do: ${escapeHtml(item.reason)}</span>`
                                : ""
                        }
                        ${
                            arrival
                                ? `
                                    <span>
                                        ${escapeHtml(arrival)}
                                        ${late ? ` • ${escapeHtml(late)}` : ""}
                                    </span>
                                `
                                : ""
                        }
                        ${
                            item.note
                                ? `<span>Ghi chú: ${escapeHtml(item.note)}</span>`
                                : ""
                        }
                        ${actionButtons}
                    </div>
                    <span class="tag ${status.cls}">
                        ${status.label}
                    </span>
                </div>
            `;
        }).join("");
    }
    /* =====================================================
       ĐỔI LỊCH / HỦY LỊCH KHÁM
       ===================================================== */
    function setupAppointmentActions() {
        const list = $("appointmentList");
        const modal = $("rescheduleModal");
        const dateInput = $("rescheduleDate");
        const form = $("rescheduleForm");
        // Dùng event delegation vì danh sách được render lại.
        if (list && list.dataset.actionsBound !== "1") {
            list.dataset.actionsBound = "1";
            list.addEventListener("click", async (event) => {
                const changeButton = event.target.closest(
                    "[data-reschedule-appointment]"
                );
                const cancelButton = event.target.closest(
                    "[data-cancel-appointment]"
                );
                const button = changeButton || cancelButton;
                if (!button) return;
                const id = Number(
                    changeButton
                        ? changeButton.dataset.rescheduleAppointment
                        : cancelButton.dataset.cancelAppointment
                );
                const item = appointments.find(
                    (appointment) => Number(appointment.id) === id
                );
                if (!item) {
                    C.toast(
                        "Không tìm thấy thông tin lịch hẹn.",
                        "error"
                    );
                    return;
                }
                if (changeButton) {
                    openRescheduleModal(item);
                } else {
                    await cancelPatientAppointment(item);
                }
            });
        }
        dateInput?.addEventListener(
            "change",
            loadRescheduleSlots
        );
        form?.addEventListener(
            "submit",
            submitReschedule
        );
        document.querySelectorAll("[data-close-reschedule]").forEach(
            (button) => {
                if (button.dataset.closeRescheduleBound === "1") {
                    return;
                }
                button.dataset.closeRescheduleBound = "1";
                button.addEventListener(
                    "click",
                    closeRescheduleModal
                );
            }
        );
        modal?.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                closeRescheduleModal();
            }
        });
    }
    /* =====================================================
       HỦY LỊCH KHÁM
       ===================================================== */
    async function cancelPatientAppointment(item) {
        const doctorName = item.doctor_name || "bác sĩ";
        const date = C.formatDate(appointmentDate(item));
        const time = C.formatTime(item.appointment_time);
        const confirmed = window.confirm(
            `Bạn có chắc muốn hủy lịch khám với ${doctorName} ` +
            `vào ${date} lúc ${time} không?`
        );
        if (!confirmed) return;
        try {
            const result = await apiFetch(
                `/api/appointments/${encodeURIComponent(item.id)}/cancel`,
                {
                    method: "PATCH"
                }
            );
            C.toast(
                result?.message || "Đã hủy lịch khám thành công."
            );
            await loadAppointments();
        } catch (error) {
            C.toast(
                error.message || "Không thể hủy lịch khám.",
                "error"
            );
        }
    }
    /* =====================================================
       MỞ HỘP THOẠI ĐỔI LỊCH
       ===================================================== */
    function openRescheduleModal(item) {
        if (!item?.id || !item?.doctor_id) {
            C.toast(
                "Thiếu thông tin lịch hẹn hoặc bác sĩ.",
                "error"
            );
            return;
        }
        const modal = $("rescheduleModal");
        const dateInput = $("rescheduleDate");
        if (!modal || !dateInput) {
            C.toast(
                "Chưa tìm thấy hộp thoại đổi lịch. " +
                "Hãy bổ sung HTML đổi lịch vào patient-profile.html.",
                "error"
            );
            return;
        }
        reschedulingAppointment = item;
        const today = C.todayString();
        dateInput.min = today;
        dateInput.value =
            appointmentDate(item) >= today
                ? appointmentDate(item)
                : today;
        $("rescheduleScheduleId").value = "";
        $("rescheduleAppointmentTime").value = "";
        const feedback = $("rescheduleFeedback");
        if (feedback) {
            feedback.hidden = true;
            feedback.textContent = "";
        }
        $("rescheduleAppointmentInfo").textContent =
            `BS. ${item.doctor_name || "Bác sĩ"} · ` +
            `Lịch hiện tại: ${C.formatDate(appointmentDate(item))} ` +
            `lúc ${C.formatTime(item.appointment_time)}`;
        modal.hidden = false;
        modal.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
        loadRescheduleSlots();
    }
    /* =====================================================
       ĐÓNG HỘP THOẠI ĐỔI LỊCH
       ===================================================== */
    function closeRescheduleModal() {
        const modal = $("rescheduleModal");
        // Vô hiệu hóa phản hồi API đang tải dở.
        rescheduleSlotRequestId++;
        reschedulingAppointment = null;
        if (modal) {
            modal.hidden = true;
            modal.setAttribute("aria-hidden", "true");
        }
        document.body.style.overflow = "";
        if ($("rescheduleScheduleId")) {
            $("rescheduleScheduleId").value = "";
        }
        if ($("rescheduleAppointmentTime")) {
            $("rescheduleAppointmentTime").value = "";
        }
    }
    /* =====================================================
       HIỂN THỊ THÔNG BÁO ĐỔI LỊCH
       ===================================================== */
    function showRescheduleFeedback(message, isError = true) {
        const feedback = $("rescheduleFeedback");
        if (!feedback) return;
        feedback.textContent = message;
        feedback.className = "reschedule-feedback";
        if (isError) {
            feedback.classList.add("is-error");
        }
        feedback.hidden = false;
    }
    /* =====================================================
       TẢI GIỜ KHÁM CÒN TRỐNG
       ===================================================== */
    async function loadRescheduleSlots() {
        const item = reschedulingAppointment;
        const dateInput = $("rescheduleDate");
        const slotList = $("rescheduleSlotList");
        const scheduleInput = $("rescheduleScheduleId");
        const timeInput = $("rescheduleAppointmentTime");
        const feedback = $("rescheduleFeedback");
        if (
            !item ||
            !dateInput ||
            !slotList ||
            !scheduleInput ||
            !timeInput
        ) {
            return;
        }
        const doctorId = Number(item.doctor_id);
        const date = dateInput.value;
        const requestId = ++rescheduleSlotRequestId;
        scheduleInput.value = "";
        timeInput.value = "";
        if (feedback) {
            feedback.hidden = true;
            feedback.textContent = "";
        }
        if (!doctorId || !date) {
            slotList.innerHTML = `
                <div class="empty">
                    <p>Vui lòng chọn ngày khám.</p>
                </div>
            `;
            return;
        }
        slotList.innerHTML = `
            <div class="empty">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <p>Đang tải giờ khám...</p>
            </div>
        `;
        try {
            const result = await apiFetch(
                `/api/doctors/${encodeURIComponent(doctorId)}` +
                `/available-slots?date=${encodeURIComponent(date)}`
            );
            // Bỏ qua phản hồi cũ khi người dùng đổi ngày liên tục.
            if (
                requestId !== rescheduleSlotRequestId ||
                !reschedulingAppointment
            ) {
                return;
            }
            const rawSlots = Array.isArray(result?.data)
                ? result.data
                : [];
            const seen = new Set();
            const slots = rawSlots
                .filter((slot) =>
                    slot.available === true ||
                    slot.available === 1 ||
                    slot.available === "1"
                )
                .map((slot) => ({
                    scheduleId: Number(slot.schedule_id),
                    time: String(
                        slot.time || slot.appointment_time || ""
                    ).slice(0, 5)
                }))
                .filter((slot) =>
                    Number.isInteger(slot.scheduleId) &&
                    slot.scheduleId > 0 &&
                    /^\d{2}:\d{2}$/.test(slot.time)
                )
                .filter((slot) => {
                    const key = `${slot.scheduleId}-${slot.time}`;
                    if (seen.has(key)) {
                        return false;
                    }
                    seen.add(key);
                    return true;
                })
                .sort((a, b) =>
                    a.time.localeCompare(b.time) ||
                    a.scheduleId - b.scheduleId
                );
            if (!slots.length) {
                slotList.innerHTML = `
                    <div class="empty">
                        <i class="fa-regular fa-calendar-xmark"></i>
                        <p>Ngày này không còn giờ khám phù hợp.</p>
                        <p>Vui lòng chọn ngày khác.</p>
                    </div>
                `;
                return;
            }
            slotList.innerHTML = slots.map((slot) => `
                <button
                    type="button"
                    class="reschedule-slot"
                    data-schedule-id="${slot.scheduleId}"
                    data-time="${slot.time}"
                >
                    ${slot.time}
                </button>
            `).join("");
            slotList
                .querySelectorAll(".reschedule-slot")
                .forEach((button) => {
                    button.addEventListener("click", () => {
                        slotList
                            .querySelectorAll(".reschedule-slot")
                            .forEach((slot) => {
                                slot.classList.remove("is-selected");
                            });
                        button.classList.add("is-selected");
                        scheduleInput.value =
                            button.dataset.scheduleId || "";
                        timeInput.value =
                            button.dataset.time || "";
                    });
                });
        } catch (error) {
            if (requestId !== rescheduleSlotRequestId) {
                return;
            }
            slotList.innerHTML = `
                <div class="empty">
                    <p>Không thể tải giờ khám.</p>
                    <p>Vui lòng thử lại.</p>
                </div>
            `;
            showRescheduleFeedback(
                error.message || "Không thể tải giờ khám.",
                true
            );
        }
    }
    /* =====================================================
       GỬI YÊU CẦU ĐỔI LỊCH
       ===================================================== */
    async function submitReschedule(event) {
        event.preventDefault();
        const item = reschedulingAppointment;
        if (!item) {
            showRescheduleFeedback(
                "Không tìm thấy lịch hẹn cần đổi.",
                true
            );
            return;
        }
        const scheduleId = Number(
            $("rescheduleScheduleId")?.value
        );
        const appointmentTime =
            $("rescheduleAppointmentTime")?.value || "";
        if (
            !Number.isInteger(scheduleId) ||
            scheduleId <= 0 ||
            !/^\d{2}:\d{2}$/.test(appointmentTime)
        ) {
            showRescheduleFeedback(
                "Vui lòng chọn một khung giờ còn trống.",
                true
            );
            return;
        }
        const submitButton = $("rescheduleSubmit");
        if (submitButton) {
            submitButton.disabled = true;
        }
        try {
            const result = await apiFetch(
                `/api/appointments/${encodeURIComponent(item.id)}/reschedule`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        schedule_id: scheduleId,
                        appointment_time: appointmentTime
                    })
                }
            );
            closeRescheduleModal();
            C.toast(
                result?.message ||
                "Đổi lịch thành công. Lịch mới đang chờ phòng khám xác nhận."
            );
            await loadAppointments();
        } catch (error) {
            showRescheduleFeedback(
                error.message || "Không thể đổi lịch khám.",
                true
            );
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
            }
        }
    }
    /* =====================================================
       ĐƠN THUỐC
       Chỉ hiển thị dữ liệu thực sự được lưu trong database.
       ===================================================== */
    async function loadPrescriptions() {
        const list = $("prescriptionList");
        if (!list) return;
        list.innerHTML = `
            <div class="empty">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <p>Đang tải đơn thuốc...</p>
            </div>
        `;
        try {
            const response = await C.requestFirst(
                C.ENDPOINTS.prescriptions
            );
            prescriptions = C.extractArray(response);
            prescriptionsLoaded = true;
            renderPrescriptions();
        } catch (error) {
            list.innerHTML = `
                <div class="empty">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <p>${escapeHtml(
                        error.message || "Không thể tải đơn thuốc."
                    )}</p>
                    <button
                        type="button"
                        class="btn btn-outline"
                        id="retryPrescriptions"
                    >
                        Thử lại
                    </button>
                </div>
            `;
            $("retryPrescriptions")?.addEventListener(
                "click",
                loadPrescriptions
            );
        }
    }
    function renderPrescriptions() {
        const list = $("prescriptionList");
        if (!list) return;
        if (!prescriptions.length) {
            list.innerHTML = `
                <div class="empty">
                    <i class="fa-solid fa-prescription-bottle-medical"></i>
                    <p>Chưa có đơn thuốc được lưu trong hệ thống.</p>
                </div>
            `;
            return;
        }
        const grouped = new Map();
        prescriptions.forEach((item) => {
            const key = String(
                item.prescription_id ??
                item.id ??
                "unknown"
            );
            if (!grouped.has(key)) {
                grouped.set(key, {
                    ...item,
                    medicines: []
                });
            }
            if (
                item.item_id != null ||
                item.medicine_name
            ) {
                grouped.get(key).medicines.push(item);
            }
        });
        list.innerHTML = Array.from(grouped.values())
            .map((prescription) => {
                const date = C.toDateInput(
                    prescription.prescription_date ||
                    prescription.schedule_date
                );
                const [year, month, day] = date
                    ? date.split("-")
                    : ["", "", ""];
                const rawDoctor =
                    prescription.doctor_name || "Bác sĩ";
                const doctor = /^bs\.?\s/i.test(rawDoctor)
                    ? rawDoctor
                    : `BS. ${rawDoctor}`;
                const medicines = prescription.medicines.length
                    ? `
                        <div class="prescription-medicines">
                            ${prescription.medicines.map((medicine) => `
                                <div class="prescription-medicine">
                                    <strong>
                                        ${escapeHtml(
                                            medicine.medicine_name || "Thuốc"
                                        )}
                                    </strong>
                                    <span>
                                        ${escapeHtml(
                                            medicine.dosage ||
                                            "Chưa cập nhật liều dùng"
                                        )}
                                        ${
                                            medicine.frequency
                                                ? ` • ${escapeHtml(medicine.frequency)}`
                                                : ""
                                        }
                                        ${
                                            medicine.duration
                                                ? ` • ${escapeHtml(medicine.duration)}`
                                                : ""
                                        }
                                    </span>
                                    ${
                                        medicine.quantity
                                            ? `<span>Số lượng: ${escapeHtml(medicine.quantity)}</span>`
                                            : ""
                                    }
                                    ${
                                        medicine.instructions
                                            ? `<span>Hướng dẫn: ${escapeHtml(medicine.instructions)}</span>`
                                            : ""
                                    }
                                </div>
                            `).join("")}
                        </div>
                    `
                    : `
                        <p class="panel-sub">
                            Đơn thuốc chưa có thuốc chi tiết.
                        </p>
                    `;
                return `
                    <article class="item prescription-card">
                        <div class="item-date">
                            <strong>
                                ${escapeHtml(day || "--")}
                            </strong>
                            <span>
                                Th${escapeHtml(month || "--")}/${escapeHtml(year || "")}
                            </span>
                        </div>
                        <div class="item-main">
                            <strong>${escapeHtml(doctor)}</strong>
                            <span>
                                ${escapeHtml(prescription.specialty_name || "")}
                                ${
                                    prescription.appointment_time
                                        ? ` • Giờ khám ${escapeHtml(
                                              C.formatTime(
                                                  prescription.appointment_time
                                              )
                                          )}`
                                        : ""
                                }
                            </span>
                            ${
                                prescription.diagnosis
                                    ? `
                                        <span>
                                            <b>Chẩn đoán:</b>
                                            ${escapeHtml(prescription.diagnosis)}
                                        </span>
                                    `
                                    : ""
                            }
                            ${
                                prescription.treatment_plan
                                    ? `
                                        <span>
                                            <b>Hướng điều trị:</b>
                                            ${escapeHtml(prescription.treatment_plan)}
                                        </span>
                                    `
                                    : ""
                            }
                            ${
                                prescription.prescription_note
                                    ? `
                                        <span>
                                            <b>Ghi chú đơn thuốc:</b>
                                            ${escapeHtml(prescription.prescription_note)}
                                        </span>
                                    `
                                    : ""
                            }
                            ${medicines}
                        </div>
                    </article>
                `;
            })
            .join("");
    }
})();