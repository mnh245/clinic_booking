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
    let reviewingAppointment = null;
    let selectedRating = 0;

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
        setupReviewActions();
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
            if (!showAppointments) {
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

        // Đổi lịch / hủy lịch
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

        // Đánh giá bác sĩ: xem lại / chỉnh sửa sau khi hoàn thành khám
        const reviewButton = renderReviewBlock(item);

        const statusLabel =
            normalizedStatus(item) === "COMPLETED" && hasReview(item)
                ? `${status.label} • Đã đánh giá`
                : status.label;

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

                    ${reviewButton}
                </div>

                <span class="tag ${status.cls}">
                    ${escapeHtml(statusLabel)}
                </span>
            </div>
        `;
    }).join("");
}
/* =====================================================
   ĐÁNH GIÁ BÁC SĨ
   ===================================================== */

// Số ngày được chỉnh sửa đánh giá sau khi khám (backend cũng kiểm tra)
const REVIEW_EDIT_DAYS = 3;

// "create" = đánh giá lần đầu, "edit" = chỉnh sửa đánh giá cũ
let reviewMode = "create";

function hasReview(item) {
    return Number(item?.has_review) === 1 || item?.has_review === true;
}

function canEditReview(item) {
    if (!hasReview(item) || !item.review_editable) {
        return false;
    }

    // Kiểm tra lại theo giờ máy để nút tự ẩn nếu trang mở lâu quá hạn
    if (item.review_edit_deadline) {
        const deadline = new Date(item.review_edit_deadline).getTime();

        if (!Number.isNaN(deadline)) {
            return Date.now() <= deadline;
        }
    }

    return true;
}

function formatDateTimeVN(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    const pad = (number) => String(number).padStart(2, "0");

    return (
        `${pad(date.getHours())}:${pad(date.getMinutes())} ` +
        `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/` +
        `${date.getFullYear()}`
    );
}

function renderStars(rating) {
    const value = Math.max(0, Math.min(5, Number(rating) || 0));

    const stars = [1, 2, 3, 4, 5]
        .map((number) =>
            `<i class="fa-${number <= value ? "solid" : "regular"} fa-star"></i>`
        )
        .join("");

    return `<span class="review-stars-static" role="img" aria-label="${value} trên 5 sao">${stars}</span>`;
}

/*
 * Khối đánh giá hiển thị dưới mỗi lịch hẹn đã khám:
 * - Chưa đánh giá: nút "Đánh giá bác sĩ"
 * - Đã đánh giá: nhãn "Đã đánh giá", số sao, nhận xét,
 *   hạn chỉnh sửa và nút "Chỉnh sửa đánh giá" (nếu còn hạn)
 */
function renderReviewBlock(item) {
    if (normalizedStatus(item) !== "COMPLETED") {
        return "";
    }

    const id = Number(item.id);

    if (!hasReview(item)) {
        return `
            <div class="appointment-actions">
                <button
                    type="button"
                    class="appointment-action appointment-action--review"
                    data-review-appointment="${id}"
                >
                    <i class="fa-solid fa-star"></i>
                    Đánh giá bác sĩ
                </button>
            </div>
        `;
    }

    const editable = canEditReview(item);

    const deadlineText = item.review_edit_deadline
        ? formatDateTimeVN(item.review_edit_deadline)
        : "";

    const note = editable
        ? (
            deadlineText
                ? `Bạn có thể chỉnh sửa đánh giá đến ${deadlineText}.`
                : "Bạn có thể chỉnh sửa đánh giá."
        )
        : `Đã quá ${REVIEW_EDIT_DAYS} ngày kể từ ngày khám nên không thể chỉnh sửa.`;

    const reviewedAt = item.review_created_at
        ? formatDateTimeVN(item.review_created_at)
        : "";

    const comment = String(item.review_comment ?? "").trim();

    return `
        <div class="review-summary">
            <div class="review-summary-head">
                <span class="review-completed">
                    <i class="fa-solid fa-circle-check"></i>
                    Đã đánh giá
                </span>
                ${renderStars(item.review_rating)}
                ${
                    reviewedAt
                        ? `<span class="review-summary-time">${escapeHtml(reviewedAt)}</span>`
                        : ""
                }
            </div>

            <p class="review-summary-comment${comment ? "" : " is-empty"}">
                ${
                    comment
                        ? escapeHtml(comment)
                        : "Bạn không để lại nhận xét."
                }
            </p>

            <div class="review-summary-foot">
                <span class="review-summary-note">
                    ${escapeHtml(note)}
                </span>

                ${
                    editable
                        ? `
                            <button
                                type="button"
                                class="appointment-action appointment-action--review"
                                data-edit-review-appointment="${id}"
                            >
                                <i class="fa-solid fa-pen"></i>
                                Chỉnh sửa đánh giá
                            </button>
                        `
                        : ""
                }
            </div>
        </div>
    `;
}

function openReviewModal(item) {
    if (
        !item ||
        normalizedStatus(item) !== "COMPLETED"
    ) {
        C.toast(
            "Chỉ có thể đánh giá sau khi hoàn thành khám.",
            "error"
        );
        return;
    }

    const editing = hasReview(item);

    if (editing && !canEditReview(item)) {
        C.toast(
            `Đã quá ${REVIEW_EDIT_DAYS} ngày kể từ ngày khám ` +
            "nên không thể chỉnh sửa đánh giá.",
            "error"
        );
        return;
    }

    const modal = $("reviewModal");
    const doctorInfo = $("reviewDoctorInfo");
    const comment = $("reviewComment");
    const feedback = $("reviewFeedback");
    const title = $("reviewTitle");

    if (!modal) {
        C.toast("Không tìm thấy hộp thoại đánh giá.", "error");
        return;
    }

    reviewMode = editing ? "edit" : "create";
    reviewingAppointment = item;
    selectedRating = editing
        ? Number(item.review_rating) || 0
        : 0;

    if (title) {
        title.innerHTML = `
            <i class="fa-solid fa-star"></i>
            ${editing ? "Chỉnh sửa đánh giá" : "Đánh giá bác sĩ"}
        `;
    }

    if (doctorInfo) {
        const deadlineText = editing && item.review_edit_deadline
            ? ` Bạn có thể chỉnh sửa đến ${formatDateTimeVN(item.review_edit_deadline)}.`
            : "";

        doctorInfo.textContent =
            `${editing ? "Chỉnh sửa đánh giá cho" : "Đánh giá"} bác sĩ ` +
            `${item.doctor_name || "Bác sĩ"} · ` +
            `${C.formatDate(appointmentDate(item))}.` +
            deadlineText;
    }

    if (comment) {
        comment.value = editing
            ? String(item.review_comment ?? "")
            : "";
    }

    if (feedback) {
        feedback.hidden = true;
        feedback.textContent = "";
    }

    updateReviewStars();
    setReviewSubmitBusy(false);

    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
}

function closeReviewModal() {
    const modal = $("reviewModal");

    reviewingAppointment = null;
    selectedRating = 0;

    if (modal) {
        modal.hidden = true;
        modal.setAttribute("aria-hidden", "true");
    }

    document.body.style.overflow = "";
}

function updateReviewStars() {
    const stars = document.querySelectorAll(
        "#reviewStars [data-rating]"
    );

    stars.forEach((star) => {
        const rating = Number(star.dataset.rating);

        star.classList.toggle(
            "active",
            rating <= selectedRating
        );
    });

    const ratingText = $("reviewRatingText");

    if (ratingText) {
        const labels = {
            0: "Vui lòng chọn số sao.",
            1: "Rất không hài lòng",
            2: "Không hài lòng",
            3: "Bình thường",
            4: "Hài lòng",
            5: "Rất hài lòng"
        };

        ratingText.textContent = labels[selectedRating];
    }
}

function showReviewFeedback(message, isError = true) {
    const feedback = $("reviewFeedback");
    if (!feedback) return;

    feedback.textContent = message;
    feedback.hidden = false;

    feedback.className = "reschedule-feedback";

    if (isError) {
        feedback.classList.add("is-error");
    }
}

// Trạng thái nút gửi: đang gửi / sẵn sàng (nhãn đổi theo chế độ)
function setReviewSubmitBusy(busy) {
    const button = $("reviewSubmit");

    if (!button) return;

    button.disabled = busy;

    if (busy) {
        button.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin"></i>
            Đang gửi...
        `;
        return;
    }

    button.innerHTML = reviewMode === "edit"
        ? `<i class="fa-solid fa-floppy-disk"></i> Lưu thay đổi`
        : `<i class="fa-solid fa-paper-plane"></i> Gửi đánh giá`;
}

