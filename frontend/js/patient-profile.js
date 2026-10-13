/*
=====================================================
CLINIC BOOKING - HỒ SƠ BỆNH NHÂN
1. Thông tin cá nhân  2. Thông tin sức khỏe
3. Lịch hẹn / đơn thuốc  4. Đổi mật khẩu
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
  document.addEventListener("DOMContentLoaded", init);
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
    await loadAppointments();
  }
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
  async function submitForm(
    event,
    form,
    fields,
    tracker,
    rules
  ) {
    event.preventDefault();
    C.clearErrors(form);
    if (!C.validateForm(form, rules)) return;
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
      </div>`;
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
        </div>`;
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
    return (
      appointmentDate(item) < today ||
      terminal.includes(status)
    );
  }
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
          <p>${
            appointmentFilter === "upcoming"
              ? "Bạn chưa có lịch hẹn sắp tới."
              : "Chưa có lịch hẹn nào đã qua."
          }</p>
          ${
            appointmentFilter === "upcoming"
              ? '<a href="home.html#doctors" class="btn btn-primary">Đặt lịch khám</a>'
              : ""
          }
        </div>`;
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
      return `
        <div class="item">
          <div class="item-date">
            <strong>${escapeHtml(day || "--")}</strong>
            <span>Th${escapeHtml(month || "--")}/${escapeHtml(year || "")}</span>
          </div>
          <div class="item-main">
            <strong>${escapeHtml(doctor)}</strong>
            <span>${escapeHtml(detail || "Chưa có giờ khám")}</span>
            ${
              item.reason
                ? `<span>Lý do: ${escapeHtml(item.reason)}</span>`
                : ""
            }
            ${
              arrival
                ? `<span>${escapeHtml(arrival)}${
                    late ? ` • ${escapeHtml(late)}` : ""
                  }</span>`
                : ""
            }
            ${
              item.note
                ? `<span>Ghi chú: ${escapeHtml(item.note)}</span>`
                : ""
            }
          </div>
          <span class="tag ${status.cls}">${status.label}</span>
        </div>`;
    }).join("");
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
      </div>`;
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
        </div>`;
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
        </div>`;
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
      if (item.item_id != null || item.medicine_name) {
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
        const rawDoctor = prescription.doctor_name || "Bác sĩ";
        const doctor = /^bs\.?\s/i.test(rawDoctor)
          ? rawDoctor
          : `BS. ${rawDoctor}`;
        const medicines = prescription.medicines.length
          ? `
            <div class="prescription-medicines">
              ${prescription.medicines.map((medicine) => `
                <div class="prescription-medicine">
                  <strong>${escapeHtml(
                    medicine.medicine_name || "Thuốc"
                  )}</strong>
                  <span>
                    ${escapeHtml(
                      medicine.dosage || "Chưa cập nhật liều dùng"
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
            </div>`
          : '<p class="panel-sub">Đơn thuốc chưa có thuốc chi tiết.</p>';
        return `
          <article class="item prescription-card">
            <div class="item-date">
              <strong>${escapeHtml(day || "--")}</strong>
              <span>Th${escapeHtml(month || "--")}/${escapeHtml(year || "")}</span>
            </div>
            <div class="item-main">
              <strong>${escapeHtml(doctor)}</strong>
              <span>
                ${escapeHtml(prescription.specialty_name || "")}
                ${
                  prescription.appointment_time
                    ? ` • Giờ khám ${escapeHtml(
                        C.formatTime(prescription.appointment_time)
                      )}`
                    : ""
                }
              </span>
              ${
                prescription.diagnosis
                  ? `<span><b>Chẩn đoán:</b> ${escapeHtml(prescription.diagnosis)}</span>`
                  : ""
              }
              ${
                prescription.treatment_plan
                  ? `<span><b>Hướng điều trị:</b> ${escapeHtml(prescription.treatment_plan)}</span>`
                  : ""
              }
              ${
                prescription.prescription_note
                  ? `<span><b>Ghi chú đơn thuốc:</b> ${escapeHtml(prescription.prescription_note)}</span>`
                  : ""
              }
              ${medicines}
            </div>
          </article>`;
      })
      .join("");
  }
})();