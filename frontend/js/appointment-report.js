(() => {
    "use strict";

    const $ = (selector) => document.querySelector(selector);

    let reportRows = [];
    let loading = false;

    document.addEventListener("DOMContentLoaded", init);

    async function init() {
        bindEvents();
        setDefaultDates();

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

            await loadDoctors();
            await loadReport();
        } catch (error) {
            console.error("REPORT INIT ERROR:", error);

            showMessage(
                error.message || "Không thể khởi tạo báo cáo.",
                "error"
            );
        }
    }

    function bindEvents() {
        $("#reportForm").addEventListener("submit", async (event) => {
            event.preventDefault();
            await loadReport();
        });

        $("#reportRefreshButton").addEventListener(
            "click",
            loadReport
        );

        $("#reportExportButton").addEventListener(
            "click",
            exportCSV
        );
    }

    function setDefaultDates() {
        const today = new Date();

        const first = new Date(
            today.getFullYear(),
            today.getMonth(),
            1
        );

        $("#reportDateFrom").value = toDateString(first);
        $("#reportDateTo").value = toDateString(today);
    }

    function toDateString(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");

        return `${year}-${month}-${day}`;
    }

    function extractArray(result) {
        if (Array.isArray(result)) return result;
        if (Array.isArray(result?.data)) return result.data;
        if (Array.isArray(result?.doctors)) return result.doctors;
        return [];
    }

    async function loadDoctors() {
        const result = await apiFetch("/api/admin/doctors", {
            cache: "no-store"
        });

        const doctors = extractArray(result);
        const select = $("#reportDoctorId");

        select.innerHTML =
            '<option value="">Tất cả bác sĩ</option>';

        doctors.forEach((doctor) => {
            const option = document.createElement("option");

            option.value = String(doctor.id);
            option.textContent =
                `BS. ${doctor.full_name || "Bác sĩ"}`;

            select.appendChild(option);
        });
    }

    async function loadReport() {
        if (loading) return;

        const from = $("#reportDateFrom").value;
        const to = $("#reportDateTo").value;

        if (!from || !to) {
            showMessage("Vui lòng chọn đầy đủ khoảng ngày.", "error");
            return;
        }

        if (from > to) {
            showMessage(
                "Ngày bắt đầu không được lớn hơn ngày kết thúc.",
                "error"
            );
            return;
        }

        const params = new URLSearchParams({
            from,
            to
        });

        const doctorId = $("#reportDoctorId").value;
        const status = $("#reportStatus").value;

        if (doctorId) params.set("doctor_id", doctorId);
        if (status) params.set("status", status);

        loading = true;

        setButtonLoading(
            "#reportSearchButton",
            true,
            "Đang tải..."
        );

        try {
            const result = await apiFetch(
                `/api/admin/appointment-report?${params.toString()}`,
                { cache: "no-store" }
            );

            const data = result?.data || {};

            reportRows = Array.isArray(data.rows)
                ? data.rows
                : [];

            renderSummary(data.summary || {});
            renderRows();

            $("#reportDescription").textContent =
                `Từ ${formatDate(from)} đến ${formatDate(to)}. ` +
                `Danh sách hiện có ${reportRows.length} lịch.`;

            clearMessage();
        } catch (error) {
            console.error("LOAD REPORT ERROR:", error);

            showMessage(
                error.message || "Không thể tải báo cáo lịch khám.",
                "error"
            );
        } finally {
            loading = false;

            setButtonLoading(
                "#reportSearchButton",
                false,
                '<i class="fa-solid fa-filter"></i> Lọc báo cáo'
            );
        }
    }

    function renderSummary(summary) {
        $("#reportStatTotal").textContent =
            Number(summary.total || 0);

        $("#reportStatPending").textContent =
            Number(summary.pending || 0);

        $("#reportStatConfirmed").textContent =
            Number(summary.confirmed || 0);

        $("#reportStatCompleted").textContent =
            Number(summary.completed || 0);

        $("#reportStatCancelled").textContent =
            Number(summary.cancelled || 0);

        $("#reportStatNoShow").textContent =
            Number(summary.no_show || 0);
    }

    function renderRows() {
        const body = $("#reportTableBody");

        if (!reportRows.length) {
            body.innerHTML = `
                <tr>
                    <td colspan="8" class="report-empty">
                        Không có lịch khám phù hợp với điều kiện lọc.
                    </td>
                </tr>
            `;
            return;
        }

        body.innerHTML = reportRows.map((item) => `
            <tr>
                <td>${Number(item.id)}</td>
                <td>${formatDate(item.appointment_date)}</td>
                <td>${escapeHtml(item.appointment_time || "")}</td>
                <td>${escapeHtml(item.patient_name || "Chưa có tên")}</td>
                <td>${escapeHtml(
                    item.contact_phone ||
                    item.patient_phone ||
                    ""
                )}</td>
                <td>${escapeHtml(item.doctor_name || "Chưa có bác sĩ")}</td>
                <td>${escapeHtml(item.specialty_name || "")}</td>
                <td>
                    <span class="report-status ${statusClass(item.status)}">
                        ${statusLabel(item.status)}
                    </span>
                </td>
            </tr>
        `).join("");
    }

    function statusClass(status) {
        const value = String(status || "").toUpperCase();

        const classes = {
            PENDING: "pending",
            CONFIRMED: "confirmed",
            COMPLETED: "completed",
            CANCELLED: "cancelled",
            NO_SHOW: "no-show"
        };

        return classes[value] || "";
    }

    function statusLabel(status) {
        const labels = {
            PENDING: "Chờ xác nhận",
            CONFIRMED: "Đã xác nhận",
            COMPLETED: "Đã hoàn thành",
            CANCELLED: "Đã hủy",
            NO_SHOW: "Không đến khám"
        };

        const value = String(status || "").toUpperCase();

        return escapeHtml(labels[value] || value || "Chưa rõ");
    }

    function exportCSV() {
        if (!reportRows.length) {
            showMessage(
                "Không có dữ liệu để xuất CSV.",
                "error"
            );
            return;
        }

        const headers = [
            "Ma lich",
            "Ngay kham",
            "Gio kham",
            "Benh nhan",
            "So dien thoai",
            "Bac si",
            "Chuyen khoa",
            "Trang thai"
        ];

        const rows = reportRows.map((item) => [
            item.id,
            item.appointment_date,
            item.appointment_time,
            item.patient_name,
            item.contact_phone || item.patient_phone,
            item.doctor_name,
            item.specialty_name,
            statusLabel(item.status)
        ]);

        const csvCell = (value) =>
            `"${String(value ?? "").replaceAll('"', '""')}"`;

        const content = [headers, ...rows]
            .map((row) => row.map(csvCell).join(","))
            .join("\r\n");

        const blob = new Blob(
            ["\uFEFF", content],
            { type: "text/csv;charset=utf-8;" }
        );

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download =
            `bao-cao-lich-kham-${toDateString(new Date())}.csv`;

        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);
    }

    function formatDate(value) {
        if (!value) return "--";

        const match = String(value)
            .slice(0, 10)
            .match(/^(\d{4})-(\d{2})-(\d{2})$/);

        return match
            ? `${match[3]}/${match[2]}/${match[1]}`
            : escapeHtml(value);
    }

    function showMessage(message, type = "success") {
        const box = $("#reportMessage");

        box.className = `report-message ${type} show`;
        box.textContent = message;
    }

    function clearMessage() {
        const box = $("#reportMessage");

        box.className = "report-message";
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