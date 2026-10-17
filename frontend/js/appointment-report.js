(() => {
    "use strict";

    const $ = (selector) => document.querySelector(selector);

    let reportRows = [];
    let loading = false;

    let statusChart = null;
    let timelineChart = null;


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

// Vẽ lại biểu đồ theo dữ liệu báo cáo mới.
           renderCharts(
               data.summary || {},
               reportRows,
               from,
                to
);

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



/* =====================================================
   BIỂU ĐỒ BÁO CÁO
===================================================== */

function renderCharts(summary, rows, from, to) {
    if (typeof Chart === "undefined") {
        showMessage(
            "Không tải được Chart.js. Hãy kiểm tra kết nối Internet để hiển thị biểu đồ.",
            "error"
        );
        return;
    }

    renderStatusChart(summary);
    renderTimelineChart(rows, from, to);
}

/* =====================================================
   1. BIỂU ĐỒ DONUT: PHÂN BỐ TRẠNG THÁI
===================================================== */

function renderStatusChart(summary) {
    const canvas = $("#reportStatusChart");

    if (!canvas) return;

    if (statusChart) {
        statusChart.destroy();
        statusChart = null;
    }

    const values = [
        Number(summary.pending || 0),
        Number(summary.confirmed || 0),
        Number(summary.completed || 0),
        Number(summary.cancelled || 0),
        Number(summary.no_show || 0)
    ];

    statusChart = new Chart(canvas, {
        type: "doughnut",

        data: {
            labels: [
                "Chờ xác nhận",
                "Đã xác nhận",
                "Đã hoàn thành",
                "Đã hủy",
                "Không đến khám"
            ],

            datasets: [{
                data: values,

                backgroundColor: [
                    "#f59e0b",
                    "#0ea5a4",
                    "#3b82f6",
                    "#ef4444",
                    "#8b5cf6"
                ],

                borderColor: "#ffffff",
                borderWidth: 3,
                hoverOffset: 8
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            cutout: "62%",

            plugins: {
                legend: {
                    position: "bottom",

                    labels: {
                        usePointStyle: true,
                        pointStyle: "circle",
                        padding: 16
                    }
                },

                tooltip: {
                    callbacks: {
                        label(context) {
                            const value = Number(context.raw || 0);

                            const total = values.reduce(
                                (sum, item) => sum + item,
                                0
                            );

                            const percent = total
                                ? (value / total * 100).toFixed(1)
                                : "0.0";

                            return (
                                `${context.label}: ${value} lịch ` +
                                `(${percent}%)`
                            );
                        }
                    }
                }
            }
        }
    });
}

/* =====================================================
   2. BIỂU ĐỒ CỘT: SỐ LỊCH THEO THỜI GIAN
===================================================== */

function renderTimelineChart(rows, from, to) {
    const canvas = $("#reportTimelineChart");

    if (!canvas) return;

    if (timelineChart) {
        timelineChart.destroy();
        timelineChart = null;
    }

    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);

    const dayCount = Math.floor(
        (end.getTime() - start.getTime()) / 86400000
    ) + 1;

    // Tối đa 31 ngày thì hiển thị theo từng ngày.
    // Khoảng thời gian dài hơn thì tổng hợp theo tháng.
    const groupByMonth = dayCount > 31;

    const counts = new Map();

    rows.forEach((item) => {
        const dateKey = String(
            item.appointment_date || ""
        ).slice(0, 10);

        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
            return;
        }

        const key = groupByMonth
            ? dateKey.slice(0, 7)
            : dateKey;

        counts.set(
            key,
            (counts.get(key) || 0) + 1
        );
    });

    const labels = [];
    const values = [];

    if (groupByMonth) {
        const current = new Date(
            start.getFullYear(),
            start.getMonth(),
            1
        );

        const finalMonth = new Date(
            end.getFullYear(),
            end.getMonth(),
            1
        );

        while (current <= finalMonth) {
            const year = current.getFullYear();

            const month = String(
                current.getMonth() + 1
            ).padStart(2, "0");

            const key = `${year}-${month}`;

            labels.push(`${month}/${year}`);
            values.push(counts.get(key) || 0);

            current.setMonth(current.getMonth() + 1);
        }
    } else {
        const current = new Date(start);

        while (current <= end) {
            const key = localDateString(current);

            const day = String(
                current.getDate()
            ).padStart(2, "0");

            const month = String(
                current.getMonth() + 1
            ).padStart(2, "0");

            labels.push(`${day}/${month}`);
            values.push(counts.get(key) || 0);

            current.setDate(current.getDate() + 1);
        }
    }

    timelineChart = new Chart(canvas, {
        type: "bar",

        data: {
            labels,

            datasets: [{
                label: groupByMonth
                    ? "Số lịch theo tháng"
                    : "Số lịch theo ngày",

                data: values,

                backgroundColor: "#0ea5a4",
                borderColor: "#0f766e",
                borderWidth: 1,
                borderRadius: 5,

                maxBarThickness: 36
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            interaction: {
                intersect: false,
                mode: "index"
            },

            plugins: {
                legend: {
                    display: false
                },

                tooltip: {
                    callbacks: {
                        label(context) {
                            return ` ${context.raw} lịch khám`;
                        }
                    }
                }
            },

            scales: {
                x: {
                    grid: {
                        display: false
                    },

                    ticks: {
                        maxRotation: 45,
                        minRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 12
                    }
                },

                y: {
                    beginAtZero: true,

                    ticks: {
                        precision: 0
                    },

                    title: {
                        display: true,
                        text: "Số lịch khám"
                    }
                }
            }
        }
    });
}

/* =====================================================
   NGÀY THEO GIỜ ĐỊA PHƯƠNG
===================================================== */

function localDateString(date) {
    const year = date.getFullYear();

    const month = String(
        date.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
        date.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
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