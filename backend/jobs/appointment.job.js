const {
    autoCancelExpiredAppointments
} = require("../controllers/appointment.controller");
// =====================================================
// JOB: TỰ ĐỘNG HỦY LỊCH PENDING QUÁ GIỜ KHÁM
// Chạy ngay khi server khởi động, sau đó mỗi 1 phút.
// =====================================================

const INTERVAL_MS = 60 * 1000;

let timer = null;
let running = false;

async function runOnce() {
    // Tránh chạy chồng nếu lần trước chưa xong
    if (running) {
        return;
    }
    running = true;
    try {
        const cancelled = await autoCancelExpiredAppointments();
        if (cancelled > 0) {
            console.log(
                `AUTO CANCEL: đã hủy ${cancelled} lịch PENDING quá giờ.`
            );
        }
    } catch (error) {
        console.error(
            "AUTO CANCEL JOB ERROR:",
            error.message
        );
    } finally {
        running = false;
    }
}

function startAppointmentJobs() {
    if (timer) {
        return;
    }
    runOnce();
    timer = setInterval(runOnce, INTERVAL_MS);
    // Không giữ process sống chỉ vì job này
    if (typeof timer.unref === "function") {
        timer.unref();
    }
}

function stopAppointmentJobs() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}

module.exports = {
    startAppointmentJobs,
    stopAppointmentJobs
};