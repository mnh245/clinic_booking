(() => {
    "use strict";

    const $ = (selector) => document.querySelector(selector);

    let doctors = [];
    let specialties = [];
    let loading = false;

    document.addEventListener("DOMContentLoaded", init);

    async function init() {
        bindEvents();

        try {
            const session = await apiFetch("/api/session", {
                cache: "no-store"
            });

            const user = session?.user || session?.data?.user;

            if (!user) {
                window.location.href = "login.html";
                return;
            }

            if (String(user.role || "").toUpperCase() !== "ADMIN") {
                window.location.href = "home.html";
                return;
            }

            await loadData();
        } catch (error) {
            console.error("DOCTOR MANAGEMENT INIT ERROR:", error);

            showMessage(
                error.message || "Không thể kiểm tra phiên đăng nhập.",
                "error"
            );

            if (
                error.message &&
                /session|đăng nhập|login/i.test(error.message)
            ) {
                window.location.href = "login.html";
            }
        }
    }

    function bindEvents() {
        $("#doctorMgmtForm").addEventListener(
            "submit",
            saveDoctor
        );

        $("#doctorMgmtForm").addEventListener(
            "reset",
            () => setTimeout(resetEditMode, 0)
        );

        $("#doctorMgmtCancel").addEventListener(
            "click",
            cancelEdit
        );

        $("#doctorMgmtRefresh").addEventListener(
            "click",
            loadData
        );

        $("#doctorMgmtTableBody").addEventListener(
            "click",
            handleTableAction
        );
    }

    /* =====================================================
       TẢI DỮ LIỆU
    ===================================================== */

    function extractArray(result) {
        if (Array.isArray(result)) return result;
        if (Array.isArray(result?.data)) return result.data;
        if (Array.isArray(result?.doctors)) return result.doctors;
        if (Array.isArray(result?.specialties)) return result.specialties;

        return [];
    }

    async function loadData() {
        if (loading) return;

        loading = true;
        setButtonLoading(
            "#doctorMgmtRefresh",
            true,
            "Đang tải..."
        );

        try {
            const [doctorResult, specialtyResult] =
                await Promise.all([
                    apiFetch("/api/admin/doctors", {
                        cache: "no-store"
                    }),
                    apiFetch("/api/admin/specialties", {
                        cache: "no-store"
                    })
                ]);

            doctors = extractArray(doctorResult);
            specialties = extractArray(specialtyResult);

            populateSpecialties();
            renderDoctors();

            clearMessage();
        } catch (error) {
            console.error("LOAD DOCTORS ERROR:", error);

            showMessage(
                error.message || "Không thể tải dữ liệu bác sĩ.",
                "error"
            );
        } finally {
            loading = false;

            setButtonLoading(
                "#doctorMgmtRefresh",
                false,
                '<i class="fa-solid fa-rotate"></i> Làm mới'
            );
        }
    }

    function populateSpecialties() {
        const select = $("#doctorMgmtSpecialty");
        const currentValue = select.value;

        select.innerHTML = `
            <option value="">-- Chọn chuyên khoa --</option>
        `;

        specialties.forEach((specialty) => {
            const option = document.createElement("option");

            option.value = String(specialty.id);
            option.textContent = specialty.name || "";

            select.appendChild(option);
        });

        if (
            currentValue &&
            specialties.some(
                (item) => String(item.id) === currentValue
            )
        ) {
            select.value = currentValue;
        }
    }

    /* =====================================================
       HIỂN THỊ DANH SÁCH
    ===================================================== */

    function renderDoctors() {
        const body = $("#doctorMgmtTableBody");

        if (!doctors.length) {
            body.innerHTML = `
                <tr>
                    <td colspan="6" class="doctor-empty">
                        <i class="fa-solid fa-user-doctor"></i>
                        Chưa có bác sĩ trong hệ thống.
                    </td>
                </tr>
            `;

            return;
        }

        body.innerHTML = doctors.map((doctor) => `
            <tr>
                <td>
                    <span class="doctor-name">
                        ${escapeHtml(doctor.full_name || "Bác sĩ")}
                    </span>

                    <span class="doctor-subtext">
                        ${escapeHtml(doctor.phone || "Chưa có số điện thoại")}
                    </span>
                </td>

                <td>
                    ${escapeHtml(
                        doctor.specialty_name || "Chưa gán chuyên khoa"
                    )}
                </td>

                <td>${escapeHtml(doctor.email || "")}</td>

                <td>${escapeHtml(doctor.license_number || "")}</td>

                <td>${Number(doctor.experience_years || 0)} năm</td>

                <td>
                    <div class="doctor-table-actions">
                        <button
                            type="button"
                            class="table-action"
                            data-doctor-action="edit"
                            data-id="${Number(doctor.id)}"
                        >
                            <i class="fa-solid fa-pen"></i>
                            Sửa
                        </button>

                        <button
                            type="button"
                            class="table-action delete"
                            data-doctor-action="delete"
                            data-id="${Number(doctor.id)}"
                        >
                            <i class="fa-solid fa-trash"></i>
                            Xóa
                        </button>
                    </div>
                </td>
            </tr>
        `).join("");
    }

    /* =====================================================
       THÊM / SỬA BÁC SĨ
    ===================================================== */

    async function saveDoctor(event) {
        event.preventDefault();

        const id = $("#doctorMgmtId").value.trim();
        const password = $("#doctorMgmtPassword").value;

        const payload = {
            full_name: $("#doctorMgmtName").value.trim(),
            email: $("#doctorMgmtEmail").value
                .trim()
                .toLowerCase(),
            phone: $("#doctorMgmtPhone").value.trim() || null,
            specialty_id: Number(
                $("#doctorMgmtSpecialty").value
            ),
            license_number: $("#doctorMgmtLicense").value.trim(),
            experience_years: Number(
                $("#doctorMgmtExperience").value || 0
            ),
            qualification:
                $("#doctorMgmtQualification").value.trim() || null,
            avatar: $("#doctorMgmtAvatar").value.trim() || null,
            introduction:
                $("#doctorMgmtIntroduction").value.trim() || null
        };

        if (
            payload.full_name.length < 2 ||
            payload.full_name.length > 100
        ) {
            showMessage(
                "Họ tên phải có từ 2 đến 100 ký tự.",
                "error"
            );

            $("#doctorMgmtName").focus();
            return;
        }

        if (
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)
        ) {
            showMessage("Email không hợp lệ.", "error");
            $("#doctorMgmtEmail").focus();
            return;
        }

        if (!payload.specialty_id) {
            showMessage("Vui lòng chọn chuyên khoa.", "error");
            $("#doctorMgmtSpecialty").focus();
            return;
        }

        if (!payload.license_number) {
            showMessage(
                "Vui lòng nhập số giấy phép hành nghề.",
                "error"
            );

            $("#doctorMgmtLicense").focus();
            return;
        }

        if (!id && password.length < 8) {
            showMessage(
                "Mật khẩu ban đầu phải có ít nhất 8 ký tự.",
                "error"
            );

            $("#doctorMgmtPassword").focus();
            return;
        }

        if (id && password && password.length < 8) {
            showMessage(
                "Mật khẩu mới phải có ít nhất 8 ký tự.",
                "error"
            );

            $("#doctorMgmtPassword").focus();
            return;
        }

        if (password) {
            payload.password = password;
        }

        setButtonLoading(
            "#doctorMgmtSave",
            true,
            "Đang lưu..."
        );

        try {
            const isEditing = Boolean(id);

            const url = isEditing
                ? `/api/admin/doctors/${encodeURIComponent(id)}`
                : "/api/admin/doctors";

            const result = await apiFetch(url, {
                method: isEditing ? "PUT" : "POST",
                body: JSON.stringify(payload)
            });

            showMessage(
                result.message ||
                    (
                        isEditing
                            ? "Cập nhật bác sĩ thành công."
                            : "Thêm bác sĩ thành công."
                    ),
                "success"
            );

            $("#doctorMgmtForm").reset();
            resetEditMode();

            await loadData();
        } catch (error) {
            console.error("SAVE DOCTOR ERROR:", error);

            showMessage(
                error.message || "Không thể lưu thông tin bác sĩ.",
                "error"
            );
        } finally {
            setButtonLoading(
                "#doctorMgmtSave",
                false,
                $("#doctorMgmtId").value
                    ? '<i class="fa-solid fa-floppy-disk"></i> Lưu thay đổi'
                    : '<i class="fa-solid fa-user-plus"></i> Thêm bác sĩ'
            );
        }
    }

    function editDoctor(doctor) {
        $("#doctorMgmtId").value = String(doctor.id);

        $("#doctorMgmtName").value =
            doctor.full_name || "";

        $("#doctorMgmtEmail").value =
            doctor.email || "";

        $("#doctorMgmtPhone").value =
            doctor.phone || "";

        $("#doctorMgmtSpecialty").value =
            String(doctor.specialty_id || "");

        $("#doctorMgmtLicense").value =
            doctor.license_number || "";

        $("#doctorMgmtExperience").value =
            Number(doctor.experience_years || 0);

        $("#doctorMgmtQualification").value =
            doctor.qualification || "";

        $("#doctorMgmtAvatar").value =
            doctor.avatar || "";

        $("#doctorMgmtIntroduction").value =
            doctor.introduction || "";

        $("#doctorMgmtPassword").value = "";
        $("#doctorMgmtPassword").required = false;

        $("#doctorMgmtPasswordHint").textContent =
            "Để trống nếu không muốn đổi mật khẩu.";

        $("#doctorMgmtFormTitle").textContent =
            "Chỉnh sửa thông tin bác sĩ";

        $("#doctorMgmtSave").innerHTML =
            '<i class="fa-solid fa-floppy-disk"></i> Lưu thay đổi';

        $("#doctorMgmtCancel").hidden = false;

        $("#doctorMgmtFormSection").scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }

    function cancelEdit() {
        $("#doctorMgmtForm").reset();
        resetEditMode();

        clearMessage();
    }

    function resetEditMode() {
        $("#doctorMgmtId").value = "";

        $("#doctorMgmtPassword").required = true;
        $("#doctorMgmtPassword").value = "";

        $("#doctorMgmtPasswordHint").textContent =
            "Bắt buộc khi thêm bác sĩ; để trống khi sửa nếu không đổi mật khẩu.";

        $("#doctorMgmtFormTitle").textContent =
            "Thêm bác sĩ mới";

        $("#doctorMgmtSave").innerHTML =
            '<i class="fa-solid fa-user-plus"></i> Thêm bác sĩ';

        $("#doctorMgmtCancel").hidden = true;
    }

    /* =====================================================
       XÓA BÁC SĨ
    ===================================================== */

    async function handleTableAction(event) {
        const button = event.target.closest("[data-doctor-action]");

        if (!button) return;

        const id = Number(button.dataset.id);

        const doctor = doctors.find(
            (item) => Number(item.id) === id
        );

        if (!doctor) return;

        if (button.dataset.doctorAction === "edit") {
            editDoctor(doctor);
            return;
        }

        if (button.dataset.doctorAction === "delete") {
            await deleteDoctor(doctor);
        }
    }

    async function deleteDoctor(doctor) {
        const confirmed = window.confirm(
            `Bạn có chắc muốn xóa hồ sơ bác sĩ "${doctor.full_name}"?\n\n` +
            "Chỉ bác sĩ chưa có lịch làm việc hoặc lịch hẹn mới được xóa."
        );

        if (!confirmed) return;

        try {
            const result = await apiFetch(
                `/api/admin/doctors/${encodeURIComponent(doctor.id)}`,
                { method: "DELETE" }
            );

            showMessage(
                result.message || "Xóa bác sĩ thành công.",
                "success"
            );

            await loadData();
        } catch (error) {
            console.error("DELETE DOCTOR ERROR:", error);

            showMessage(
                error.message || "Không thể xóa bác sĩ.",
                "error"
            );
        }
    }

    /* =====================================================
       THÔNG BÁO VÀ TIỆN ÍCH
    ===================================================== */

    function showMessage(message, type = "success") {
        const box = $("#doctorMgmtMessage");

        box.className =
            `doctor-page-message ${type} show`;

        box.textContent = message;

        box.scrollIntoView({
            behavior: "smooth",
            block: "nearest"
        });
    }

    function clearMessage() {
        const box = $("#doctorMgmtMessage");

        box.className = "doctor-page-message";
        box.textContent = "";
    }

    function setButtonLoading(selector, loading, html) {
        const button = $(selector);

        if (!button) return;

        button.disabled = loading;
        button.innerHTML = loading
            ? `<i class="fa-solid fa-spinner fa-spin"></i> ${escapeHtml(html)}`
            : html;
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }
})();