async function submitDoctorReview(event) {
    event.preventDefault();

    const item = reviewingAppointment;

    if (!item) {
        showReviewFeedback("Không tìm thấy lịch hẹn cần đánh giá.");
        return;
    }

    if (selectedRating < 1 || selectedRating > 5) {
        showReviewFeedback("Vui lòng chọn số sao đánh giá.");
        return;
    }

    const comment = $("reviewComment")?.value.trim() || "";
    const isEdit = reviewMode === "edit";

    setReviewSubmitBusy(true);

    try {
        const result = await apiFetch(
            `/api/appointments/${encodeURIComponent(item.id)}/review`,
            {
                method: isEdit ? "PUT" : "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    rating: selectedRating,
                    comment
                })
            }
        );

        C.toast(
            result?.message ||
            (isEdit
                ? "Đã cập nhật đánh giá."
                : "Đánh giá bác sĩ thành công.")
        );

        closeReviewModal();

        // Tải lại để thẻ lịch hẹn chuyển sang trạng thái "Đã đánh giá"
        await loadAppointments();
    } catch (error) {
        showReviewFeedback(
            error.message || "Không thể gửi đánh giá."
        );

        // Đồng bộ lại danh sách (ví dụ đã quá hạn hoặc đã được đánh giá)
        loadAppointments();
    } finally {
        setReviewSubmitBusy(false);
    }
}

