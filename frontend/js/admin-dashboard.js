(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const SHIFT_CONFIG = {
    NIGHT: {
      label: "Đêm",
      time: "00:00 – 06:00"
    },
    MORNING: {
      label: "Sáng",
      time: "06:00 – 12:00"
    },
    AFTERNOON: {
      label: "Chiều",
      time: "12:00 – 18:00"
    },
    EVENING: {
      label: "Tối",
      time: "18:00 – 00:00"
    }
  };
  let doctors = [];
  let schedules = [];
  let rejectScheduleId = null;
  document.addEventListener(
    "DOMContentLoaded",
    init
  );
  // =====================================================
  // KHỞI TẠO
  // =====================================================
  async function init() {
    bindEvents();
    setMinDate();
    try {
      const session =
        await apiFetch("/api/session");
      // Không có session
      if (
        !session?.success ||
        !session?.user
      ) {
        window.location.href =
          "login.html";
        return;
      }
      const user =
        session.user;
      // Không phải ADMIN
      if (
        String(user.role || "")
          .toUpperCase() !== "ADMIN"
      ) {
        window.location.href =
          "home.html";
        return;
      }
      const name =
        user.full_name ||
        user.fullName ||
        "Quản trị viên";
      $("#adminName").textContent =
        name;
      $("#adminGreeting").textContent =
        name;
      await loadDashboardData();
    } catch (error) {
      console.error(
        "Không thể khởi tạo admin dashboard:",
        error
      );
      showMessage(
        error.message ||
        "Không thể kiểm tra phiên đăng nhập.",
        "error"
      );
      setTimeout(() => {
        window.location.href =
          "login.html";
      }, 1000);
    }
  }
  // =====================================================
  // EVENT
  // =====================================================
  function bindEvents() {
    $("#refreshButton")
      .addEventListener(
        "click",
        loadDashboardData
      );
    $("#createScheduleForm")
      .addEventListener(
        "submit",
        handleCreateSchedule
      );
    $("#createScheduleForm")
      .addEventListener(
        "reset",
        () =>
          setTimeout(
            setMinDate,
            0
          )
      );
    $("#approvalFilter")
      .addEventListener(
        "change",
        renderSchedulesTable
      );
    $("#statusFilter")
      .addEventListener(
        "change",
        renderSchedulesTable
      );
    $("#pendingTableBody")
      .addEventListener(
        "click",
        handleTableAction
      );
    $("#schedulesTableBody")
      .addEventListener(
        "click",
        handleTableAction
      );
    $("#closeRejectModal")
      .addEventListener(
        "click",
        closeRejectModal
      );
    $("#cancelRejectButton")
      .addEventListener(
        "click",
        closeRejectModal
      );
    $("#confirmRejectButton")
      .addEventListener(
        "click",
        confirmReject
      );
    $("#rejectModal")
      .addEventListener(
        "click",
        (event) => {
          if (
            event.target.id ===
            "rejectModal"
          ) {
            closeRejectModal();
          }
        }
      );
    $("#logoutButton")
      .addEventListener(
        "click",
        handleLogout
      );
  }
  // =====================================================
  // NGÀY TỐI THIỂU
  // =====================================================
  function setMinDate() {
    const input =
      $("#scheduleDate");
    if (!input.value) {
      const now =
        new Date();
      const local =
        new Date(
          now.getTime() -
          now.getTimezoneOffset() *
          60000
        )
        .toISOString()
        .slice(
          0,
          10
        );
      input.min =
        local;
    }
  }
  // =====================================================
  // LOAD DATA
  // =====================================================
  async function loadDashboardData() {
    setLoadingButton(
      "#refreshButton",
      true,
      '<i class="fa-solid fa-spinner fa-spin"></i> Đang tải...'
    );
    clearMessage();
    try {
      const [
        doctorResult,
        scheduleResult
      ] = await Promise.all([
        apiFetch("/api/doctors"),
        apiFetch("/api/schedules/admin")
      ]);
      doctors =
        extractArray(
          doctorResult
        );
      schedules =
        extractArray(
          scheduleResult
        );
      populateDoctorSelect();
      renderStats();
      renderPendingTable();
      renderSchedulesTable();
    } catch (error) {
      console.error(
        "Lỗi tải admin dashboard:",
        error
      );
      showMessage(
        error.message ||
        "Không thể tải dữ liệu quản trị.",
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
  // =====================================================
  // LẤY ARRAY
  // =====================================================
  function extractArray(result) {
    if (
      Array.isArray(result)
    ) {
      return result;
    }
    if (
      Array.isArray(
        result?.data
      )
    ) {
      return result.data;
    }
    if (
      Array.isArray(
        result?.schedules
      )
    ) {
      return result.schedules;
    }
    if (
      Array.isArray(
        result?.doctors
      )
    ) {
      return result.doctors;
    }
    return [];
  }
  // =====================================================
  // SELECT BÁC SĨ
  // =====================================================
  function populateDoctorSelect() {
    const select =
      $("#doctorSelect");
    const current =
      select.value;
    select.innerHTML =
      '<option value="">-- Chọn bác sĩ --</option>';
    doctors.forEach(
      (doctor) => {
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
          } — ${
            doctor.specialty_name ||
            "Chưa cập nhật chuyên khoa"
          }`;
        select.appendChild(
          option
        );
      }
    );
    if (
      current &&
      doctors.some(
        (doctor) =>
          Number(doctor.id) ===
          Number(current)
      )
    ) {
      select.value =
        current;
    }
  }
  // =====================================================
  // STATS
  // =====================================================
  function renderStats() {
    const pending =
      schedules.filter(
        (item) =>
          String(
            item.approval_status
          ).toUpperCase() ===
          "PENDING"
      ).length;
    const approved =
      schedules.filter(
        (item) =>
          String(
            item.approval_status
          ).toUpperCase() ===
          "APPROVED"
      ).length;
    const rejected =
      schedules.filter(
        (item) =>
          String(
            item.approval_status
          ).toUpperCase() ===
          "REJECTED"
      ).length;
    $("#statDoctors")
      .textContent =
      doctors.length;
    $("#statPending")
      .textContent =
      pending;
    $("#statApproved")
      .textContent =
      approved;
    $("#statRejected")
      .textContent =
      rejected;
    $("#statTotalSchedules")
      .textContent =
      schedules.length;
    $("#pendingCountBadge")
      .textContent =
      pending;
  }
  // =====================================================
  // BẢNG CHỜ DUYỆT
  // =====================================================
  function renderPendingTable() {
    const body =
      $("#pendingTableBody");
    const pending =
      schedules
        .filter(
          (item) =>
            String(
              item.approval_status
            ).toUpperCase() ===
            "PENDING"
        )
        .sort(
          sortSchedules
        );
    if (
      !pending.length
    ) {
      body.innerHTML = `
        <tr>
          <td
            colspan="6"
            class="empty-state"
          >
            <i class="fa-regular fa-circle-check"></i>
            Không có lịch nào đang chờ duyệt.
          </td>
        </tr>
      `;
      return;
    }
    body.innerHTML =
      pending
        .map(
          renderPendingRow
        )
        .join("");
  }
  function renderPendingRow(
    schedule
  ) {
    const shift =
      SHIFT_CONFIG[
        schedule.shift_type
      ] ||
      fallbackShift(
        schedule
      );
    const doctorName =
      schedule.doctor_name ||
      schedule.full_name ||
      "Bác sĩ";
    return `
      <tr>
        <td>
          <div class="doctor-cell">
            <strong>
              BS. ${
                escapeHtml(
                  doctorName
                )
              }
            </strong>
            <span>
              ${
                escapeHtml(
                  schedule.specialty_name ||
                  "Chưa cập nhật chuyên khoa"
                )
              }
            </span>
          </div>
        </td>
        <td>
          ${
            formatDate(
              schedule.schedule_date
            )
          }
        </td>
        <td>
          ${
            escapeHtml(
              shift.label
            )
          }
        </td>
        <td>
          ${
            escapeHtml(
              formatScheduleTime(
                schedule,
                shift
              )
            )
          }
        </td>
        <td>
          ${
            approvalPill(
              "PENDING"
            )
          }
        </td>
        <td>
          <div class="action-group">
            <button
              class="table-action approve"
              data-action="approve"
              data-id="${schedule.id}"
            >
              <i class="fa-solid fa-check"></i>
              Duyệt
            </button>
            <button
              class="table-action reject"
              data-action="reject"
              data-id="${schedule.id}"
            >
              <i class="fa-solid fa-xmark"></i>
              Từ chối
            </button>
          </div>
        </td>
      </tr>
    `;
  }
  // =====================================================
  // TẤT CẢ LỊCH
  // =====================================================
  function renderSchedulesTable() {
    const body =
      $("#schedulesTableBody");
    const approvalFilter =
      $("#approvalFilter")
        .value;
    const statusFilter =
      $("#statusFilter")
        .value;
    const filtered =
      schedules
        .filter(
          (item) =>
            approvalFilter === "ALL" ||
            String(
              item.approval_status
            ).toUpperCase() ===
            approvalFilter
        )
        .filter(
          (item) =>
            statusFilter === "ALL" ||
            String(
              item.status
            ).toUpperCase() ===
            statusFilter
        )
        .sort(
          sortSchedules
        );
    if (
      !filtered.length
    ) {
      body.innerHTML = `
        <tr>
          <td
            colspan="8"
            class="empty-state"
          >
            <i class="fa-regular fa-calendar-xmark"></i>
            Không có lịch phù hợp với bộ lọc.
          </td>
        </tr>
      `;
      return;
    }
    body.innerHTML =
      filtered
        .map(
          renderScheduleRow
        )
        .join("");
  }
  // =====================================================
  // ROW LỊCH
  // =====================================================
  function renderScheduleRow(
    schedule
  ) {
    const shift =
      SHIFT_CONFIG[
        schedule.shift_type
      ] ||
      fallbackShift(
        schedule
      );
    const approval =
      String(
        schedule.approval_status ||
        "PENDING"
      ).toUpperCase();
    const status =
      String(
        schedule.status ||
        "CLOSED"
      ).toUpperCase();
    const doctorName =
      schedule.doctor_name ||
      schedule.full_name ||
      "Bác sĩ";
    let actionHtml =
      "";
    // PENDING
    if (
      approval === "PENDING"
    ) {
      actionHtml += `
        <button
          class="table-action approve"
          data-action="approve"
          data-id="${schedule.id}"
        >
          <i class="fa-solid fa-check"></i>
          Duyệt
        </button>
      `;
      actionHtml += `
        <button
          class="table-action reject"
          data-action="reject"
          data-id="${schedule.id}"
        >
          <i class="fa-solid fa-xmark"></i>
          Từ chối
        </button>
      `;
    }
    // APPROVED / REJECTED
    else {
      // Chỉ APPROVED mới được mở/đóng
      if (
        approval === "APPROVED"
      ) {
        const isOpen =
          status ===
          "AVAILABLE";
        actionHtml += `
          <button
            class="table-action toggle"
            data-action="toggle"
            data-id="${schedule.id}"
            data-status="${
              isOpen
                ? "CLOSED"
                : "AVAILABLE"
            }"
          >
            <i class="fa-solid fa-${
              isOpen
                ? "lock"
                : "lock-open"
            }"></i>
            ${
              isOpen
                ? "Đóng"
                : "Mở"
            }
          </button>
        `;
      }
      actionHtml += `
        <button
          class="table-action delete"
          data-action="delete"
          data-id="${schedule.id}"
        >
          <i class="fa-solid fa-trash"></i>
          Xóa
        </button>
      `;
    }
    return `
      <tr>
        <!-- BÁC SĨ -->
        <td>
          <div class="doctor-cell">
            <strong>
              BS. ${
                escapeHtml(
                  doctorName
                )
              }
            </strong>
            <span>
              ${
                escapeHtml(
                  schedule.doctor_email ||
                  ""
                )
              }
            </span>
          </div>
        </td>
        <!-- CHUYÊN KHOA -->
        <td>
          ${
            escapeHtml(
              schedule.specialty_name ||
              "Chưa cập nhật"
            )
          }
        </td>
        <!-- NGÀY -->
        <td>
          ${
            formatDate(
              schedule.schedule_date
            )
          }
        </td>
        <!-- CA -->
        <td>
          ${
            escapeHtml(
              shift.label
            )
          }
        </td>
        <!-- THỜI GIAN -->
        <td>
          ${
            escapeHtml(
              formatScheduleTime(
                schedule,
                shift
              )
            )
          }
        </td>
        <!-- DUYỆT -->
        <td>
          ${
            approvalPill(
              approval
            )
          }
        </td>
        <!-- HOẠT ĐỘNG -->
        <td>
          ${
            statusPill(
              status
            )
          }
        </td>
        <!-- ACTION -->
        <td>
          <div class="action-group">
            ${actionHtml}
          </div>
        </td>
      </tr>
    `;
  }
  // =====================================================
  // TẠO LỊCH
  // =====================================================
  async function handleCreateSchedule(
    event
  ) {
    event.preventDefault();
    const doctorId =
      Number(
        $("#doctorSelect")
          .value
      );
    const scheduleDate =
      $("#scheduleDate")
        .value;
    const shiftType =
      $("input[name='shift_type']:checked")
        ?.value;
    if (
      !doctorId ||
      !scheduleDate ||
      !shiftType
    ) {
      showMessage(
        "Vui lòng nhập đầy đủ bác sĩ, ngày và ca làm việc.",
        "error"
      );
      return;
    }
    setLoadingButton(
      "#createButton",
      true,
      '<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo...'
    );
    try {
      const result =
        await apiFetch(
          "/api/schedules",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body:
              JSON.stringify({
                doctor_id:
                  doctorId,
                schedule_date:
                  scheduleDate,
                shift_type:
                  shiftType
              })
          }
        );
      showMessage(
        result?.message ||
        "Tạo lịch thành công.",
        "success"
      );
      $("#createScheduleForm")
        .reset();
      setMinDate();
      await loadDashboardData();
      document
        .querySelector(
          "#schedulesSection"
        )
        ?.scrollIntoView({
          behavior:
            "smooth",
          block:
            "start"
        });
    } catch (error) {
      console.error(
        "Lỗi tạo lịch:",
        error
      );
      showMessage(
        error.message ||
        "Không thể tạo lịch.",
        "error"
      );
    } finally {
      setLoadingButton(
        "#createButton",
        false,
        '<i class="fa-solid fa-calendar-plus"></i> Tạo lịch'
      );
    }
  }
  // =====================================================
  // ACTION BẢNG
  // =====================================================
  async function handleTableAction(
    event
  ) {
    const button =
      event.target.closest(
        "button[data-action]"
      );
    if (!button) {
      return;
    }
    const id =
      Number(
        button.dataset.id
      );
    const action =
      button.dataset.action;
    const schedule =
      schedules.find(
        (item) =>
          Number(item.id) ===
          id
      );
    if (!schedule) {
      return;
    }
    try {
      if (
        action === "approve"
      ) {
        await approveSchedule(
          id
        );
      }
      else if (
        action === "reject"
      ) {
        openRejectModal(
          id
        );
      }
      else if (
        action === "toggle"
      ) {
        await toggleSchedule(
          id,
          button.dataset.status
        );
      }
      else if (
        action === "delete"
      ) {
        await deleteSchedule(
          id,
          schedule
        );
      }
    } catch (error) {
      console.error(
        "Lỗi thao tác lịch:",
        error
      );
      showMessage(
        error.message ||
        "Không thể thực hiện thao tác.",
        "error"
      );
    }
  }
  // =====================================================
  // DUYỆT
  // =====================================================
  async function approveSchedule(
    id
  ) {
    const result =
      await apiFetch(
        `/api/schedules/${id}/approve`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json"
          },
          body:
            JSON.stringify({})
        }
      );
    showMessage(
      result?.message ||
      "Đã duyệt lịch.",
      "success"
    );
    await loadDashboardData();
  }
  // =====================================================
  // MỞ MODAL TỪ CHỐI
  // =====================================================
  function openRejectModal(
    id
  ) {
    rejectScheduleId =
      id;
    $("#rejectionReason")
      .value = "";
    $("#rejectModal")
      .classList
      .add("is-open");
    $("#rejectModal")
      .setAttribute(
        "aria-hidden",
        "false"
      );
    setTimeout(
      () =>
        $("#rejectionReason")
          .focus(),
      50
    );
  }
  // =====================================================
  // ĐÓNG MODAL
  // =====================================================
  function closeRejectModal() {
    rejectScheduleId =
      null;
    $("#rejectionReason")
      .value = "";
    $("#rejectModal")
      .classList
      .remove("is-open");
    $("#rejectModal")
      .setAttribute(
        "aria-hidden",
        "true"
      );
  }
  // =====================================================
  // XÁC NHẬN TỪ CHỐI
  // =====================================================
  async function confirmReject() {
    if (
      !rejectScheduleId
    ) {
      return;
    }
    const reason =
      $("#rejectionReason")
        .value
        .trim();
    if (!reason) {
      showMessage(
        "Vui lòng nhập lý do từ chối.",
        "error"
      );
      $("#rejectionReason")
        .focus();
      return;
    }
    setLoadingButton(
      "#confirmRejectButton",
      true,
      '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...'
    );
    try {
      const result =
        await apiFetch(
          `/api/schedules/${rejectScheduleId}/reject`,
          {
            method:
              "PATCH",
            headers: {
              "Content-Type":
                "application/json"
            },
            body:
              JSON.stringify({
                rejection_reason:
                  reason
              })
          }
        );
      closeRejectModal();
      showMessage(
        result?.message ||
        "Đã từ chối lịch.",
        "success"
      );
      await loadDashboardData();
    } catch (error) {
      console.error(
        "Lỗi từ chối lịch:",
        error
      );
      showMessage(
        error.message ||
        "Không thể từ chối lịch.",
        "error"
      );
    } finally {
      setLoadingButton(
        "#confirmRejectButton",
        false,
        '<i class="fa-solid fa-ban"></i> Từ chối lịch'
      );
    }
  }
  // =====================================================
  // MỞ / ĐÓNG LỊCH
  // =====================================================
  async function toggleSchedule(
    id,
    targetStatus
  ) {
    const current =
      schedules.find(
        (item) =>
          Number(item.id) ===
          Number(id)
      );
    if (!current) {
      return;
    }
    const label =
      targetStatus ===
      "AVAILABLE"
        ? "mở"
        : "đóng";
    if (
      !window.confirm(
        `Bạn có chắc muốn ${label} lịch này?`
      )
    ) {
      return;
    }
    const result =
      await apiFetch(
        `/api/schedules/${id}`,
        {
          method:
            "PUT",
          headers: {
            "Content-Type":
              "application/json"
          },
          body:
            JSON.stringify({
              schedule_date:
                toDateInputValue(
                  current.schedule_date
                ),
              shift_type:
                current.shift_type,
              status:
                targetStatus
            })
        }
      );
    showMessage(
      result?.message ||
      `Đã ${label} lịch.`,
      "success"
    );
    await loadDashboardData();
  }
  // =====================================================
  // XÓA
  // =====================================================
  async function deleteSchedule(
    id,
    schedule
  ) {
    const doctorName =
      schedule.doctor_name ||
      schedule.full_name ||
      "bác sĩ";
    if (
      !window.confirm(
        `Bạn có chắc muốn xóa lịch của ${doctorName} ngày ${formatDate(schedule.schedule_date)}?`
      )
    ) {
      return;
    }
    const result =
      await apiFetch(
        `/api/schedules/${id}`,
        {
          method:
            "DELETE"
        }
      );
    showMessage(
      result?.message ||
      "Đã xóa lịch.",
      "success"
    );
    await loadDashboardData();
  }
  // =====================================================
  // LOGOUT
  // =====================================================
  async function handleLogout() {
    try {
      await apiFetch(
        "/api/logout",
        {
          method:
            "POST"
        }
      );
    } catch (error) {
      console.warn(
        "Logout API lỗi:",
        error
      );
    } finally {
      localStorage.removeItem(
        "user"
      );
      localStorage.removeItem(
        "role"
      );
      localStorage.removeItem(
        "vaiTro"
      );
      window.location.href =
        "login.html";
    }
  }
  // =====================================================
  // MESSAGE
  // =====================================================
  function showMessage(
    message,
    type = "success"
  ) {
    const box =
      $("#pageMessage");
    box.className =
      `alert ${
        type === "success"
          ? "alert-success"
          : "alert-error"
      } show`;
    box.textContent =
      message;
  }
  function clearMessage() {
    const box =
      $("#pageMessage");
    box.className =
      "alert";
    box.textContent =
      "";
  }
  // =====================================================
  // BUTTON LOADING
  // =====================================================
  function setLoadingButton(
    selector,
    loading,
    content
  ) {
    const button =
      $(selector);
    if (!button) {
      return;
    }
    button.disabled =
      loading;
    button.innerHTML =
      content;
  }
  // =====================================================
  // DATE
  // =====================================================
  function formatDate(
    value
  ) {
    if (!value) {
      return "--";
    }
    const raw =
      String(value)
        .slice(
          0,
          10
        );
    const match =
      raw.match(
        /^(\d{4})-(\d{2})-(\d{2})$/
      );
    return match
      ? `${match[3]}/${match[2]}/${match[1]}`
      : escapeHtml(
          String(value)
        );
  }
  function toDateInputValue(
    value
  ) {
    return String(
      value || ""
    ).slice(
      0,
      10
    );
  }
  // =====================================================
  // THỜI GIAN LỊCH
  // =====================================================
  function formatScheduleTime(
    schedule,
    shift
  ) {
    if (
      schedule.display_start &&
      schedule.display_end
    ) {
      return `${
        schedule.display_start
      } – ${
        schedule.display_end
      }`;
    }
    if (
      schedule.start_time &&
      schedule.end_time
    ) {
      return `${
        String(
          schedule.start_time
        ).slice(
          0,
          5
        )
      } – ${
        String(
          schedule.end_time
        ).slice(
          0,
          5
        )
      }`;
    }
    return shift.time;
  }
  // =====================================================
  // CA DỰ PHÒNG CHO DỮ LIỆU CŨ
  // =====================================================
  function fallbackShift(
    schedule
  ) {
    const start =
      String(
        schedule?.start_time ||
        ""
      ).slice(
        0,
        5
      );
    const end =
      String(
        schedule?.end_time ||
        ""
      ).slice(
        0,
        5
      );
    return {
      label:
        schedule?.shift_type ||
        "Ca làm việc",
      time:
        start && end
          ? `${start} – ${end}`
          : "--"
    };
  }
  // =====================================================
  // APPROVAL PILL
  // =====================================================
  function approvalPill(
    status
  ) {
    const normalized =
      String(
        status ||
        "PENDING"
      ).toUpperCase();
    const map = {
      PENDING: [
        "status-pending",
        "fa-hourglass-half",
        "Chờ duyệt"
      ],
      APPROVED: [
        "status-approved",
        "fa-circle-check",
        "Đã duyệt"
      ],
      REJECTED: [
        "status-rejected",
        "fa-circle-xmark",
        "Từ chối"
      ]
    };
    const [
      className,
      icon,
      label
    ] =
      map[
        normalized
      ] ||
      map.PENDING;
    return `
      <span
        class="status-pill ${className}"
      >
        <i
          class="fa-solid ${icon}"
        ></i>
        ${label}
      </span>
    `;
  }
  // =====================================================
  // STATUS PILL
  // =====================================================
  function statusPill(
    status
  ) {
    const normalized =
      String(
        status ||
        "CLOSED"
      ).toUpperCase();
    if (
      normalized ===
      "AVAILABLE"
    ) {
      return `
        <span
          class="status-pill status-available"
        >
          <i
            class="fa-solid fa-unlock"
          ></i>
          Đang mở
        </span>
      `;
    }
    return `
      <span
        class="status-pill status-closed"
      >
        <i
          class="fa-solid fa-lock"
        ></i>
        Đã đóng
      </span>
    `;
  }
  // =====================================================
  // SORT
  // =====================================================
  function sortSchedules(
    a,
    b
  ) {
    const dateA =
      String(
        a.schedule_date ||
        ""
      );
    const dateB =
      String(
        b.schedule_date ||
        ""
      );
    if (
      dateA !==
      dateB
    ) {
      return dateA.localeCompare(
        dateB
      );
    }
    return Number(
      a.id || 0
    ) -
      Number(
        b.id || 0
      );
  }
  // =====================================================
  // ESCAPE HTML
  // =====================================================
  function escapeHtml(
    value
  ) {
    return String(
      value ?? ""
    )
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
})();