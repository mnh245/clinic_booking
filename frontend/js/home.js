/*
=====================================================
CLINIC BOOKING - HOME PAGE (một file duy nhất)
=====================================================
1. Đăng nhập / đăng xuất
2. Tải bác sĩ → chuyên khoa, danh sách, bác sĩ nổi bật
3. Tìm kiếm (từ khóa, chuyên khoa, sắp xếp, lưu lên URL)
4. Form đặt lịch (bác sĩ, ngày, giờ, tạo lịch hẹn)
=====================================================
*/
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  /* =====================================================
     TRẠNG THÁI
     ===================================================== */
  let allDoctors = [];
  let selectedDoctor = null;
  let doctorsLoaded = false;
  let searchTimer = null;
  let pendingSpecialty = "";
  let searchFromUrl = false;
  const AVATAR_STYLE =
    "width:100%;height:100%;object-fit:cover;border-radius:inherit;";
  document.addEventListener("DOMContentLoaded", async () => {
    setupLoginState();
    setupSearch();
    setupBooking();
    await loadDoctors();
  });
  /* =====================================================
     TIỆN ÍCH
     ===================================================== */
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  /** Bỏ dấu, chữ thường: "Tim Mạch" -> "tim mach", "Đức" -> "duc". */
  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/\s+/g, " ")
      .trim();
  }
  function createSpecialtySlug(name) {
    return normalizeText(name)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
  function getSpecialtyIcon(name) {
    const value = String(name || "").toLowerCase();
    if (value.includes("tim")) return "fa-heart-pulse";
    if (value.includes("nhi")) return "fa-child";
    if (value.includes("thần kinh")) return "fa-brain";
    if (value.includes("da liễu")) return "fa-hand-dots";
    if (value.includes("tai") || value.includes("mũi") || value.includes("họng")) {
      return "fa-ear-listen";
    }
    if (value.includes("ngoại")) return "fa-scissors";
    if (value.includes("nội")) return "fa-stethoscope";
    if (value.includes("răng")) return "fa-tooth";
    return "fa-stethoscope";
  }
  function formatExperience(years) {
    if (years === null || years === undefined) {
      return "Chưa cập nhật kinh nghiệm";
    }
    const value = Number(years);
    return value === 0 ? "Dưới 1 năm kinh nghiệm" : `${value} năm kinh nghiệm`;
  }
  function formatTime(value) {
    return value ? String(value).slice(0, 5) : "";
  }
  /** Lấy mảng từ response dạng [..] hoặc { data: [..] } hoặc { doctors: [..] }. */
  function extractArray(result) {
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.data)) return result.data;
    if (Array.isArray(result?.doctors)) return result.doctors;
    if (Array.isArray(result?.schedules)) return result.schedules;
    if (Array.isArray(result?.data?.schedules)) return result.data.schedules;
    return [];
  }
  /** Ngày hôm nay theo giờ địa phương, dạng YYYY-MM-DD. */
  function todayString() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
  }
  function getDoctorById(id) {
    return allDoctors.find((doctor) => Number(doctor.id) === Number(id)) || null;
  }
  function doctorAvatarHtml(doctor, imgStyle = "") {
    if (!doctor.avatar) {
      return '<i class="fa-solid fa-user-doctor"></i>';
    }
    const style = imgStyle ? ` style="${imgStyle}"` : "";
    return `<img src="${escapeHtml(doctor.avatar)}" alt="BS. ${escapeHtml(doctor.full_name || "Bác sĩ")}"${style}>`;
  }
  /* =====================================================
     1. ĐĂNG NHẬP / ĐĂNG XUẤT
     ===================================================== */
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
  function setupLoginState() {
    const user = getCurrentUser();
    const loggedIn = Boolean(user);
    const loginLink = $("loginLink");
    const registerLink = $("registerLink");
    const userInfo = $("userInfo");
    const welcomeUser = $("welcomeUser");
    if (loginLink) loginLink.style.display = loggedIn ? "none" : "inline-flex";
    if (registerLink) registerLink.style.display = loggedIn ? "none" : "inline-flex";
    if (userInfo) userInfo.style.display = loggedIn ? "flex" : "none";
    if (loggedIn && welcomeUser) {
      welcomeUser.textContent =
        "Xin chào, " + (user.full_name || user.fullName || user.email || "bạn");
    }
    $("logoutButton")?.addEventListener("click", handleLogout);
  }
  async function handleLogout() {
    if (!window.confirm("Bạn có chắc chắn muốn đăng xuất?")) {
      return;
    }
    try {
      await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" }
      });
    } catch (error) {
      console.warn("Không thể gọi API logout:", error);
    }
    localStorage.removeItem("user");
    localStorage.removeItem("role");
    localStorage.removeItem("vaiTro");
    sessionStorage.clear();
    window.location.href = "login.html";
  }
  /* =====================================================
     2. TẢI VÀ HIỂN THỊ BÁC SĨ / CHUYÊN KHOA
     ===================================================== */
  async function loadDoctors() {
    const doctorGrid = $("doctorList");
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
      allDoctors = extractArray(await apiFetch("/api/doctors"));
      doctorsLoaded = true;
      // renderSpecialties dựng lại ô chọn chuyên khoa nên phải chọn lại giá trị cũ
      const previousSpecialty = $("specialtySelect")?.value || pendingSpecialty;
      pendingSpecialty = "";
      renderSpecialties(allDoctors);
      restoreSpecialtySelection(previousSpecialty);
      renderFeaturedDoctors(allDoctors);
      populateDoctorSelect();
      renderDoctorResults();
      if (selectedDoctor) {
        selectedDoctor = getDoctorById(selectedDoctor.id);
        updateSelectedDoctorInfo(selectedDoctor);
      }
      // Vào trang bằng link có sẵn bộ lọc: cuộn tới kết quả
      if (searchFromUrl) {
        searchFromUrl = false;
        $("doctors")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch (error) {
      console.error("LOAD DOCTORS ERROR:", error);
      doctorGrid.innerHTML = `
        <div class="card specialty-card">
          <div class="specialty-icon">
            <i class="fa-solid fa-triangle-exclamation"></i>
          </div>
          <h3>Không thể tải dữ liệu</h3>
          <p>${escapeHtml(error.message || "Không thể kết nối đến hệ thống bác sĩ.")}</p>
          <button type="button" class="btn btn-primary retry-doctors">
            <i class="fa-solid fa-rotate"></i>
            Thử lại
          </button>
        </div>
      `;
      doctorGrid
        .querySelector(".retry-doctors")
        ?.addEventListener("click", loadDoctors);
      const featured = $("featuredDoctors");
      if (featured) {
        featured.innerHTML = `
          <div class="doctor-mini">
            <div class="doctor-avatar">
              <i class="fa-solid fa-triangle-exclamation"></i>
            </div>
            <div class="doctor-info">
              <strong>Không thể tải dữ liệu</strong>
              <span>Máy chủ không phản hồi</span>
            </div>
          </div>
        `;
      }
    }
  }
  function renderSpecialties(doctors) {
    const specialtyGrid = $("specialtyGrid");
    if (!specialtyGrid) {
      return;
    }
    const specialtyMap = new Map();
    doctors.forEach((doctor) => {
      if (!doctor.specialty_id || !doctor.specialty_name) {
        return;
      }
      if (!specialtyMap.has(doctor.specialty_id)) {
        specialtyMap.set(doctor.specialty_id, {
          id: doctor.specialty_id,
          name: doctor.specialty_name,
          count: 0
        });
      }
      specialtyMap.get(doctor.specialty_id).count++;
    });
    const specialties = Array.from(specialtyMap.values());
    if (!specialties.length) {
      specialtyGrid.innerHTML = `
        <div class="card specialty-card">
          <div class="specialty-icon">
            <i class="fa-solid fa-circle-exclamation"></i>
          </div>
          <h3>Chưa có chuyên khoa</h3>
          <p>Hiện chưa có dữ liệu chuyên khoa.</p>
        </div>
      `;
      return;
    }
    specialtyGrid.innerHTML = specialties
      .slice(0, 4)
      .map((specialty) => {
        const slug = createSpecialtySlug(specialty.name);
        const icon = getSpecialtyIcon(specialty.name);
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
              ${specialty.count} bác sĩ đang hoạt động
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
    // Ô chọn chuyên khoa ở thanh tìm kiếm: liệt kê TẤT CẢ chuyên khoa
    const specialtySelect = $("specialtySelect");
    if (specialtySelect) {
      specialtySelect.innerHTML = '<option value="">Tất cả chuyên khoa</option>';
      specialties
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "vi"))
        .forEach((specialty) => {
          const option = document.createElement("option");
          option.value = createSpecialtySlug(specialty.name);
          option.textContent = specialty.name;
          specialtySelect.appendChild(option);
        });
    }
  }
  function renderDoctors(doctors, limit = 6) {
    const doctorGrid = $("doctorList");
    if (!doctorGrid) {
      return;
    }
    if (!doctors.length) {
      doctorGrid.innerHTML = `
        <div class="card specialty-card">
          <div class="specialty-icon">
            <i class="fa-solid fa-user-doctor"></i>
          </div>
          <h3>Chưa có bác sĩ</h3>
          <p>Hiện chưa có dữ liệu bác sĩ.</p>
        </div>
      `;
      return;
    }
    doctorGrid.innerHTML = doctors
      .slice(0, limit)
      .map((doctor) => {
        const introduction =
          doctor.introduction || "Bác sĩ đang cập nhật thông tin giới thiệu.";
        const rating = doctor.rating
          ? Number(doctor.rating).toFixed(1)
          : "Chưa có đánh giá";
        return `
          <article class="card doctor-card">
            <div class="doctor-cover"></div>
            <div class="doctor-body">
              <div class="doctor-avatar">
                ${doctorAvatarHtml(doctor, AVATAR_STYLE)}
              </div>
              <h3>BS. ${escapeHtml(doctor.full_name || "Bác sĩ")}</h3>
              <div class="doctor-specialty">
                ${escapeHtml(doctor.specialty_name || "Chưa cập nhật chuyên khoa")}
              </div>
              <div class="doctor-info">${escapeHtml(introduction)}</div>
              <span class="chip">
                <i class="fa-regular fa-clock"></i>
                ${formatExperience(doctor.experience_years)}
              </span>
              <div class="doctor-card-footer">
                <span class="rating">
                  <i class="fa-solid fa-star"></i>
                  <span>${rating}</span>
                </span>
                <button
                  type="button"
                  class="btn btn-primary doctor-book-button"
                  data-doctor-id="${doctor.id}"
                >
                  <i class="fa-solid fa-calendar-check"></i>
                  Đặt lịch
                </button>
              </div>
            </div>
          </article>
        `;
      })
      .join("");
  }
  function renderFeaturedDoctors(doctors) {
    const featuredDoctors = $("featuredDoctors");
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
      .map((doctor) => `
        <button
          type="button"
          class="doctor-mini doctor-featured-button"
          data-doctor-id="${doctor.id}"
        >
          <div class="doctor-avatar">
            ${doctorAvatarHtml(doctor, AVATAR_STYLE)}
          </div>
          <div class="doctor-info">
            <strong>BS. ${escapeHtml(doctor.full_name || "Bác sĩ")}</strong>
            <span>
              ${escapeHtml(doctor.specialty_name || "Chưa cập nhật chuyên khoa")}
              •
              ${formatExperience(doctor.experience_years)}
            </span>
          </div>
          <i class="fa-solid fa-chevron-right"></i>
        </button>
      `)
      .join("");
  }
  function populateDoctorSelect() {
    const doctorSelect = $("doctorSelect");
    if (!doctorSelect) {
      return;
    }
    const current = doctorSelect.value;
    doctorSelect.innerHTML = '<option value="">-- Chọn bác sĩ --</option>';
    allDoctors.forEach((doctor) => {
      const option = document.createElement("option");
      option.value = doctor.id;
      option.textContent =
        `BS. ${doctor.full_name || "Bác sĩ"} - ` +
        (doctor.specialty_name || "Chưa cập nhật chuyên khoa");
      doctorSelect.appendChild(option);
    });
    if (current && getDoctorById(current)) {
      doctorSelect.value = current;
    }
  }
  /* =====================================================
     3. TÌM KIẾM
     ===================================================== */
  function getSearchCriteria() {
    const keyword = $("searchKeyword")?.value.trim() || "";
    const specialty = $("specialtySelect")?.value || "";
    return {
      keyword,
      specialty,
      // Mỗi từ khóa phải xuất hiện (không phân biệt dấu / hoa thường)
      tokens: normalizeText(keyword).split(" ").filter(Boolean)
    };
  }
  function doctorMatches(doctor, criteria) {
    if (criteria.specialty) {
      const slug = createSpecialtySlug(doctor.specialty_name);
      // Chấp nhận cả slug đầy đủ ("noi-khoa") lẫn slug rút gọn ("noi")
      const sameSpecialty =
        slug === criteria.specialty || slug.startsWith(criteria.specialty + "-");
      if (!sameSpecialty) {
        return false;
      }
    }
    if (!criteria.tokens.length) {
      return true;
    }
    const haystack = normalizeText(
      [
        doctor.full_name,
        doctor.specialty_name,
        doctor.qualification,
        doctor.introduction
      ]
        .filter(Boolean)
        .join(" ")
    );
    return criteria.tokens.every((token) => haystack.includes(token));
  }
  /** Điểm liên quan: khớp tên bác sĩ > khớp chuyên khoa > khớp mô tả. */
  function relevanceScore(doctor, tokens) {
    const name = normalizeText(doctor.full_name);
    const specialty = normalizeText(doctor.specialty_name);
    return tokens.reduce((score, token) => {
      if (name.includes(token)) return score + 3;
      if (specialty.includes(token)) return score + 2;
      return score + 1;
    }, 0);
  }
  function sortDoctors(list, criteria, mode) {
    const sorted = list.slice();
    const byNumberDesc = (field) => (a, b) =>
      Number(b[field] || 0) - Number(a[field] || 0);
    if (mode === "rating") {
      sorted.sort(byNumberDesc("rating"));
    } else if (mode === "experience") {
      sorted.sort(byNumberDesc("experience_years"));
    } else if (mode === "name") {
      sorted.sort((a, b) =>
        String(a.full_name || "").localeCompare(String(b.full_name || ""), "vi")
      );
    } else if (criteria.tokens.length) {
      const scores = new Map(
        sorted.map((doctor) => [doctor, relevanceScore(doctor, criteria.tokens)])
      );
      sorted.sort((a, b) => scores.get(b) - scores.get(a));
    }
    return sorted;
  }
  /** Chọn lại chuyên khoa trong ô select (chấp nhận slug rút gọn như "noi"). */
  function restoreSpecialtySelection(value) {
    const select = $("specialtySelect");
    if (!select || !value) {
      return;
    }
    const options = Array.from(select.options);
    const match =
      options.find((option) => option.value === value) ||
      options.find((option) => option.value && option.value.startsWith(value + "-"));
    if (match) {
      select.value = match.value;
    }
  }
  /** Ghi bộ lọc lên URL để chia sẻ / tải lại trang vẫn giữ kết quả. */
  function syncSearchToUrl(criteria, sortMode) {
    const params = new URLSearchParams();
    if (criteria.keyword) params.set("keyword", criteria.keyword);
    if (criteria.specialty) params.set("specialty", criteria.specialty);
    if (sortMode && sortMode !== "relevance") params.set("sort", sortMode);
    const query = params.toString();
    try {
      history.replaceState(
        null,
        "",
        window.location.pathname + (query ? "?" + query : "") + window.location.hash
      );
    } catch (error) {
      // Mở bằng file:// có thể không cho đổi URL, bỏ qua
    }
  }
  /** Đọc ?keyword=&specialty=&sort= trên URL để điền sẵn thanh tìm kiếm. */
  function applySearchFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const keyword = params.get("keyword") || "";
    const specialty = params.get("specialty") || "";
    const sort = params.get("sort") || "";
    if (!keyword && !specialty) {
      return;
    }
    const keywordInput = $("searchKeyword");
    if (keywordInput) keywordInput.value = keyword;
    // Danh sách chuyên khoa chỉ đầy đủ sau khi tải bác sĩ, nên nhớ lại để chọn sau
    pendingSpecialty = specialty;
    restoreSpecialtySelection(specialty);
    const sortSelect = $("searchSort");
    if (sortSelect && ["rating", "experience", "name"].includes(sort)) {
      sortSelect.value = sort;
    }
    searchFromUrl = true;
  }
  /** Hiển thị danh sách bác sĩ theo từ khóa / chuyên khoa đang nhập. */
  function renderDoctorResults() {
    const doctorGrid = $("doctorList");
    const resultBar = $("searchResultBar");
    const resultText = $("searchResultText");
    // Chưa tải xong dữ liệu thì chưa lọc, tránh báo "không tìm thấy" sai
    if (!doctorGrid || !doctorsLoaded) {
      return;
    }
    const criteria = getSearchCriteria();
    const isFiltering = Boolean(criteria.tokens.length || criteria.specialty);
    const sortMode = $("searchSort")?.value || "relevance";
    syncSearchToUrl(criteria, isFiltering ? sortMode : "relevance");
    // Không lọc: giữ nguyên danh sách nổi bật (6 bác sĩ đầu)
    if (!isFiltering) {
      if (resultBar) resultBar.hidden = true;
      renderDoctors(allDoctors);
      return;
    }
    const matches = sortDoctors(
      allDoctors.filter((doctor) => doctorMatches(doctor, criteria)),
      criteria,
      sortMode
    );
    if (resultBar && resultText) {
      const specialtyLabel = criteria.specialty
        ? $("specialtySelect")?.selectedOptions[0]?.textContent.trim()
        : "";
      resultText.textContent =
        `Tìm thấy ${matches.length} bác sĩ` +
        (criteria.keyword ? ` cho “${criteria.keyword}”` : "") +
        (specialtyLabel ? ` · ${specialtyLabel}` : "");
      resultBar.hidden = false;
    }
    if (!matches.length) {
      doctorGrid.innerHTML = `
        <div class="card specialty-card">
          <div class="specialty-icon">
            <i class="fa-solid fa-magnifying-glass"></i>
          </div>
          <h3>Không tìm thấy bác sĩ phù hợp</h3>
          <p>
            Hãy thử từ khóa khác hoặc chọn
            “Tất cả chuyên khoa”.
          </p>
          <button type="button" class="btn btn-outline clear-search">
            Xóa bộ lọc
          </button>
        </div>
      `;
      doctorGrid
        .querySelector(".clear-search")
        ?.addEventListener("click", clearSearch);
      return;
    }
    // Khi tìm kiếm thì hiển thị toàn bộ kết quả, không cắt còn 6
    renderDoctors(matches, matches.length);
  }
  function clearSearch() {
    const keywordInput = $("searchKeyword");
    const specialtySelect = $("specialtySelect");
    const sortSelect = $("searchSort");
    if (keywordInput) keywordInput.value = "";
    if (specialtySelect) specialtySelect.value = "";
    if (sortSelect) sortSelect.value = "relevance";
    renderDoctorResults();
  }
  function setupSearch() {
    const searchForm = $("searchForm");
    if (!searchForm) {
      return;
    }
    // Bấm "Tìm kiếm" / Enter: lọc ngay rồi cuộn tới danh sách bác sĩ
    searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      clearTimeout(searchTimer);
      renderDoctorResults();
      $("doctors")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    // Gõ đến đâu lọc đến đó (chờ 250ms sau lần gõ cuối)
    $("searchKeyword")?.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderDoctorResults, 250);
    });
    $("specialtySelect")?.addEventListener("change", renderDoctorResults);
    $("searchSort")?.addEventListener("change", renderDoctorResults);
    $("clearSearchButton")?.addEventListener("click", clearSearch);
    applySearchFromUrl();
  }
  /* =====================================================
     4. FORM ĐẶT LỊCH
     ===================================================== */
  function setupBooking() {
    const doctorSelect = $("doctorSelect");
    const appointmentDate = $("appointmentDate");
    // Nút "Đặt lịch" trên thẻ bác sĩ / bác sĩ nổi bật (thẻ được vẽ lại nhiều lần)
    document.addEventListener("click", (event) => {
      const button = event.target.closest(".doctor-book-button, .doctor-featured-button");
      if (button) {
        openBookingPanel(Number(button.dataset.doctorId));
      }
    });
    $("heroBookingButton")?.addEventListener("click", () => {
      clearBookingMessage();
      openBookingPanel();
    });
    $("closeAppointment")?.addEventListener("click", closeBookingPanel);
    $("cancelBooking")?.addEventListener("click", closeBookingPanel);
    doctorSelect?.addEventListener("change", async () => {
      const doctor = getDoctorById(doctorSelect.value);
      selectedDoctor = doctor;
      const bookingDoctorId = $("bookingDoctorId");
      if (bookingDoctorId) bookingDoctorId.value = doctor ? doctor.id : "";
      updateSelectedDoctorInfo(doctor);
      resetSelectedTime();
      if (appointmentDate) appointmentDate.disabled = !doctor;
      if (doctor && appointmentDate?.value) {
        await loadAvailableSlots();
      } else {
        showSlotPlaceholder("Chọn ngày để xem giờ khám.");
      }
    });
    if (appointmentDate) {
      appointmentDate.min = todayString();
      appointmentDate.addEventListener("change", loadAvailableSlots);
    }
    // Chọn giờ khám (các nút giờ được vẽ lại mỗi lần đổi ngày)
    $("slotList")?.addEventListener("click", (event) => {
      const button = event.target.closest(".appointment-slot:not(:disabled)");
      if (!button) {
        return;
      }
      $("slotList")
        .querySelectorAll(".appointment-slot")
        .forEach((item) => item.classList.remove("is-selected"));
      button.classList.add("is-selected");
      $("selectedScheduleId").value = button.dataset.scheduleId || "";
      $("selectedAppointmentTime").value = button.dataset.time || "";
    });
    $("appointmentForm")?.addEventListener("submit", submitAppointment);
  }
  function bookingMessage(message, type = "error") {
    const form = $("appointmentForm");
    if (!form) {
      return;
    }
    let box = $("bookingMessage");
    if (!box) {
      box = document.createElement("div");
      box.id = "bookingMessage";
      form.prepend(box);
    }
    box.className = `booking-message ${type}`;
    box.textContent = message;
    box.style.display = "block";
  }
  function clearBookingMessage() {
    const box = $("bookingMessage");
    if (box) {
      box.style.display = "none";
      box.textContent = "";
    }
  }
  function openBookingPanel(doctorId = null) {
    const panel = $("appointmentPanel");
    if (!panel) {
      return;
    }
    // Yêu cầu đăng nhập
    if (!getCurrentUser()) {
      alert("Bạn cần đăng nhập trước khi đặt lịch.");
      window.location.href = "login.html";
      return;
    }
    panel.classList.add("is-open");
    if (doctorId) {
      selectDoctor(getDoctorById(doctorId));
    }
    setTimeout(() => {
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }
  function closeBookingPanel() {
    $("appointmentPanel")?.classList.remove("is-open");
  }
  async function selectDoctor(doctor) {
    if (!doctor) {
      bookingMessage("Không tìm thấy thông tin bác sĩ.");
      return;
    }
    selectedDoctor = doctor;
    const doctorSelect = $("doctorSelect");
    const bookingDoctorId = $("bookingDoctorId");
    const appointmentDate = $("appointmentDate");
    if (doctorSelect) doctorSelect.value = doctor.id;
    if (bookingDoctorId) bookingDoctorId.value = doctor.id;
    if (appointmentDate) appointmentDate.disabled = false;
    updateSelectedDoctorInfo(doctor);
    resetSelectedTime();
    clearBookingMessage();
    if (appointmentDate?.value) {
      await loadAvailableSlots();
    } else {
      showSlotPlaceholder("Chọn ngày để xem giờ khám.");
    }
  }
  function updateSelectedDoctorInfo(doctor) {
    const setText = (id, text) => {
      const element = $(id);
      if (element) element.textContent = text;
    };
    const avatar = $("selectedDoctorAvatar");
    if (!doctor) {
      setText("selectedDoctorName", "Chưa chọn bác sĩ");
      setText("selectedDoctorSpecialty", "Vui lòng chọn bác sĩ để xem thông tin.");
      setText("selectedDoctorExperience", "--");
      setText("selectedDoctorQualification", "--");
      setText("selectedDoctorLicense", "--");
      setText("selectedDoctorIntroduction", "Thông tin bác sĩ sẽ được hiển thị tại đây.");
      if (avatar) avatar.innerHTML = '<i class="fa-solid fa-user-doctor"></i>';
      return;
    }
    setText("selectedDoctorName", `BS. ${doctor.full_name || "Bác sĩ"}`);
    setText("selectedDoctorSpecialty", doctor.specialty_name || "Chưa cập nhật chuyên khoa");
    setText(
      "selectedDoctorExperience",
      doctor.experience_years == null ? "Chưa cập nhật" : `${doctor.experience_years} năm`
    );
    setText("selectedDoctorQualification", doctor.qualification || "Chưa cập nhật");
    setText("selectedDoctorLicense", doctor.license_number || "Chưa cập nhật");
    setText(
      "selectedDoctorIntroduction",
      doctor.introduction || "Bác sĩ đang cập nhật thông tin giới thiệu."
    );
    if (avatar) avatar.innerHTML = doctorAvatarHtml(doctor);
  }
  function resetSelectedTime() {
    const scheduleInput = $("selectedScheduleId");
    const timeInput = $("selectedAppointmentTime");
    if (scheduleInput) scheduleInput.value = "";
    if (timeInput) timeInput.value = "";
    document
      .querySelectorAll(".appointment-slot")
      .forEach((item) => item.classList.remove("is-selected"));
  }
  function showSlotPlaceholder(html) {
    const slotList = $("slotList");
    if (slotList) {
      slotList.innerHTML = `<div class="slot-empty">${html}</div>`;
    }
    resetSelectedTime();
  }
  /* ---------- Lấy khung giờ khám ---------- */
  /**
   * Trả về [{ scheduleId, time, available }].
   * Ưu tiên getAvailableSlots() (nếu api.js có), nếu không có hoặc lỗi
   * thì tự dựng khung giờ 30 phút từ lịch làm việc của bác sĩ.
   */
  async function fetchSlots(doctorId, date) {
    if (typeof getAvailableSlots === "function") {
      try {
        const result = await getAvailableSlots(doctorId, date);
        return extractArray(result).map((slot) => ({
          scheduleId: slot.schedule_id,
          time: formatTime(slot.time),
          available: Boolean(slot.available)
        }));
      } catch (error) {
        console.warn("getAvailableSlots lỗi, chuyển sang lịch làm việc:", error);
      }
    }
    return buildSlotsFromSchedules(await fetchDoctorSchedules(doctorId, date));
  }
  async function fetchDoctorSchedules(doctorId, date) {
    const urls = [
      `/api/doctors/${encodeURIComponent(doctorId)}/schedules?date=${encodeURIComponent(date)}`,
      `/api/schedules?doctor_id=${encodeURIComponent(doctorId)}&date=${encodeURIComponent(date)}`
    ];
    let lastError = null;
    for (const url of urls) {
      try {
        return extractArray(await apiFetch(url));
      } catch (error) {
        lastError = error;
        console.warn("Không tải được lịch từ", url, error);
      }
    }
    throw lastError || new Error("Không thể tải lịch khám.");
  }
  function buildSlotsFromSchedules(schedules) {
    const bookedTimes = new Set();
    schedules.forEach((schedule) => {
      (schedule.booked_times || schedule.bookedTimes || []).forEach((value) => {
        bookedTimes.add(formatTime(value));
      });
    });
    const seen = new Set();
    const slots = [];
    schedules.flatMap(createSlots).forEach((slot) => {
      const key = `${slot.scheduleId}-${slot.time}`;
      if (!seen.has(key)) {
        seen.add(key);
        slots.push({
          scheduleId: slot.scheduleId,
          time: slot.time,
          available: !slot.booked && !bookedTimes.has(slot.time)
        });
      }
    });
    return slots;
  }
  /** Khung giờ của một ca làm việc (mỗi khung 30 phút). */
  function createSlots(schedule) {
    const existing =
      schedule.slots || schedule.available_slots || schedule.availableTimes;
    // API đã trả sẵn danh sách khung giờ
    if (Array.isArray(existing) && existing.length) {
      return existing
        .map((slot) => {
          if (typeof slot === "string") {
            return { scheduleId: schedule.id, time: formatTime(slot), booked: false };
          }
          return {
            scheduleId: slot.schedule_id || schedule.id,
            time: formatTime(slot.appointment_time || slot.time || slot.start_time),
            booked: Boolean(slot.booked || slot.is_booked || slot.status === "BOOKED")
          };
        })
        .filter((slot) => slot.time);
    }
    // Tự chia khung giờ từ giờ bắt đầu / kết thúc
    const start = formatTime(schedule.start_time);
    const end = formatTime(schedule.end_time);
    if (!start || !end) {
      return [];
    }
    const [startHour, startMinute] = start.split(":").map(Number);
    const [endHour, endMinute] = end.split(":").map(Number);
    let current = startHour * 60 + startMinute;
    const finish = endHour * 60 + endMinute;
    const slots = [];
    while (current < finish) {
      const hours = String(Math.floor(current / 60)).padStart(2, "0");
      const minutes = String(current % 60).padStart(2, "0");
      slots.push({ scheduleId: schedule.id, time: `${hours}:${minutes}`, booked: false });
      current += 30;
    }
    return slots;
  }
  async function loadAvailableSlots() {
    const slotList = $("slotList");
    const doctorId = $("bookingDoctorId")?.value || $("doctorSelect")?.value;
    const date = $("appointmentDate")?.value;
    if (!slotList) {
      return;
    }
    resetSelectedTime();
    if (!doctorId) {
      showSlotPlaceholder("Vui lòng chọn bác sĩ trước.");
      return;
    }
    if (!date) {
      showSlotPlaceholder("Chọn ngày để xem giờ khám.");
      return;
    }
    showSlotPlaceholder('<i class="fa-solid fa-spinner fa-spin"></i> Đang tải giờ khám...');
    try {
      const slots = await fetchSlots(doctorId, date);
      if (!slots.length) {
        showSlotPlaceholder("Bác sĩ không có lịch khám trong ngày này.");
        return;
      }
      slotList.innerHTML = slots
        .map((slot) => `
          <button
            type="button"
            class="appointment-slot ${slot.available ? "" : "is-booked"}"
            data-schedule-id="${slot.scheduleId}"
            data-time="${slot.time}"
            ${slot.available ? "" : "disabled"}
          >${slot.time}</button>
        `)
        .join("");
    } catch (error) {
      console.error("LOAD SLOTS ERROR:", error);
      showSlotPlaceholder("Không thể tải giờ khám. Vui lòng thử lại.");
    }
  }
  /* ---------- Tạo lịch hẹn ---------- */
  async function submitAppointment(event) {
    event.preventDefault();
    clearBookingMessage();
    const user = getCurrentUser();
    if (!user) {
      alert("Bạn cần đăng nhập trước khi đặt lịch.");
      window.location.href = "login.html";
      return;
    }
    const doctorId = $("bookingDoctorId")?.value || $("doctorSelect")?.value;
    const date = $("appointmentDate")?.value;
    const scheduleId = $("selectedScheduleId")?.value;
    const appointmentTime = $("selectedAppointmentTime")?.value;
    const reason = $("appointmentReason")?.value.trim() || "";
    if (!doctorId) return bookingMessage("Vui lòng chọn bác sĩ.");
    if (!date) return bookingMessage("Vui lòng chọn ngày khám.");
    if (!scheduleId || !appointmentTime) return bookingMessage("Vui lòng chọn giờ khám.");
    const submitButton = $("appointmentForm").querySelector('button[type="submit"]');
    const oldButtonHtml = submitButton?.innerHTML;
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        Đang đặt lịch...
      `;
    }
    try {
      const payload = {
        patient_id: Number(user.id),
        doctor_id: Number(doctorId),
        schedule_id: Number(scheduleId),
        appointment_time: appointmentTime,
        reason: reason || null
      };
      console.log("Dữ liệu đặt lịch gửi API:", payload);
      const result = await apiFetch("/api/appointments", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const reasonInput = $("appointmentReason");
      if (reasonInput) reasonInput.value = "";
      // Tải lại danh sách giờ (giờ vừa đặt sẽ bị khóa), rồi mới báo thành công
      await loadAvailableSlots();
      bookingMessage(
        result?.message || "Đặt lịch khám thành công. Lịch hẹn đang chờ xác nhận.",
        "success"
      );
    } catch (error) {
      console.error("CREATE APPOINTMENT ERROR:", error);
      bookingMessage(error.message || "Không thể đặt lịch khám.");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.innerHTML = oldButtonHtml;
      }
    }
  }
})();