function setupReviewActions() {
    const form = $("reviewForm");

    document.querySelectorAll("[data-close-review]").forEach(
        (button) => {
            if (button.dataset.closeReviewBound === "1") return;

            button.dataset.closeReviewBound = "1";
            button.addEventListener("click", closeReviewModal);
        }
    );

    document.querySelectorAll("#reviewStars [data-rating]").forEach(
        (star) => {
            if (star.dataset.ratingBound === "1") return;

            star.dataset.ratingBound = "1";

            star.addEventListener("click", () => {
                selectedRating = Number(star.dataset.rating);
                updateReviewStars();
            });
        }
    );

    if (form && form.dataset.reviewBound !== "1") {
        form.dataset.reviewBound = "1";
        form.addEventListener("submit", submitDoctorReview);
    }

    $("reviewModal")?.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeReviewModal();
        }
    });
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
                const reviewButton = event.target.closest(
                    "[data-review-appointment]"
                );
                const editReviewButton = event.target.closest(
                    "[data-edit-review-appointment]"
                );

                const button =
                    changeButton ||
                    cancelButton ||
                    reviewButton ||
                    editReviewButton;

                if (!button) return;

                const id = Number(
                    button.dataset.rescheduleAppointment ??
                    button.dataset.cancelAppointment ??
                    button.dataset.reviewAppointment ??
                    button.dataset.editReviewAppointment
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
                } else if (cancelButton) {
                    await cancelPatientAppointment(item);
                } else {
                    // Đánh giá mới hoặc chỉnh sửa đánh giá cũ
                    openReviewModal(item);
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
            // Giữ cả giờ đã có người đặt để hiển thị khác màu.
            const slots = rawSlots
                .map((slot) => ({
                    scheduleId: Number(slot.schedule_id),
                    time: String(
                        slot.time || slot.appointment_time || ""
                    ).slice(0, 5),
                    available:
                        slot.available === true ||
                        slot.available === 1 ||
                        slot.available === "1"
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
                        <p>Bác sĩ không có lịch khám trong ngày này.</p>
                        <p>Vui lòng chọn ngày khác.</p>
                    </div>
                `;
                return;
            }
            // Giờ của chính lịch đang được đổi (nếu có trong dữ liệu).
            const currentScheduleId = Number(item.schedule_id);
            const currentTime = String(
                item.appointment_time || ""
            ).slice(0, 5);
            slotList.innerHTML = slots.map((slot) => {
                const isCurrent =
                    !slot.available &&
                    currentScheduleId === slot.scheduleId &&
                    currentTime === slot.time;
                const stateClass = slot.available
                    ? ""
                    : isCurrent
                        ? "is-booked is-current"
                        : "is-booked";
                const stateLabel = slot.available
                    ? ""
                    : isCurrent
                        ? "Lịch hiện tại"
                        : "Đã đặt";
                return `
                    <button
                        type="button"
                        class="reschedule-slot ${stateClass}"
                        data-schedule-id="${slot.scheduleId}"
                        data-time="${slot.time}"
                        ${slot.available ? "" : "disabled"}
                    >
                        <span class="slot-time">${slot.time}</span>
                        ${
                            stateLabel
                                ? `<span class="slot-state">${stateLabel}</span>`
                                : ""
                        }
                    </button>
                `;
            }).join("");
            if (!slots.some((slot) => slot.available)) {
                showRescheduleFeedback(
                    "Ngày này đã hết giờ trống. Vui lòng chọn ngày khác.",
                    true
                );
            }
            slotList
                .querySelectorAll(".reschedule-slot:not(:disabled)")
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
            const response = await apiFetch("/api/prescriptions/my");
            prescriptions = Array.isArray(response?.data)
                ? response.data
                : [];
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
    // Trường trống hiển thị mờ thay vì bỏ trống
    function rxValue(value, emptyText = "Không có") {
        const text = String(value ?? "").trim();

        return text
            ? escapeHtml(text)
            : `<span class="rx-none">${escapeHtml(emptyText)}</span>`;
    }

    function renderMedicine(medicine, index) {
        const fields = [
            ["Liều dùng", medicine.dosage],
            ["Tần suất", medicine.frequency],
            ["Thời gian dùng", medicine.duration],
            ["Số lượng", medicine.quantity]
        ];

        return `
            <div class="rx-medicine">
                <div class="rx-medicine-head">
                    <span class="rx-medicine-no">${index + 1}</span>
                    <strong>
                        ${escapeHtml(medicine.medicine_name || "Thuốc")}
                    </strong>
                </div>

                <dl class="rx-medicine-grid">
                    ${fields.map(([label, value]) => `
                        <div>
                            <dt>${label}</dt>
                            <dd>${rxValue(value, "Chưa ghi")}</dd>
                        </div>
                    `).join("")}
                </dl>

                <p class="rx-medicine-note">
                    <b>Hướng dẫn sử dụng:</b>
                    ${rxValue(medicine.instructions, "Không có hướng dẫn thêm")}
                </p>
            </div>
        `;
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

        list.innerHTML = prescriptions.map((rx) => {
            const visitDate = C.toDateInput(rx.schedule_date);
            const rxDate = C.toDateInput(rx.prescription_date);

            const [year, month, day] = (visitDate || rxDate)
                ? (visitDate || rxDate).split("-")
                : ["", "", ""];

            const rawDoctor = rx.doctor_name || "Bác sĩ";

            const doctor = /^bs\.?\s/i.test(rawDoctor)
                ? rawDoctor
                : `BS. ${rawDoctor}`;

            const items = Array.isArray(rx.items) ? rx.items : [];

            const code =
                "DT-" + String(rx.prescription_id).padStart(6, "0");

            const meta = [
                rx.specialty_name,
                visitDate ? `Ngày khám: ${C.formatDate(visitDate)}` : "",
                rx.appointment_time
                    ? `Giờ khám: ${C.formatTime(rx.appointment_time)}`
                    : "",
                rxDate ? `Kê đơn: ${C.formatDate(rxDate)}` : ""
            ].filter(Boolean).join(" • ");

            const clinical = [
                ["Chẩn đoán", rx.diagnosis],
                ["Triệu chứng", rx.symptoms],
                ["Ghi chú khám", rx.examination_notes],
                ["Hướng điều trị", rx.treatment_plan]
            ];

            return `
                <article class="rx-card">
                    <header class="rx-head">
                        <div class="item-date">
                            <strong>${escapeHtml(day || "--")}</strong>
                            <span>
                                Th${escapeHtml(month || "--")}/${escapeHtml(year || "")}
                            </span>
                        </div>

                        <div class="rx-head-main">
                            <strong>
                                Đơn thuốc
                                <span class="rx-code">${escapeHtml(code)}</span>
                            </strong>
                            <span>${escapeHtml(doctor)}</span>
                            <span>${escapeHtml(meta)}</span>
                        </div>

                        <span class="tag tag--ok">
                            ${items.length} loại thuốc
                        </span>
                    </header>

                    <section class="rx-section">
                        <h4>
                            <i class="fa-solid fa-notes-medical"></i>
                            Thông tin khám bệnh
                        </h4>
                        <dl class="rx-clinical">
                            ${clinical.map(([label, value]) => `
                                <div>
                                    <dt>${label}</dt>
                                    <dd>${rxValue(value, "Không ghi nhận")}</dd>
                                </div>
                            `).join("")}
                        </dl>
                    </section>

                    <section class="rx-section">
                        <h4>
                            <i class="fa-solid fa-pills"></i>
                            Danh sách thuốc
                        </h4>
                        ${
                            items.length
                                ? items.map(renderMedicine).join("")
                                : `<p class="rx-none">Đơn thuốc chưa có thuốc chi tiết.</p>`
                        }
                    </section>

                    <section class="rx-section">
                        <h4>
                            <i class="fa-solid fa-comment-medical"></i>
                            Lời dặn của bác sĩ
                        </h4>
                        <p class="rx-advice">
                            ${rxValue(rx.prescription_note, "Không có lời dặn thêm")}
                        </p>
                    </section>
                </article>
            `;
        }).join("");
    }
})();