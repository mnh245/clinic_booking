(() => {
    "use strict";

    const $ = (selector) => document.querySelector(selector);

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

            await loadSpecialties();
        } catch (error) {
            console.error("SPECIALTY INIT ERROR:", error);
            showMessage(
                error.message || "Không thể khởi tạo trang chuyên khoa.",
                "error"
            );
        }
    }

    function bindEvents() {
        $("#specialtyForm").addEventListener("submit", saveSpecialty);

        $("#specialtyForm").addEventListener("reset", () => {
            setTimeout(resetEditMode, 0);
        });

        $("#specialtyCancelEdit").addEventListener("click", cancelEdit);

        $("#specialtyRefreshButton").addEventListener(
            "click",
            loadSpecialties
        );

        $("#specialtyTableBody").addEventListener(
            "click",
            handleTableAction
        );
    }

    async function loadSpecialties() {
        if (loading) return;
        loading = true;

        setButtonLoading(
            "#specialtyRefreshButton",
            true,
            "Đang tải..."
        );

        try {
            const result = await apiFetch("/api/admin/specialties", {
                cache: "no-store"
            });

            specialties = extractArray(result);
            renderSpecialties();
            clearMessage();
        } catch (error) {
            console.error("LOAD SPECIALTIES ERROR:", error);
            showMessage(
                error.message || "Không thể tải danh sách chuyên khoa.",
                "error"
            );
        } finally {
            loading = false;

            setButtonLoading(
                "#specialtyRefreshButton",
                false,
                '<i class="fa-solid fa-rotate"></i> Làm mới'
            );
        }
    }

    function extractArray(result) {
        if (Array.isArray(result)) return result;
        if (Array.isArray(result?.data)) return result.data;
        if (Array.isArray(result?.specialties)) return result.specialties;
        return [];
    }

    async function saveSpecialty(event) {
        event.preventDefault();

        const id = $("#specialtyId").value.trim();

        const payload = {
            name: $("#specialtyName").value.trim(),
            description:
                $("#specialtyDescription").value.trim() || null
        };

        if (payload.name.length < 2 || payload.name.length > 100) {
            showMessage(
                "Tên chuyên khoa phải có từ 2 đến 100 ký tự.",
                "error"
            );
            $("#specialtyName").focus();
            return;
        }

        if (payload.description && payload.description.length > 1000) {
            showMessage("Mô tả tối đa 1.000 ký tự.", "error");
            return;
        }

        setButtonLoading(
            "#specialtySaveButton",
            true,
            "Đang lưu..."
        );

        try {
            const editing = Boolean(id);

            const result = await apiFetch(
                editing
                    ? `/api/admin/specialties/${encodeURIComponent(id)}`
                    : "/api/admin/specialties",
                {
                    method: editing ? "PUT" : "POST",
                    body: JSON.stringify(payload)
                }
            );

            showMessage(
                result.message ||
                    (editing
                        ? "Cập nhật chuyên khoa thành công."
                        : "Thêm chuyên khoa thành công."),
                "success"
            );

            $("#specialtyForm").reset();
            resetEditMode();

            await loadSpecialties();
        } catch (error) {
            console.error("SAVE SPECIALTY ERROR:", error);
            showMessage(
                error.message || "Không thể lưu chuyên khoa.",
                "error"
            );
        } finally {
            setButtonLoading(
                "#specialtySaveButton",
                false,
                $("#specialtyId").value
                    ? '<i class="fa-solid fa-floppy-disk"></i> Lưu thay đổi'
                    : '<i class="fa-solid fa-plus"></i> Thêm chuyên khoa'
            );
        }
    }

    function renderSpecialties() {
        const body = $("#specialtyTableBody");

        if (!specialties.length) {
            body.innerHTML = `
                <tr>
                    <td colspan="4" class="specialty-empty">
                        Chưa có chuyên khoa trong hệ thống.
                    </td>
                </tr>
            `;
            return;
        }

        body.innerHTML = specialties.map((item) => `
            <tr>
                <td><strong>${escapeHtml(item.name)}</strong></td>
                <td>${escapeHtml(item.description || "")}</td>
                <td>${Number(item.doctor_count || 0)}</td>
                <td>
                    <div class="specialty-table-actions">
                        <button type="button"
                                class="table-action"
                                data-action="edit"
                                data-id="${Number(item.id)}">
                            <i class="fa-solid fa-pen"></i>
                            Sửa
                        </button>

                        <button type="button"
                                class="table-action delete"
                                data-action="delete"
                                data-id="${Number(item.id)}">
                            <i class="fa-solid fa-trash"></i>
                            Xóa
                        </button>
                    </div>
                </td>
            </tr>
        `).join("");
    }

    function handleTableAction(event) {
        const button = event.target.closest("button[data-action]");
        if (!button) return;

        const id = Number(button.dataset.id);
        const specialty = specialties.find(
            (item) => Number(item.id) === id
        );

        if (!specialty) return;

        if (button.dataset.action === "edit") {
            editSpecialty(specialty);
        } else if (button.dataset.action === "delete") {
            deleteSpecialty(specialty);
        }
    }

    function editSpecialty(item) {
        $("#specialtyId").value = item.id;
        $("#specialtyName").value = item.name || "";
        $("#specialtyDescription").value = item.description || "";

        $("#specialtyFormTitle").textContent = "Chỉnh sửa chuyên khoa";
        $("#specialtySaveButton").innerHTML =
            '<i class="fa-solid fa-floppy-disk"></i> Lưu thay đổi';
        $("#specialtyCancelEdit").hidden = false;

        $("#specialtyForm").scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }

    function cancelEdit() {
        $("#specialtyForm").reset();
        resetEditMode();
        clearMessage();
    }

    function resetEditMode() {
        $("#specialtyId").value = "";
        $("#specialtyFormTitle").textContent = "Thêm chuyên khoa mới";
        $("#specialtySaveButton").innerHTML =
            '<i class="fa-solid fa-plus"></i> Thêm chuyên khoa';
        $("#specialtyCancelEdit").hidden = true;
    }

    async function deleteSpecialty(item) {
        const confirmed = window.confirm(
            `Bạn có chắc muốn xóa chuyên khoa "${item.name}"?\n\n` +
            "Chuyên khoa đang được bác sĩ sử dụng sẽ không thể xóa."
        );

        if (!confirmed) return;

        try {
            const result = await apiFetch(
                `/api/admin/specialties/${encodeURIComponent(item.id)}`,
                { method: "DELETE" }
            );

            showMessage(
                result.message || "Đã xóa chuyên khoa.",
                "success"
            );

            await loadSpecialties();
        } catch (error) {
            console.error("DELETE SPECIALTY ERROR:", error);
            showMessage(
                error.message || "Không thể xóa chuyên khoa.",
                "error"
            );
        }
    }

    function showMessage(message, type = "success") {
        const box = $("#specialtyMessage");
        box.className = `specialty-message ${type} show`;
        box.textContent = message;
    }

    function clearMessage() {
        const box = $("#specialtyMessage");
        box.className = "specialty-message";
        box.textContent = "";
    }

    function setButtonLoading(selector, loading, content) {
        const button = $(selector);
        if (!button) return;

        button.disabled = loading;

        button.innerHTML = loading
            ? `<i class="fa-solid fa-spinner fa-spin"></i> ${escapeHtml(content)}`
            : content;
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