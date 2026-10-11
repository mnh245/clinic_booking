(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  /* =====================================================
     HẰNG SỐ
     ===================================================== */
  const SHIFT_CONFIG = {
    NIGHT:     { label: "Đêm",   time: "00:00 – 06:00", short: "Đ" },
    MORNING:   { label: "Sáng",  time: "06:00 – 12:00", short: "S" },
    AFTERNOON: { label: "Chiều", time: "12:00 – 18:00", short: "C" },
    EVENING:   { label: "Tối",   time: "18:00 – 00:00", short: "T" }
  };
  const SHIFT_ORDER = ["NIGHT", "MORNING", "AFTERNOON", "EVENING"];
  const SHIFT_HOURS = 6;
  const WEEKDAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
  // Độ ưu tiên khi một ô (bác sĩ + ngày + ca) có nhiều lịch trùng nhau
  const APPROVAL_RANK = { APPROVED: 3, PENDING: 2, REJECTED: 1 };
  /* =====================================================
     TRẠNG THÁI
     ===================================================== */
  let doctors = [];
  let schedules = [];
  let rejectScheduleId = null;
  let rosterWeekStart = getWeekStart(new Date());
  document.addEventListener("DOMContentLoaded", init);
  /* =====================================================
     KHỞI TẠO
     ===================================================== */
  async function init() {
    bindEvents();
    setMinDate();
    try {
      const session = await apiFetch("/api/session");
      // Chưa đăng nhập
      if (!session?.success || !session?.user) {
        window.location.href = "login.html";
        return;
      }
      const user = session.user;
      // Không phải ADMIN
      if (String(user.role || "").toUpperCase() !== "ADMIN") {
        window.location.href = "home.html";
        return;
      }
      const name = user.full_name || user.fullName || "Quản trị viên";
      $("#adminName").textContent = name;
      $("#adminGreeting").textContent = name;
      await loadDashboardData();
    } catch (error) {
      console.error("Không thể khởi tạo admin dashboard:", error);
      showMessage(
        error.message || "Không thể kiểm tra phiên đăng nhập.",
        "error"
      );
      setTimeout(() => {
        window.location.href = "login.html";
      }, 1000);
    }
  }
  /* =====================================================
     SỰ KIỆN
     ===================================================== */
  function bindEvents() {
    const on = (selector, eventName, handler) =>
      $(selector).addEventListener(eventName, handler);
    on("#refreshButton", "click", loadDashboardData);
    on("#createScheduleForm", "submit", handleCreateSchedule);
    on("#createScheduleForm", "reset", () => setTimeout(setMinDate, 0));
    on("#approvalFilter", "change", renderSchedulesTable);
    on("#statusFilter", "change", renderSchedulesTable);
    on("#pendingTableBody", "click", handleTableAction);
    on("#schedulesTableBody", "click", handleTableAction);
    // Bảng lịch làm việc theo tuần
    on("#rosterPrev", "click", () => shiftRosterWeek(-7));
    on("#rosterNext", "click", () => shiftRosterWeek(7));
    on("#rosterToday", "click", () => {
      rosterWeekStart = getWeekStart(new Date());
      renderRoster();
    });
    on("#rosterSpecialtyFilter", "change", handleRosterSpecialtyChange);
    on("#rosterDoctorFilter", "change", renderRoster);
    on("#rosterBody", "click", handleRosterClick);
    // Modal từ chối
    on("#closeRejectModal", "click", closeRejectModal);
    on("#cancelRejectButton", "click", closeRejectModal);
    on("#confirmRejectButton", "click", confirmReject);
    on("#rejectModal", "click", (event) => {
      if (event.target.id === "rejectModal") {
        closeRejectModal();
      }
    });
    on("#logoutButton", "click", handleLogout);
  }
  function setMinDate() {
    const input = $("#scheduleDate");
    if (!input.value) {
      const now = new Date();
      input.min = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 10);
    }
  }
  /* =====================================================
     TẢI DỮ LIỆU
     ===================================================== */
  async function loadDashboardData() {
    setLoadingButton(
      "#refreshButton",
      true,
      '<i class="fa-solid fa-spinner fa-spin"></i> Đang tải...'
    );
    clearMessage();
    try {
      const [doctorResult, scheduleResult] = await Promise.all([
        apiFetch("/api/doctors"),
        apiFetch("/api/schedules/admin")
      ]);
      doctors = extractArray(doctorResult);
      schedules = extractArray(scheduleResult);
      populateDoctorSelects();
      renderStats();
      renderPendingTable();
      renderRoster();
      renderSchedulesTable();
    } catch (error) {
      console.error("Lỗi tải admin dashboard:", error);
      showMessage(
        error.message || "Không thể tải dữ liệu quản trị.",
        "error"
      );
    } finally {
      setLoadingButton(
        "#refreshButton",
        false,
        '<i class="fa-solid fa-rotate"></i> Làm mới dữ liệu'
      );
    }
  }
  function extractArray(result) {
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.data)) return result.data;
    if (Array.isArray(result?.schedules)) return result.schedules;
    if (Array.isArray(result?.doctors)) return result.doctors;
    return [];
  }
  /* =====================================================
     TIỆN ÍCH DỮ LIỆU LỊCH
     ===================================================== */
  const normalize = (value, fallback) => String(value || fallback).toUpperCase();
  const getApproval = (schedule) => normalize(schedule.approval_status, "PENDING");
  const getStatus = (schedule) => normalize(schedule.status, "CLOSED");
  const getDoctorName = (schedule, fallback = "Bác sĩ") =>
    schedule.doctor_name || schedule.full_name || fallback;
  function getShift(schedule) {
    return SHIFT_CONFIG[schedule.shift_type] || fallbackShift(schedule);
  }
  /** Xác định ca (NIGHT/MORNING/...) kể cả với dữ liệu cũ thiếu shift_type. */
  function resolveShiftType(schedule) {
    const type = String(schedule.shift_type || "").toUpperCase();
    if (SHIFT_CONFIG[type]) {
      return type;
    }
    const startHour = parseInt(String(schedule.start_time || "").slice(0, 2), 10);
    if (Number.isNaN(startHour)) return null;
    if (startHour < 6) return "NIGHT";
    if (startHour < 12) return "MORNING";
    if (startHour < 18) return "AFTERNOON";
    return "EVENING";
  }
  function sortSchedules(a, b) {
    const dateA = String(a.schedule_date || "");
    const dateB = String(b.schedule_date || "");
    if (dateA !== dateB) {
      return dateA.localeCompare(dateB);
    }
    return Number(a.id || 0) - Number(b.id || 0);
  }
  /* =====================================================
     SELECT BÁC SĨ
     ===================================================== */
  function populateDoctorSelects() {
    fillDoctorSelect($("#doctorSelect"), "-- Chọn bác sĩ --", (doctor) =>
      `BS. ${doctor.full_name || "Bác sĩ"} — ` +
      (doctor.specialty_name || "Chưa cập nhật chuyên khoa")
    );
    populateRosterSpecialtyFilter();
    populateRosterDoctorFilter();
  }
  /** Danh sách chuyên khoa (không trùng) cho bộ lọc của bảng lịch làm việc. */
  function populateRosterSpecialtyFilter() {
    const select = $("#rosterSpecialtyFilter");
    const current = select.value;
    const names = Array.from(
      new Set(doctors.map((doctor) => doctor.specialty_name).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, "vi"));
    select.innerHTML = '<option value="ALL">Tất cả chuyên khoa</option>';
    names.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
    if (current && names.includes(current)) {
      select.value = current;
    }
  }
  /** Bộ lọc bác sĩ chỉ liệt kê bác sĩ thuộc chuyên khoa đang chọn. */
  function populateRosterDoctorFilter() {
    const specialty = $("#rosterSpecialtyFilter").value;
    fillDoctorSelect(
      $("#rosterDoctorFilter"),
      "Tất cả bác sĩ",
      (doctor) => `BS. ${doctor.full_name || "Bác sĩ"}`,
      "ALL",
      (doctor) => specialty === "ALL" || doctor.specialty_name === specialty
    );
  }
  function handleRosterSpecialtyChange() {
    $("#rosterDoctorFilter").value = "ALL";
    populateRosterDoctorFilter();
    renderRoster();
  }
  function fillDoctorSelect(
    select,
    placeholder,
    labelOf,
    placeholderValue = "",
    predicate = () => true
  ) {
    const current = select.value;
    const visibleDoctors = doctors.filter(predicate);
    select.innerHTML = `<option value="${placeholderValue}">${placeholder}</option>`;
    visibleDoctors.forEach((doctor) => {
      const option = document.createElement("option");
      option.value = doctor.id;
      option.textContent = labelOf(doctor);
      select.appendChild(option);
    });
    if (current && visibleDoctors.some((doctor) => Number(doctor.id) === Number(current))) {
      select.value = current;
    }
  }
  /* =====================================================
     THỐNG KÊ
     ===================================================== */
  function renderStats() {
    const countBy = (approval) =>
      schedules.filter((item) => getApproval(item) === approval).length;
    const pending = countBy("PENDING");
    $("#statDoctors").textContent = doctors.length;
    $("#statPending").textContent = pending;
    $("#statApproved").textContent = countBy("APPROVED");
    $("#statRejected").textContent = countBy("REJECTED");
    $("#statTotalSchedules").textContent = schedules.length;
    $("#pendingCountBadge").textContent = pending;
  }
  /* =====================================================
     BẢNG CHỜ DUYỆT
     ===================================================== */
  function renderPendingTable() {
    const body = $("#pendingTableBody");
    const pending = schedules
      .filter((item) => getApproval(item) === "PENDING")
      .sort(sortSchedules);
    if (!pending.length) {
      body.innerHTML = `
        <tr>
          <td colspan="6" class="empty-state">
            <i class="fa-regular fa-circle-check"></i>
            Không có lịch nào đang chờ duyệt.
          </td>
        </tr>
      `;
      return;
    }
    body.innerHTML = pending.map(renderPendingRow).join("");
  }
  function renderPendingRow(schedule) {
    const shift = getShift(schedule);
    return `
      <tr>
        <td>
          <div class="doctor-cell">
            <strong>BS. ${escapeHtml(getDoctorName(schedule))}</strong>
            <span>${escapeHtml(schedule.specialty_name || "Chưa cập nhật chuyên khoa")}</span>
          </div>
        </td>
        <td>${formatDate(schedule.schedule_date)}</td>
        <td>${escapeHtml(shift.label)}</td>
        <td>${escapeHtml(formatScheduleTime(schedule, shift))}</td>
        <td>${approvalPill("PENDING")}</td>
        <td>
          <div class="action-group">
            ${actionButton("approve", "approve", schedule.id, "check", "Duyệt")}
            ${actionButton("reject", "reject", schedule.id, "xmark", "Từ chối")}
          </div>
        </td>
      </tr>
    `;
  }
  /* =====================================================
     BẢNG TẤT CẢ LỊCH
     ===================================================== */
  function renderSchedulesTable() {
    const body = $("#schedulesTableBody");
    const approvalFilter = $("#approvalFilter").value;
    const statusFilter = $("#statusFilter").value;
    const filtered = schedules
      .filter((item) => approvalFilter === "ALL" || getApproval(item) === approvalFilter)
      .filter((item) => statusFilter === "ALL" || getStatus(item) === statusFilter)
      .sort(sortSchedules);
    if (!filtered.length) {
      body.innerHTML = `
        <tr>
          <td colspan="8" class="empty-state">
            <i class="fa-regular fa-calendar-xmark"></i>
            Không có lịch phù hợp với bộ lọc.
          </td>
        </tr>
      `;
      return;
    }
    body.innerHTML = filtered.map(renderScheduleRow).join("");
  }
  function renderScheduleRow(schedule) {
    const shift = getShift(schedule);
    const approval = getApproval(schedule);
    const status = getStatus(schedule);
    return `
      <tr>
        <td>
          <div class="doctor-cell">
            <strong>BS. ${escapeHtml(getDoctorName(schedule))}</strong>
            <span>${escapeHtml(schedule.doctor_email || "")}</span>
          </div>
        </td>
        <td>${escapeHtml(schedule.specialty_name || "Chưa cập nhật")}</td>
        <td>${formatDate(schedule.schedule_date)}</td>
        <td>${escapeHtml(shift.label)}</td>
        <td>${escapeHtml(formatScheduleTime(schedule, shift))}</td>
        <td>${approvalPill(approval)}</td>
        <td>${statusPill(status)}</td>
        <td>
          <div class="action-group">${buildScheduleActions(schedule, approval, status)}</div>
        </td>
      </tr>
    `;
  }
  function buildScheduleActions(schedule, approval, status) {
    // Chờ duyệt: chỉ có Duyệt / Từ chối
    if (approval === "PENDING") {
      return (
        actionButton("approve", "approve", schedule.id, "check", "Duyệt") +
        actionButton("reject", "reject", schedule.id, "xmark", "Từ chối")
      );
    }
    let html = "";
    // Chỉ lịch đã duyệt mới được mở / đóng
    if (approval === "APPROVED") {
      const isOpen = status === "AVAILABLE";
      html += actionButton(
        "toggle",
        "toggle",
        schedule.id,
        isOpen ? "lock" : "lock-open",
        isOpen ? "Đóng" : "Mở",
        ` data-status="${isOpen ? "CLOSED" : "AVAILABLE"}"`
      );
    }
    html += actionButton("delete", "delete", schedule.id, "trash", "Xóa");
    return html;
  }
  function actionButton(className, action, id, icon, label, extraAttributes = "") {
    return `
      <button
        type="button"
        class="table-action ${className}"
        data-action="${action}"
        data-id="${id}"${extraAttributes}
      >
        <i class="fa-solid fa-${icon}"></i>
        ${label}
      </button>
    `;
  }
  /* =====================================================
     BẢNG LỊCH LÀM VIỆC THEO TUẦN (ROSTER)
     Hàng = bác sĩ, cột = 7 ngày, mỗi ngày có 4 ô nhỏ = 4 ca
     ===================================================== */
  function renderRoster() {
    const head = $("#rosterHead");
    const body = $("#rosterBody");
    const weekDates = getWeekDates(rosterWeekStart);
    const dateKeys = weekDates.map(toLocalDateString);
    const todayKey = toLocalDateString(new Date());
    $("#rosterWeekLabel").textContent =
      `${formatShortDate(weekDates[0])} – ${formatShortDate(weekDates[6])}/${weekDates[6].getFullYear()}`;
    head.innerHTML = `
      <tr>
        <th class="roster-doctor-col">Bác sĩ</th>
        ${weekDates
          .map((date, index) => `
            <th class="${dateKeys[index] === todayKey ? "is-today" : ""}">
              <span>${WEEKDAY_LABELS[index]}</span>
              <small>${formatShortDate(date)}</small>
            </th>
          `)
          .join("")}
        <th class="roster-total-col">Tổng tuần</th>
      </tr>
    `;
    const rows = buildRosterRows(dateKeys);
    // Tổng hợp
    let totalApproved = 0;
    let totalPending = 0;
    let idleDoctors = 0;
    rows.forEach((row) => {
      totalApproved += row.approved;
      totalPending += row.pending;
      if (!row.approved && !row.pending) {
        idleDoctors++;
      }
    });
    $("#rosterSummary").textContent =
      `${totalApproved} ca đã duyệt · ${totalPending} ca chờ duyệt · ` +
      `${idleDoctors} bác sĩ chưa có ca nào trong tuần`;
    if (!rows.length) {
      body.innerHTML = `
        <tr>
          <td colspan="9" class="empty-state">
            <i class="fa-solid fa-user-doctor"></i>
            Chưa có bác sĩ để hiển thị.
          </td>
        </tr>
      `;
      return;
    }
    body.innerHTML = rows
      .map((row) => `
        <tr>
          <td class="roster-doctor-col">
            <div class="doctor-cell">
              <strong>BS. ${escapeHtml(row.name)}</strong>
              <span>${escapeHtml(row.specialty || "Chưa cập nhật chuyên khoa")}</span>
            </div>
          </td>
          ${dateKeys
            .map((dateKey) => `
              <td class="roster-day ${dateKey === todayKey ? "is-today" : ""}">
                <div class="roster-shifts">
                  ${SHIFT_ORDER
                    .map((shiftType) =>
                      renderRosterSegment(
                        row,
                        dateKey,
                        shiftType,
                        row.cells.get(`${dateKey}|${shiftType}`),
                        dateKey < todayKey
                      )
                    )
                    .join("")}
                </div>
              </td>
            `)
            .join("")}
          <td class="roster-total">
            <strong>${row.approved * SHIFT_HOURS} giờ</strong>
            <small>
              ${row.approved} ca${row.pending ? ` · ${row.pending} chờ duyệt` : ""}
            </small>
          </td>
        </tr>
      `)
      .join("");
  }
  /** Gom lịch theo bác sĩ cho tuần đang xem (đã áp dụng bộ lọc bác sĩ). */
  function buildRosterRows(dateKeys) {
    const rows = new Map();
    const keyByName = new Map();
    const ensureRow = (key, info) => {
      if (!rows.has(key)) {
        rows.set(key, {
          key,
          doctorId: info.doctorId,
          name: info.name,
          specialty: info.specialty,
          cells: new Map(),
          approved: 0,
          pending: 0
        });
      }
      return rows.get(key);
    };
    // Mọi bác sĩ đều có một hàng, kể cả khi chưa có ca nào
    doctors.forEach((doctor) => {
      const key = `id:${Number(doctor.id)}`;
      keyByName.set(doctor.full_name, key);
      ensureRow(key, {
        doctorId: Number(doctor.id),
        name: doctor.full_name || "Bác sĩ",
        specialty: doctor.specialty_name
      });
    });
    schedules.forEach((schedule) => {
      const date = toDateInputValue(schedule.schedule_date);
      const shiftType = resolveShiftType(schedule);
      if (!dateKeys.includes(date) || !shiftType) {
        return;
      }
      const name = getDoctorName(schedule);
      const hasId = schedule.doctor_id !== undefined && schedule.doctor_id !== null;
      const key = hasId
        ? `id:${Number(schedule.doctor_id)}`
        : keyByName.get(name) || `name:${name}`;
      const row = ensureRow(key, {
        doctorId: hasId ? Number(schedule.doctor_id) : null,
        name,
        specialty: schedule.specialty_name
      });
      const cellKey = `${date}|${shiftType}`;
      const existing = row.cells.get(cellKey);
      if (
        !existing ||
        (APPROVAL_RANK[getApproval(schedule)] || 0) >
        (APPROVAL_RANK[getApproval(existing)] || 0)
      ) {
        row.cells.set(cellKey, schedule);
      }
    });
    const doctorFilter = $("#rosterDoctorFilter").value;
    const specialtyFilter = $("#rosterSpecialtyFilter").value;
    const list = Array.from(rows.values()).filter(
      (row) =>
        (doctorFilter === "ALL" || String(row.doctorId) === doctorFilter) &&
        (specialtyFilter === "ALL" || row.specialty === specialtyFilter)
    );
    list.forEach((row) => {
      row.cells.forEach((schedule) => {
        const approval = getApproval(schedule);
        if (approval === "APPROVED") row.approved++;
        if (approval === "PENDING") row.pending++;
      });
    });
    return list.sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }
  function renderRosterSegment(row, dateKey, shiftType, schedule, isPast) {
    const shift = SHIFT_CONFIG[shiftType];
    const description =
      `BS. ${row.name} — ${formatDate(dateKey)} — ${shift.label} ${shift.time}`;
    // Chưa có lịch
    if (!schedule) {
      const canCreate = row.doctorId !== null && !isPast;
      if (!canCreate) {
        return `
          <span class="roster-seg is-empty" title="${escapeHtml(description)} — Chưa có lịch">
            ${shift.short}
          </span>
        `;
      }
      return `
        <button
          type="button"
          class="roster-seg is-empty is-clickable"
          data-roster-create
          data-doctor-id="${row.doctorId}"
          data-date="${dateKey}"
          data-shift="${shiftType}"
          title="${escapeHtml(description)} — Chưa có lịch, bấm để tạo"
        >${shift.short}</button>
      `;
    }
    const approval = getApproval(schedule);
    const isOpen = getStatus(schedule) === "AVAILABLE";
    let stateClass = "is-pending";
    let stateLabel = "Chờ duyệt";
    if (approval === "APPROVED") {
      stateClass = isOpen ? "is-open" : "is-closed";
      stateLabel = isOpen ? "Đã duyệt · Đang mở" : "Đã duyệt · Đã đóng";
    } else if (approval === "REJECTED") {
      stateClass = "is-rejected";
      stateLabel = "Từ chối";
    }
    return `
      <span class="roster-seg ${stateClass}" title="${escapeHtml(`${description} — ${stateLabel}`)}">
        ${shift.short}
      </span>
    `;
  }
  /** Bấm vào ô trống: điền sẵn form tạo lịch. */
  function handleRosterClick(event) {
    const button = event.target.closest("[data-roster-create]");
    if (!button) {
      return;
    }
    $("#doctorSelect").value = button.dataset.doctorId;
    $("#scheduleDate").value = button.dataset.date;
    const radio = document.querySelector(
      `input[name='shift_type'][value='${button.dataset.shift}']`
    );
    if (radio) {
      radio.checked = true;
    }
    $("#createSection").scrollIntoView({ behavior: "smooth", block: "start" });
    showMessage(
      "Đã điền sẵn bác sĩ, ngày và ca. Kiểm tra rồi bấm “Tạo lịch”.",
      "success"
    );
  }
  function shiftRosterWeek(days) {
    const next = new Date(rosterWeekStart);
    next.setDate(next.getDate() + days);
    rosterWeekStart = next;
    renderRoster();
  }
  /* =====================================================
     TẠO LỊCH
     ===================================================== */
  async function handleCreateSchedule(event) {
    event.preventDefault();
    const doctorId = Number($("#doctorSelect").value);
    const scheduleDate = $("#scheduleDate").value;
    const shiftType = $("input[name='shift_type']:checked")?.value;
    if (!doctorId || !scheduleDate || !shiftType) {
      showMessage("Vui lòng nhập đầy đủ bác sĩ, ngày và ca làm việc.", "error");
      return;
    }
    setLoadingButton(
      "#createButton",
      true,
      '<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo...'
    );
    try {
      const result = await apiFetch("/api/schedules", {
        method: "POST",
        body: JSON.stringify({
          doctor_id: doctorId,
          schedule_date: scheduleDate,
          shift_type: shiftType
        })
      });
      showMessage(result?.message || "Tạo lịch thành công.", "success");
      $("#createScheduleForm").reset();
      setMinDate();
      await loadDashboardData();
      $("#schedulesSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      console.error("Lỗi tạo lịch:", error);
      showMessage(error.message || "Không thể tạo lịch.", "error");
    } finally {
      setLoadingButton(
        "#createButton",
        false,
        '<i class="fa-solid fa-calendar-plus"></i> Tạo lịch'
      );
    }
  }
  /* =====================================================
     THAO TÁC TRÊN BẢNG
     ===================================================== */
  async function handleTableAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }
    const id = Number(button.dataset.id);
    const action = button.dataset.action;
    const schedule = schedules.find((item) => Number(item.id) === id);
    if (!schedule) {
      return;
    }
    try {
      if (action === "approve") {
        await approveSchedule(id);
      } else if (action === "reject") {
        openRejectModal(id);
      } else if (action === "toggle") {
        await toggleSchedule(id, button.dataset.status);
      } else if (action === "delete") {
        await deleteSchedule(id, schedule);
      }
    } catch (error) {
      console.error("Lỗi thao tác lịch:", error);
      showMessage(error.message || "Không thể thực hiện thao tác.", "error");
    }
  }
  async function approveSchedule(id) {
    const result = await apiFetch(`/api/schedules/${id}/approve`, {
      method: "PATCH",
      body: JSON.stringify({})
    });
    showMessage(result?.message || "Đã duyệt lịch.", "success");
    await loadDashboardData();
  }
  async function toggleSchedule(id, targetStatus) {
    const current = schedules.find((item) => Number(item.id) === Number(id));
    if (!current) {
      return;
    }
    const label = targetStatus === "AVAILABLE" ? "mở" : "đóng";
    if (!window.confirm(`Bạn có chắc muốn ${label} lịch này?`)) {
      return;
    }
    const result = await apiFetch(`/api/schedules/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        schedule_date: toDateInputValue(current.schedule_date),
        shift_type: current.shift_type,
        status: targetStatus
      })
    });
    showMessage(result?.message || `Đã ${label} lịch.`, "success");
    await loadDashboardData();
  }
  async function deleteSchedule(id, schedule) {
    const doctorName = getDoctorName(schedule, "bác sĩ");
    const confirmed = window.confirm(
      `Bạn có chắc muốn xóa lịch của ${doctorName} ngày ${formatDate(schedule.schedule_date)}?`
    );
    if (!confirmed) {
      return;
    }
    const result = await apiFetch(`/api/schedules/${id}`, { method: "DELETE" });
    showMessage(result?.message || "Đã xóa lịch.", "success");
    await loadDashboardData();
  }
  /* =====================================================
     MODAL TỪ CHỐI
     ===================================================== */
  function openRejectModal(id) {
    rejectScheduleId = id;
    $("#rejectionReason").value = "";
    $("#rejectModal").classList.add("is-open");
    $("#rejectModal").setAttribute("aria-hidden", "false");
    setTimeout(() => $("#rejectionReason").focus(), 50);
  }
  function closeRejectModal() {
    rejectScheduleId = null;
    $("#rejectionReason").value = "";
    $("#rejectModal").classList.remove("is-open");
    $("#rejectModal").setAttribute("aria-hidden", "true");
  }
  async function confirmReject() {
    if (!rejectScheduleId) {
      return;
    }
    const reason = $("#rejectionReason").value.trim();
    if (!reason) {
      showMessage("Vui lòng nhập lý do từ chối.", "error");
      $("#rejectionReason").focus();
      return;
    }
    setLoadingButton(
      "#confirmRejectButton",
      true,
      '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...'
    );
    try {
      const result = await apiFetch(`/api/schedules/${rejectScheduleId}/reject`, {
        method: "PATCH",
        body: JSON.stringify({ rejection_reason: reason })
      });
      closeRejectModal();
      showMessage(result?.message || "Đã từ chối lịch.", "success");
      await loadDashboardData();
    } catch (error) {
      console.error("Lỗi từ chối lịch:", error);
      showMessage(error.message || "Không thể từ chối lịch.", "error");
    } finally {
      setLoadingButton(
        "#confirmRejectButton",
        false,
        '<i class="fa-solid fa-ban"></i> Từ chối lịch'
      );
    }
  }
  /* =====================================================
     ĐĂNG XUẤT
     ===================================================== */
  async function handleLogout() {
    try {
      await apiFetch("/api/logout", { method: "POST" });
    } catch (error) {
      console.warn("Logout API lỗi:", error);
    } finally {
      localStorage.removeItem("user");
      localStorage.removeItem("role");
      localStorage.removeItem("vaiTro");
      window.location.href = "login.html";
    }
  }
  /* =====================================================
     THÔNG BÁO & NÚT
     ===================================================== */
  function showMessage(message, type = "success") {
    const box = $("#pageMessage");
    box.className = `alert ${type === "success" ? "alert-success" : "alert-error"} show`;
    box.textContent = message;
  }
  function clearMessage() {
    const box = $("#pageMessage");
    box.className = "alert";
    box.textContent = "";
  }
  function setLoadingButton(selector, loading, content) {
    const button = $(selector);
    if (!button) {
      return;
    }
    button.disabled = loading;
    button.innerHTML = content;
  }
  /* =====================================================
     NGÀY GIỜ
     ===================================================== */
  function formatDate(value) {
    if (!value) {
      return "--";
    }
    const raw = String(value).slice(0, 10);
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match
      ? `${match[3]}/${match[2]}/${match[1]}`
      : escapeHtml(String(value));
  }
  function toDateInputValue(value) {
    return String(value || "").slice(0, 10);
  }
  /** Date -> "YYYY-MM-DD" theo giờ địa phương (tránh lệch ngày do UTC). */
  function toLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  function formatShortDate(date) {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${day}/${month}`;
  }
  /** Thứ Hai của tuần chứa `date`. */
  function getWeekStart(date) {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return start;
  }
  function getWeekDates(start) {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }
  function formatScheduleTime(schedule, shift) {
    if (schedule.display_start && schedule.display_end) {
      return `${schedule.display_start} – ${schedule.display_end}`;
    }
    if (schedule.start_time && schedule.end_time) {
      return `${String(schedule.start_time).slice(0, 5)} – ${String(schedule.end_time).slice(0, 5)}`;
    }
    return shift.time;
  }
  /** Ca dự phòng cho dữ liệu cũ không có shift_type hợp lệ. */
  function fallbackShift(schedule) {
    const start = String(schedule?.start_time || "").slice(0, 5);
    const end = String(schedule?.end_time || "").slice(0, 5);
    return {
      label: schedule?.shift_type || "Ca làm việc",
      time: start && end ? `${start} – ${end}` : "--"
    };
  }
  /* =====================================================
     NHÃN TRẠNG THÁI
     ===================================================== */
  function approvalPill(status) {
    const map = {
      PENDING:  ["status-pending",  "fa-hourglass-half", "Chờ duyệt"],
      APPROVED: ["status-approved", "fa-circle-check",   "Đã duyệt"],
      REJECTED: ["status-rejected", "fa-circle-xmark",   "Từ chối"]
    };
    const [className, icon, label] = map[normalize(status, "PENDING")] || map.PENDING;
    return `
      <span class="status-pill ${className}">
        <i class="fa-solid ${icon}"></i>
        ${label}
      </span>
    `;
  }
  function statusPill(status) {
    const isOpen = normalize(status, "CLOSED") === "AVAILABLE";
    return `
      <span class="status-pill ${isOpen ? "status-available" : "status-closed"}">
        <i class="fa-solid ${isOpen ? "fa-unlock" : "fa-lock"}"></i>
        ${isOpen ? "Đang mở" : "Đã đóng"}
      </span>
    `;
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
})();