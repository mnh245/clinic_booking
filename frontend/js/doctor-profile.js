/*
=====================================================
CLINIC BOOKING - HỒ SƠ BÁC SĨ
1. Thông tin cá nhân  2. Thông tin chuyên môn
3. Lịch làm việc sắp tới  4. Đổi mật khẩu
=====================================================
*/
(() => {
  "use strict";
  const C = window.ProfileCommon;
  const { $ } = C;
  const PERSONAL_FIELDS = [
    "full_name",
    "phone",
    "date_of_birth",
    "gender",
    "address"
  ];
  const PROFESSIONAL_FIELDS = [
    "qualification",
    "introduction",
    "avatar"
  ];
  const SHIFT_LABEL = {
    MORNING: "Ca sáng",
    AFTERNOON: "Ca chiều",
    EVENING: "Ca tối",
    NIGHT: "Ca đêm"
  };
  let doctorId = null;
  document.addEventListener("DOMContentLoaded", init);
  async function init() {
    const user = await C.requireRole("doctor");
    if (!user) return;
    C.setupHeader();
    C.setupSectionNav();
    C.setupPasswordForm($("passwordForm"));
    const personalForm = $("personalForm");
    const professionalForm = $("professionalForm");
    const [{ profile, fromServer }, doctorResult] =
      await Promise.all([
        C.loadProfile(),
        C.loadDoctorProfile()
          .then((doctor) => ({ doctor, error: null }))
          .catch((error) => ({ doctor: null, error }))
      ]);
    const doctor = doctorResult.doctor;
    const merged = { ...profile, ...(doctor || {}) };
    doctorId = doctor?.id ?? profile.doctor_id ?? null;
    C.fillForm(personalForm, {
      ...merged,
      full_name: profile.full_name || merged.full_name
    });
    C.fillForm(professionalForm, merged);
    renderIdentity(merged);
    updateIntroCount();
    renderAvatarPreview($("avatar")?.value.trim() || "");
    if (!fromServer) {
      C.showBanner(
        "Chưa tải được hồ sơ tài khoản từ máy chủ. Hãy kiểm tra API trước khi lưu thay đổi.",
        "warn"
      );
    }
    if (doctorResult.error) {
      C.showBanner(
        doctorResult.error.message ||
          "Không tìm thấy hồ sơ bác sĩ liên kết với tài khoản.",
        "warn"
      );
    }
    const personalDirty = C.trackDirty(personalForm);
    const professionalDirty = C.trackDirty(professionalForm);
    C.guardUnsaved([personalDirty, professionalDirty]);
    $("introduction")?.addEventListener("input", updateIntroCount);
    $("avatar")?.addEventListener("input", () => {
      renderAvatarPreview($("avatar").value.trim());
    });
    personalForm?.addEventListener("submit", (event) => {
      savePersonal(event, personalForm, personalDirty);
    });
    professionalForm?.addEventListener("submit", (event) => {
      saveProfessional(event, professionalForm, professionalDirty);
    });
    await loadSchedules();
  }
  function initials(name) {
    return String(name || "")
      .trim()
      .split(/\s+/)
      .slice(-2)
      .map((word) => word[0])
      .join("")
      .toUpperCase();
  }
  function setAvatar(box, url, name) {
    if (!box) return;
    box.replaceChildren();
    if (url) {
      const img = document.createElement("img");
      img.alt = name
        ? `Ảnh BS. ${name}`
        : "Ảnh đại diện";
      img.src = url;
      img.referrerPolicy = "no-referrer";
      img.addEventListener(
        "error",
        () => {
          box.textContent = initials(name) || "BS";
        },
        { once: true }
      );
      box.appendChild(img);
    } else {
      box.textContent = initials(name) || "BS";
    }
  }
  function renderIdentity(data) {
    const name =
      data.full_name ||
      data.fullName ||
      data.email ||
      "Bác sĩ";
    const displayName = $("displayName");
    if (displayName) {
      displayName.textContent = `BS. ${name}`;
    }
    setAvatar($("avatarBox"), data.avatar, name);
    setAvatar($("avatarPreview"), data.avatar, name);
  }
  function renderAvatarPreview(url) {
    const valid = !C.RULES.url(url);
    setAvatar(
      $("avatarPreview"),
      valid ? url : "",
      $("full_name")?.value || "Bác sĩ"
    );
  }
  function updateIntroCount() {
    const input = $("introduction");
    const count = $("introCount");
    if (input && count) {
      count.textContent = `${input.value.length}/1000`;
    }
  }
  async function savePersonal(event, form, tracker) {
    event.preventDefault();
    C.clearErrors(form);
    const ok = C.validateForm(form, {
      full_name: [
        C.RULES.required,
        C.RULES.maxLength(100)
      ],
      phone: [C.RULES.phone],
      date_of_birth: [C.RULES.birthDate]
    });
    if (!ok) return;
    try {
      const data = C.readForm(form, PERSONAL_FIELDS);
      const result = await C.withBusy(
        form.querySelector('button[type="submit"]'),
        () => C.saveProfile(data)
      );
      const returned = C.extractObject(result);
      tracker.reset();
      renderIdentity({
        ...(C.getCurrentUser() || {}),
        ...data,
        ...(returned || {})
      });
      C.setupHeader();
      C.toast("Đã lưu thông tin cá nhân.");
    } catch (error) {
      C.toast(
        error.message || "Không thể lưu thay đổi.",
        "error"
      );
    }
  }
  async function saveProfessional(event, form, tracker) {
    event.preventDefault();
    C.clearErrors(form);
    const ok = C.validateForm(form, {
      qualification: [C.RULES.maxLength(150)],
      avatar: [C.RULES.url],
      introduction: [C.RULES.maxLength(1000)]
    });
    if (!ok) return;
    if (doctorId == null) {
      C.toast(
        "Không xác định được hồ sơ bác sĩ của tài khoản này.",
        "error"
      );
      return;
    }
    try {
      const data = C.readForm(form, PROFESSIONAL_FIELDS);
      const saved = await C.withBusy(
        form.querySelector('button[type="submit"]'),
        () => C.saveDoctorProfile(data)
      );
      tracker.reset();
      const merged = {
        ...(C.getCurrentUser() || {}),
        ...data,
        ...(saved || {})
      };
      setAvatar(
        $("avatarBox"),
        merged.avatar,
        merged.full_name || $("full_name")?.value || "Bác sĩ"
      );
      setAvatar(
        $("avatarPreview"),
        merged.avatar,
        merged.full_name || $("full_name")?.value || "Bác sĩ"
      );
      C.toast("Đã lưu thông tin chuyên môn.");
    } catch (error) {
      C.toast(
        error.message || "Không thể lưu thông tin chuyên môn.",
        "error"
      );
    }
  }
  /* =====================================================
     LỊCH LÀM VIỆC
     API /api/schedules/my lấy lịch của bác sĩ đăng nhập.
     ===================================================== */
  async function loadSchedules() {
    const list = $("scheduleList");
    if (!list) return;
    list.innerHTML = `
      <div class="empty">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <p>Đang tải lịch làm việc...</p>
      </div>`;
    try {
      const response = await C.requestFirst(
        C.ENDPOINTS.doctorSchedules(doctorId)
      );
      const rows = C.extractArray(response)
        .filter((schedule) =>
          schedule.doctor_id == null ||
          String(schedule.doctor_id) === String(doctorId)
        )
        .filter((schedule) =>
          C.toDateInput(schedule.schedule_date) >= C.todayString()
        )
        .sort((a, b) =>
          C.toDateInput(a.schedule_date).localeCompare(
            C.toDateInput(b.schedule_date)
          ) ||
          String(a.start_time || "").localeCompare(
            String(b.start_time || "")
          )
        );
      if (!rows.length) {
        list.innerHTML = `
          <div class="empty">
            <i class="fa-regular fa-calendar"></i>
            <p>Bạn chưa có ca làm việc sắp tới.</p>
          </div>`;
        return;
      }
      list.innerHTML = rows.map(renderSchedule).join("");
    } catch (error) {
      list.innerHTML = `
        <div class="empty">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <p>${C.escapeHtml(
            error.message || "Không thể tải lịch làm việc."
          )}</p>
          <button
            type="button"
            class="btn btn-outline"
            id="retrySchedules"
          >
            Thử lại
          </button>
        </div>`;
      $("retrySchedules")?.addEventListener(
        "click",
        loadSchedules
      );
    }
  }
  function renderSchedule(item) {
    const date = C.toDateInput(item.schedule_date);
    const [year, month, day] = date
      ? date.split("-")
      : ["", "", ""];
    const approval = String(
      item.approval_status || ""
    ).toUpperCase();
    const status = approval === "APPROVED"
      ? { label: "Đã duyệt", cls: "tag--ok" }
      : approval === "REJECTED"
        ? { label: "Từ chối", cls: "tag--bad" }
        : { label: "Chờ duyệt", cls: "tag--wait" };
    const shift =
      SHIFT_LABEL[
        String(item.shift_type || "").toUpperCase()
      ] || "Ca làm việc";
    const time = [
      C.formatTime(item.display_start || item.start_time),
      C.formatTime(item.display_end || item.end_time)
    ].filter(Boolean).join(" - ");
    const closed =
      String(item.status || "").toUpperCase() === "CLOSED";
    return `
      <div class="item">
        <div class="item-date">
          <strong>${C.escapeHtml(day || "--")}</strong>
          <span>Th${C.escapeHtml(month || "--")}/${C.escapeHtml(year || "")}</span>
        </div>
        <div class="item-main">
          <strong>${C.escapeHtml(shift)}</strong>
          <span>${C.escapeHtml(time || "Chưa có giờ cụ thể")}</span>
          ${closed ? "<span>Lịch hiện đang đóng.</span>" : ""}
        </div>
        <span class="tag ${status.cls}">${status.label}</span>
      </div>`;
  }
})();