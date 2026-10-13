/*
=====================================================
CLINIC BOOKING - DÙNG CHUNG CHO CÁC TRANG HỒ SƠ
=====================================================
- Dùng session từ server để xác thực vai trò.
- Gọi API hồ sơ, đổi mật khẩu, lịch hẹn, đơn thuốc và lịch bác sĩ.
- Giữ nguyên các thành phần giao diện/ID của hai trang hồ sơ hiện tại.
=====================================================
*/
window.ProfileCommon = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const ENDPOINTS = {
    profile: ["/api/profile"],
    password: ["/api/profile/password"],
    appointments: ["/api/profile/appointments"],
    prescriptions: ["/api/profile/prescriptions"],
    doctorProfile: ["/api/profile/doctor"],
    doctorUpdate: (_id) => ["/api/profile/doctor"],
    doctorSchedules: (_id) => ["/api/schedules/my"]
  };
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function extractArray(result) {
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.data)) return result.data;
    if (Array.isArray(result?.data?.items)) return result.data.items;
    if (Array.isArray(result?.appointments)) return result.appointments;
    if (Array.isArray(result?.schedules)) return result.schedules;
    if (Array.isArray(result?.prescriptions)) return result.prescriptions;
    return [];
  }
  function extractObject(result) {
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      return null;
    }
    const value =
      result.data?.user ||
      result.data ||
      result.user ||
      result.profile ||
      result;
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : null;
  }
  // Chuẩn hóa ngày từ API thành YYYY-MM-DD, tránh lệch múi giờ.
  function toDateInput(value) {
    if (!value) return "";
    const text = String(value).trim();
    const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : "";
  }
  function formatDate(value) {
    const text = toDateInput(value);
    if (!text) return "—";
    const [year, month, day] = text.split("-");
    return `${day}/${month}/${year}`;
  }
  function formatTime(value) {
    if (!value) return "";
    const text = String(value).trim();
    const timePart = text.includes("T") ? text.slice(11) : text;
    return timePart.slice(0, 5);
  }
  function todayString() {
    const now = new Date();
    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0")
    ].join("-");
  }
  function getCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch (error) {
      localStorage.removeItem("user");
      return null;
    }
  }
  function saveCurrentUser(patch) {
    const merged = {
      ...(getCurrentUser() || {}),
      ...(patch || {})
    };
    // Không lưu thông tin sức khỏe hoặc mật khẩu vào localStorage.
    [
      "password",
      "matKhau",
      "current_password",
      "new_password",
      "confirm_password",
      "blood_type",
      "insurance_number",
      "allergies",
      "medical_history",
      "emergency_contact_name",
      "emergency_contact_phone"
    ].forEach((key) => delete merged[key]);
    try {
      localStorage.setItem("user", JSON.stringify(merged));
      if (merged.role) {
        localStorage.setItem("role", String(merged.role));
      }
    } catch (error) {
      console.warn("Không thể lưu user vào localStorage:", error);
    }
    return merged;
  }
  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .trim();
  }
  function getRole(user = getCurrentUser()) {
    const raw = normalize(
      user?.role ||
      user?.vai_tro ||
      user?.vaiTro ||
      localStorage.getItem("role") ||
      localStorage.getItem("vaiTro") ||
      ""
    );
    if (raw === "doctor" || raw.includes("bac si")) return "doctor";
    if (raw === "admin" || raw.includes("quan tri")) return "admin";
    if (raw === "patient" || raw.includes("benh nhan")) return "patient";
    return "";
  }
  function profilePageFor(role) {
    if (role === "doctor") return "doctor-profile.html";
    if (role === "patient") return "patient-profile.html";
    return "login.html";
  }
  // Xác minh session tại máy chủ, không chỉ dựa vào localStorage.
  async function requireRole(expected) {
    let user = null;
    try {
      const session = await apiFetch("/api/session");
      user = session?.user || session?.data?.user || null;
    } catch (error) {
      console.warn("Không xác minh được session:", error);
    }
    if (!user) {
      localStorage.removeItem("user");
      localStorage.removeItem("role");
      localStorage.removeItem("vaiTro");
      window.location.replace("login.html");
      return null;
    }
    saveCurrentUser(user);
    const role = getRole(user);
    if (role === "admin") {
      window.location.replace("admin-dashboard.html");
      return null;
    }
    if (role !== expected) {
      window.location.replace(profilePageFor(role));
      return null;
    }
    return user;
  }
  async function requestFirst(urls, options) {
    let lastError = null;
    for (const url of (Array.isArray(urls) ? urls : [urls])) {
      if (!url) continue;
      try {
        return await apiFetch(url, options);
      } catch (error) {
        lastError = error;
        console.warn("API hồ sơ lỗi:", url, error);
      }
    }
    throw lastError || new Error("Không thể kết nối đến máy chủ.");
  }
  async function loadProfile() {
    try {
      const profile = extractObject(
        await requestFirst(ENDPOINTS.profile)
      );
      if (profile && profile.id != null) {
        saveCurrentUser(profile);
        return { profile, fromServer: true };
      }
      throw new Error("Máy chủ không trả về dữ liệu hồ sơ hợp lệ.");
    } catch (error) {
      console.warn(
        "Không tải được hồ sơ từ máy chủ, dùng dữ liệu tài khoản lưu cục bộ.",
        error
      );
      return {
        profile: getCurrentUser() || {},
        fromServer: false
      };
    }
  }
  async function loadDoctorProfile() {
    const doctor = extractObject(
      await requestFirst(ENDPOINTS.doctorProfile)
    );
    if (!doctor || doctor.id == null) {
      throw new Error(
        "Không tìm thấy hồ sơ bác sĩ liên kết với tài khoản."
      );
    }
    return doctor;
  }
  async function saveProfile(data) {
    const result = await requestFirst(ENDPOINTS.profile, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });
    const returned = extractObject(result);
    saveCurrentUser({
      ...(data || {}),
      ...(returned || {})
    });
    return result;
  }
  async function saveDoctorProfile(data) {
    const result = await requestFirst(ENDPOINTS.doctorUpdate(), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });
    return extractObject(result) || result;
  }
  async function changePassword(currentPassword, newPassword) {
    return requestFirst(ENDPOINTS.password, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword
      })
    });
  }
  const RULES = {
    required: (value) =>
      String(value ?? "").trim()
        ? ""
        : "Vui lòng nhập thông tin này.",
    phone: (value) => {
      if (!value) return "";
      const cleaned = String(value).replace(/[\s().-]/g, "");
      return /^(0\d{9}|\+84\d{9})$/.test(cleaned)
        ? ""
        : "Số điện thoại không hợp lệ (ví dụ 0901234567).";
    },
    birthDate: (value) => {
      if (!value) return "";
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        value < "1900-01-01" ||
        value > todayString()
      ) {
        return "Ngày sinh không hợp lệ hoặc nằm trong tương lai.";
      }
      const [year, month, day] = value.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
      )
        ? ""
        : "Ngày sinh không hợp lệ.";
    },
    url: (value) => {
      if (!value) return "";
      try {
        const url = new URL(value);
        return /^https?:$/.test(url.protocol)
          ? ""
          : "Đường dẫn phải bắt đầu bằng http hoặc https.";
      } catch (error) {
        return "Đường dẫn ảnh không hợp lệ.";
      }
    },
    maxLength: (max) => (value) =>
      String(value ?? "").length <= max
        ? ""
        : `Tối đa ${max} ký tự.`
  };
  function setFieldError(input, message) {
    const wrap = input?.closest(".field");
    if (!wrap) return;
    let error = wrap.querySelector(".field-error");
    if (!error) {
      error = document.createElement("div");
      error.className = "field-error";
      error.setAttribute("role", "alert");
      wrap.appendChild(error);
    }
    error.textContent = message;
    input.setAttribute("aria-invalid", message ? "true" : "false");
    wrap.classList.toggle("has-error", Boolean(message));
  }
  function validateForm(form, rules) {
    if (!form) return false;
    let firstInvalid = null;
    Object.entries(rules || {}).forEach(([name, checks]) => {
      const input = form.elements[name];
      if (!input) return;
      let message = "";
      for (const check of checks) {
        message = check(input.value);
        if (message) break;
      }
      setFieldError(input, message);
      if (message && !firstInvalid) {
        firstInvalid = input;
      }
    });
    firstInvalid?.focus();
    return !firstInvalid;
  }
  function clearErrors(form) {
    if (!form) return;
    form.querySelectorAll(".field").forEach((wrap) => {
      wrap.classList.remove("has-error");
      const error = wrap.querySelector(".field-error");
      if (error) error.textContent = "";
      wrap.querySelectorAll("[aria-invalid]").forEach((input) => {
        input.removeAttribute("aria-invalid");
      });
    });
  }
  function fillForm(form, data) {
    if (!form) return;
    Array.from(form.elements).forEach((input) => {
      if (!input.name) return;
      const value = data?.[input.name];
      input.value = input.type === "date"
        ? toDateInput(value)
        : (value ?? "");
    });
  }
  function readForm(form, names) {
    const out = {};
    if (!form) return out;
    names.forEach((name) => {
      const input = form.elements[name];
      if (input) {
        out[name] = String(input.value ?? "").trim();
      }
    });
    return out;
  }
  function trackDirty(form, onChange) {
    const button = form?.querySelector('button[type="submit"]');
    let dirty = false;
    const set = (value) => {
      dirty = value;
      if (button) {
        button.disabled = !value;
      }
      if (typeof onChange === "function") {
        onChange(value);
      }
    };
    form?.addEventListener("input", () => set(true));
    form?.addEventListener("change", () => set(true));
    set(false);
    return {
      reset: () => set(false),
      isDirty: () => dirty
    };
  }
  async function withBusy(button, task, busyText = "Đang lưu...") {
    if (!button) return task();
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML =
      `<i class="fa-solid fa-spinner fa-spin"></i> ${escapeHtml(busyText)}`;
    try {
      return await task();
    } finally {
      button.innerHTML = original;
      // Form sẽ được bật/tắt nút Lưu theo trạng thái dirty.
      if (!button.dataset.keepDisabled) {
        button.disabled = false;
      }
    }
  }
  function toast(message, type = "success") {
    let box = $("toastBox");
    if (!box) {
      box = document.createElement("div");
      box.id = "toastBox";
      box.className = "toast-box";
      box.setAttribute("aria-live", "polite");
      document.body.appendChild(box);
    }
    const item = document.createElement("div");
    item.className = `toast toast--${type}`;
    const icon = document.createElement("i");
    icon.className =
      `fa-solid ${type === "success"
        ? "fa-circle-check"
        : "fa-circle-exclamation"}`;
    const text = document.createElement("span");
    text.textContent = String(message || "");
    item.append(icon, text);
    box.appendChild(item);
    window.setTimeout(
      () => item.remove(),
      type === "success" ? 3500 : 6000
    );
  }
  function showBanner(message, type = "info") {
    const banner = $("profileBanner");
    if (!banner) return;
    banner.className = `banner banner--${type}`;
    banner.textContent = String(message || "");
    banner.hidden = !message;
  }
  function setupHeader() {
    const user = getCurrentUser();
    if ($("welcomeUser") && user) {
      $("welcomeUser").textContent =
        "Xin chào, " +
        (user.full_name || user.fullName || user.email || "bạn");
    }
    const logoutButton = $("logoutButton");
    if (
      !logoutButton ||
      logoutButton.dataset.profileLogoutBound === "1"
    ) {
      return;
    }
    logoutButton.dataset.profileLogoutBound = "1";
    logoutButton.addEventListener("click", async () => {
      if (!window.confirm("Bạn có chắc chắn muốn đăng xuất?")) {
        return;
      }
      try {
        await apiFetch("/api/logout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          }
        });
      } catch (error) {
        console.warn("Không thể gọi API đăng xuất:", error);
      } finally {
        localStorage.removeItem("user");
        localStorage.removeItem("role");
        localStorage.removeItem("vaiTro");
        sessionStorage.clear();
        window.location.href = "login.html";
      }
    });
  }
  function setupSectionNav() {
    const links = Array.from(
      document.querySelectorAll("[data-section-link]")
    );
    const sections = Array.from(
      document.querySelectorAll("[data-section]")
    );
    if (!sections.length) return;
    const show = (name) => {
      const target = sections.some(
        (section) => section.dataset.section === name
      )
        ? name
        : sections[0].dataset.section;
      sections.forEach((section) => {
        section.hidden = section.dataset.section !== target;
      });
      links.forEach((link) => {
        link.classList.toggle(
          "active",
          link.dataset.sectionLink === target
        );
      });
    };
    links.forEach((link) => {
      if (link.dataset.profileNavBound === "1") return;
      link.dataset.profileNavBound = "1";
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const name = link.dataset.sectionLink;
        history.replaceState(null, "", `#${name}`);
        show(name);
      });
    });
    show(window.location.hash.replace(/^#/, ""));
  }
  function guardUnsaved(trackers) {
    if (window.__profileUnsavedGuardBound) return;
    window.__profileUnsavedGuardBound = true;
    window.addEventListener("beforeunload", (event) => {
      if ((trackers || []).some((tracker) => tracker?.isDirty?.())) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
  }
  function setupPasswordForm(form) {
    if (!form || form.dataset.profilePasswordBound === "1") return;
    form.dataset.profilePasswordBound = "1";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearErrors(form);
      const oldPassword =
        form.elements.current_password?.value || "";
      const newPassword =
        form.elements.new_password?.value || "";
      const confirm =
        form.elements.confirm_password?.value || "";
      const ok = validateForm(form, {
        current_password: [RULES.required],
        new_password: [
          RULES.required,
          (value) => value.length >= 8
            ? ""
            : "Mật khẩu mới tối thiểu 8 ký tự.",
          (value) => /[A-Za-z]/.test(value) && /\d/.test(value)
            ? ""
            : "Mật khẩu mới cần có cả chữ và số.",
          (value) => value !== oldPassword
            ? ""
            : "Mật khẩu mới phải khác mật khẩu hiện tại."
        ],
        confirm_password: [
          (value) => value === newPassword
            ? ""
            : "Mật khẩu nhập lại không khớp."
        ]
      });
      if (!ok) return;
      try {
        await withBusy(
          form.querySelector('button[type="submit"]'),
          () => changePassword(oldPassword, newPassword),
          "Đang đổi..."
        );
        form.reset();
        toast("Đã đổi mật khẩu thành công.");
      } catch (error) {
        toast(error.message || "Không thể đổi mật khẩu.", "error");
      }
    });
    form.querySelectorAll("[data-toggle-password]").forEach((button) => {
      button.addEventListener("click", () => {
        const input = button.parentElement?.querySelector("input");
        if (!input) return;
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        button.setAttribute(
          "aria-label",
          show ? "Ẩn mật khẩu" : "Hiện mật khẩu"
        );
        button.innerHTML =
          `<i class="fa-solid ${show ? "fa-eye-slash" : "fa-eye"}"></i>`;
      });
    });
  }
  return {
    $,
    ENDPOINTS,
    RULES,
    escapeHtml,
    extractArray,
    extractObject,
    toDateInput,
    formatDate,
    formatTime,
    todayString,
    normalize,
    getCurrentUser,
    saveCurrentUser,
    getRole,
    profilePageFor,
    requireRole,
    requestFirst,
    loadProfile,
    loadDoctorProfile,
    saveProfile,
    saveDoctorProfile,
    changePassword,
    validateForm,
    clearErrors,
    fillForm,
    readForm,
    trackDirty,
    withBusy,
    toast,
    showBanner,
    setupHeader,
    setupSectionNav,
    setupPasswordForm,
    guardUnsaved
  };
})();