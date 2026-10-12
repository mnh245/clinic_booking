/*
=====================================================
CLINIC BOOKING - TRANG CHUYÊN KHOA
=====================================================
URL: specialty.html?specialty=<slug>   (vd: tim-mach)
     specialty.html?id=<specialty_id>  (cũng được)

1. Xác định chuyên khoa từ URL
2. Tải bác sĩ → lọc theo chuyên khoa
3. Hiển thị mô tả khoa, bác sĩ trong khoa, chuyên khoa khác
=====================================================
*/
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const AVATAR_STYLE =
    "width:100%;height:100%;object-fit:cover;border-radius:inherit;";

  /* =====================================================
     MÔ TẢ CHUYÊN KHOA
     Ưu tiên dữ liệu từ API (specialty_description / description).
     Nếu API chưa có, dùng mô tả mặc định dưới đây (khớp theo từ khóa
     trong tên khoa, đã bỏ dấu).
     ===================================================== */
  const DEPARTMENT_INFO = [
    {
      keys: ["tim mach", "tim"],
      summary:
        "Chuyên khoa Tim mạch chẩn đoán, điều trị và theo dõi các bệnh lý về tim và hệ thống mạch máu, đồng thời tư vấn phòng ngừa nguy cơ tim mạch.",
      conditions: ["Tăng huyết áp", "Bệnh mạch vành, đau thắt ngực", "Rối loạn nhịp tim", "Suy tim"],
      services: ["Khám và tư vấn tim mạch", "Đo điện tim, siêu âm tim", "Theo dõi huyết áp", "Tầm soát nguy cơ tim mạch"]
    },
    {
      keys: ["nhi"],
      summary:
        "Chuyên khoa Nhi chăm sóc sức khỏe cho trẻ sơ sinh, trẻ nhỏ và thanh thiếu niên, từ khám bệnh thông thường đến theo dõi tăng trưởng và tiêm chủng.",
      conditions: ["Sốt, ho, viêm đường hô hấp", "Rối loạn tiêu hóa", "Chậm tăng trưởng, dinh dưỡng", "Dị ứng, viêm da ở trẻ"],
      services: ["Khám nhi tổng quát", "Theo dõi tăng trưởng", "Tư vấn dinh dưỡng", "Tư vấn tiêm chủng"]
    },
    {
      keys: ["than kinh"],
      summary:
        "Chuyên khoa Thần kinh điều trị các bệnh lý của não, tủy sống và hệ thần kinh ngoại biên, giúp kiểm soát triệu chứng và cải thiện chất lượng sống.",
      conditions: ["Đau đầu, đau nửa đầu", "Mất ngủ, rối loạn giấc ngủ", "Chóng mặt, rối loạn tiền đình", "Di chứng đột quỵ"],
      services: ["Khám thần kinh", "Tư vấn điều trị đau đầu", "Theo dõi bệnh mạn tính", "Hướng dẫn phục hồi chức năng"]
    },
    {
      keys: ["da lieu", "da"],
      summary:
        "Chuyên khoa Da liễu khám và điều trị các bệnh về da, tóc, móng, đồng thời tư vấn chăm sóc da đúng cách.",
      conditions: ["Mụn trứng cá", "Viêm da, chàm, dị ứng", "Nấm da, ghẻ", "Rụng tóc, bệnh về móng"],
      services: ["Khám da liễu", "Tư vấn chăm sóc da", "Điều trị mụn", "Theo dõi bệnh da mạn tính"]
    },
    {
      keys: ["tai mui hong", "tai", "mui", "hong"],
      summary:
        "Chuyên khoa Tai Mũi Họng chẩn đoán và điều trị các bệnh lý vùng tai, mũi, họng, thanh quản và các cơ quan lân cận.",
      conditions: ["Viêm mũi dị ứng, viêm xoang", "Viêm họng, viêm amidan", "Viêm tai giữa", "Ù tai, giảm thính lực" ],
      services: ["Khám và nội soi tai mũi họng", "Điều trị viêm nhiễm", "Tư vấn bệnh dị ứng", "Theo dõi sau điều trị"]
    },
    {
      keys: ["ngoai"],
      summary:
        "Chuyên khoa Ngoại khám, tư vấn và chỉ định điều trị phẫu thuật hoặc thủ thuật cho các bệnh lý cần can thiệp ngoại khoa.",
      conditions: ["Bệnh lý tiêu hóa cần phẫu thuật", "U, nang, áp xe", "Chấn thương phần mềm", "Thoát vị"],
      services: ["Khám ngoại tổng quát", "Tư vấn phẫu thuật", "Thủ thuật nhỏ", "Chăm sóc hậu phẫu"]
    },
    {
      keys: ["noi"],
      summary:
        "Chuyên khoa Nội khám và điều trị không phẫu thuật các bệnh lý của nhiều cơ quan như tiêu hóa, hô hấp, nội tiết và chuyển hóa.",
      conditions: ["Rối loạn tiêu hóa, dạ dày", "Tiểu đường, rối loạn mỡ máu", "Bệnh hô hấp", "Bệnh mạn tính cần theo dõi"],
      services: ["Khám nội tổng quát", "Tư vấn bệnh mạn tính", "Theo dõi điều trị dài hạn", "Khám sức khỏe định kỳ"]
    },
    {
      keys: ["rang"],
      summary:
        "Chuyên khoa Răng Hàm Mặt chăm sóc sức khỏe răng miệng, từ khám định kỳ, điều trị sâu răng đến tư vấn chỉnh nha.",
      conditions: ["Sâu răng, viêm tủy", "Viêm nướu, nha chu", "Răng mọc lệch", "Mất răng"],
      services: ["Khám răng miệng", "Lấy cao răng", "Trám răng", "Tư vấn chỉnh nha, phục hình"]
    }
  ];

  const DEFAULT_INFO = {
    summary:
      "Chuyên khoa với đội ngũ bác sĩ giàu kinh nghiệm, sẵn sàng thăm khám, tư vấn và xây dựng phác đồ điều trị phù hợp với từng người bệnh.",
    conditions: [],
    services: ["Khám và tư vấn chuyên khoa", "Theo dõi điều trị", "Đặt lịch khám trực tuyến"]
  };

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
      .replace(/[̀-ͯ]/g, "")
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

  function extractArray(result) {
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.data)) return result.data;
    if (Array.isArray(result?.doctors)) return result.doctors;

    return [];
  }

  function doctorAvatarHtml(doctor) {
    if (!doctor.avatar) {
      return '<i class="fa-solid fa-user-doctor"></i>';
    }

    return `<img src="${escapeHtml(doctor.avatar)}" alt="BS. ${escapeHtml(doctor.full_name || "Bác sĩ")}" style="${AVATAR_STYLE}">`;
  }

  /** Chọn mô tả mặc định theo từ khóa trong tên khoa. */
  function findDefaultInfo(name) {
    const normalized = normalizeText(name);

    // Khớp theo từ nguyên vẹn (tránh "truyen nhiem" bị nhận nhầm là "nhi")
    const padded = ` ${normalized} `;
    const found = DEPARTMENT_INFO.find((item) =>
      item.keys.some((key) => padded.includes(` ${key} `))
    );

    return found || DEFAULT_INFO;
  }

  /* =====================================================
     1. ĐĂNG NHẬP / ĐĂNG XUẤT (giống trang chủ)
     ===================================================== */
  function getCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch (error) {
      localStorage.removeItem("user");
      return null;
    }
  }

  function setupLoginState() {
    const user = getCurrentUser();
    const loggedIn = Boolean(user);

    if ($("loginLink")) $("loginLink").style.display = loggedIn ? "none" : "inline-flex";
    if ($("registerLink")) $("registerLink").style.display = loggedIn ? "none" : "inline-flex";
    if ($("userInfo")) $("userInfo").style.display = loggedIn ? "flex" : "none";

    if (loggedIn && $("welcomeUser")) {
      $("welcomeUser").textContent =
        "Xin chào, " + (user.full_name || user.fullName || user.email || "bạn");
    }

    $("logoutButton")?.addEventListener("click", async () => {
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
    });
  }

  /* =====================================================
     2. TẢI DỮ LIỆU
     ===================================================== */
  /** Gom danh sách chuyên khoa từ danh sách bác sĩ. */
  function buildSpecialties(doctors) {
    const map = new Map();

    doctors.forEach((doctor) => {
      if (!doctor.specialty_id || !doctor.specialty_name) {
        return;
      }

      if (!map.has(doctor.specialty_id)) {
        map.set(doctor.specialty_id, {
          id: doctor.specialty_id,
          name: doctor.specialty_name,
          slug: createSpecialtySlug(doctor.specialty_name),
          description:
            doctor.specialty_description || doctor.description_specialty || "",
          count: 0
        });
      }

      map.get(doctor.specialty_id).count++;
    });

    return Array.from(map.values());
  }

  function findSpecialty(specialties) {
    const params = new URLSearchParams(window.location.search);
    const slug = createSpecialtySlug(params.get("specialty") || "");
    const id = params.get("id");

    if (slug) {
      const bySlug = specialties.find((item) => item.slug === slug);
      if (bySlug) return bySlug;
    }

    if (id) {
      const byId = specialties.find((item) => String(item.id) === String(id));
      if (byId) return byId;
    }

    return null;
  }

  async function init() {
    setupLoginState();

    try {
      const doctors = extractArray(await apiFetch("/api/doctors"));
      const specialties = buildSpecialties(doctors);
      const specialty = findSpecialty(specialties);

      renderOtherSpecialties(specialties, specialty);

      if (!specialty) {
        renderNotFound();
        return;
      }

      const members = doctors
        .filter((doctor) => String(doctor.specialty_id) === String(specialty.id))
        .sort(
          (a, b) =>
            Number(b.experience_years || 0) - Number(a.experience_years || 0) ||
            String(a.full_name || "").localeCompare(String(b.full_name || ""), "vi")
        );

      renderSpecialty(specialty, members);
      renderDoctors(specialty, members);
    } catch (error) {
      console.error("LOAD SPECIALTY ERROR:", error);
      renderError(error);
    }
  }

  /* =====================================================
     3. HIỂN THỊ
     ===================================================== */
  function renderSpecialty(specialty, members) {
    const info = findDefaultInfo(specialty.name);
    const summary = specialty.description || info.summary;
    const icon = getSpecialtyIcon(specialty.name);

    const years = members
      .map((doctor) => Number(doctor.experience_years))
      .filter((value) => Number.isFinite(value));
    const maxYears = years.length ? Math.max(...years) : null;

    document.title = `${specialty.name} | Clinic Booking`;
    $("breadcrumbName").textContent = specialty.name;

    $("deptHero").innerHTML = `
      <div class="dept-icon"><i class="fa-solid ${icon}"></i></div>
      <div>
        <h2>Chuyên khoa ${escapeHtml(specialty.name)}</h2>
        <p class="dept-lead">${escapeHtml(summary)}</p>
        <div class="dept-stats">
          <span class="chip">
            <i class="fa-solid fa-user-doctor"></i>
            ${members.length} bác sĩ
          </span>
          ${
            maxYears !== null
              ? `<span class="chip">
                   <i class="fa-regular fa-clock"></i>
                   Kinh nghiệm cao nhất: ${maxYears} năm
                 </span>`
              : ""
          }
        </div>
      </div>
    `;

    const listHtml = (items) =>
      items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");

    const cards = [];

    if (info.conditions.length) {
      cards.push(`
        <div class="card dept-info-card">
          <h3><i class="fa-solid fa-notes-medical"></i> Bệnh lý thường gặp</h3>
          <ul>${listHtml(info.conditions)}</ul>
        </div>
      `);
    }

    cards.push(`
      <div class="card dept-info-card">
        <h3><i class="fa-solid fa-stethoscope"></i> Dịch vụ khám</h3>
        <ul>${listHtml(info.services)}</ul>
      </div>
    `);

    cards.push(`
      <div class="card dept-info-card">
        <h3><i class="fa-solid fa-circle-info"></i> Trước khi đến khám</h3>
        <ul>
          <li>Chọn bác sĩ và khung giờ còn trống</li>
          <li>Mang theo giấy tờ tùy thân, hồ sơ bệnh án cũ (nếu có)</li>
          <li>Đến sớm 10–15 phút để làm thủ tục</li>
        </ul>
      </div>
    `);

    const infoBox = $("deptInfo");
    infoBox.innerHTML = cards.join("");
    infoBox.hidden = false;
  }

  function renderDoctors(specialty, members) {
    const grid = $("doctorList");

    $("doctorsTitle").textContent = `Bác sĩ khoa ${specialty.name}`;
    $("doctorsSubtitle").textContent = members.length
      ? `${members.length} bác sĩ hiện đang công tác tại chuyên khoa này.`
      : "Danh sách bác sĩ của chuyên khoa này.";

    if (!members.length) {
      grid.innerHTML = `
        <div class="card state-box">
          <i class="fa-solid fa-user-doctor"></i>
          <h3>Chưa có bác sĩ trong khoa</h3>
          <p>Hiện chuyên khoa này chưa có bác sĩ nào hoạt động. Bạn có thể xem các chuyên khoa khác.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = members
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
              <div class="doctor-avatar">${doctorAvatarHtml(doctor)}</div>
              <h3>BS. ${escapeHtml(doctor.full_name || "Bác sĩ")}</h3>
              <div class="doctor-specialty">${escapeHtml(doctor.specialty_name || specialty.name)}</div>
              ${
                doctor.qualification
                  ? `<div class="doctor-specialty" style="color:var(--muted);font-weight:500;">${escapeHtml(doctor.qualification)}</div>`
                  : ""
              }
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
                <a
                  class="btn btn-primary"
                  href="home.html?book=${encodeURIComponent(doctor.id)}"
                >
                  <i class="fa-solid fa-calendar-check"></i>
                  Đặt lịch
                </a>
              </div>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderOtherSpecialties(specialties, current) {
    const box = $("otherSpecialties");

    const others = specialties
      .filter((item) => !current || item.id !== current.id)
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));

    box.innerHTML = others.length
      ? others
          .map(
            (item) => `
              <a href="specialty.html?specialty=${encodeURIComponent(item.slug)}">
                <i class="fa-solid ${getSpecialtyIcon(item.name)}"></i>
                ${escapeHtml(item.name)}
                <small style="color:var(--muted)">(${item.count})</small>
              </a>
            `
          )
          .join("")
      : '<span style="color:var(--muted)">Chưa có chuyên khoa khác.</span>';
  }

  function renderNotFound() {
    $("breadcrumbName").textContent = "Không tìm thấy";
    $("deptHero").innerHTML = `
      <div class="card state-box" style="width:100%">
        <i class="fa-solid fa-circle-question"></i>
        <h3>Không tìm thấy chuyên khoa</h3>
        <p>Đường dẫn chuyên khoa không hợp lệ hoặc chuyên khoa chưa có bác sĩ. Hãy chọn một chuyên khoa khác bên dưới hoặc quay lại trang chủ.</p>
        <a href="home.html#specialties" class="btn btn-primary">
          <i class="fa-solid fa-arrow-left"></i> Về trang chủ
        </a>
      </div>
    `;
    $("deptDoctors").hidden = true;
  }

  function renderError(error) {
    $("breadcrumbName").textContent = "Lỗi";
    $("deptHero").innerHTML = `
      <div class="card state-box" style="width:100%">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <h3>Không thể tải dữ liệu</h3>
        <p>${escapeHtml(error.message || "Không thể kết nối đến hệ thống.")}</p>
        <button type="button" class="btn btn-primary" id="retryButton">
          <i class="fa-solid fa-rotate"></i> Thử lại
        </button>
      </div>
    `;
    $("deptDoctors").hidden = true;
    $("retryButton")?.addEventListener("click", () => window.location.reload());
  }

  document.addEventListener("DOMContentLoaded", init);
})();