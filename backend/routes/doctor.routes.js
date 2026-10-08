const express = require("express");

const router = express.Router();

const {
    getDoctors,
    getDoctorById,
    getDoctorSchedules,
    getDoctorDashboard,
    getDoctorAppointments,
    updateDoctorAppointmentStatus
} = require("../controllers/doctor.controller");
// =====================================================
// CÁC API /me PHẢI ĐẶT TRƯỚC /:id
// =====================================================
// Dashboard bác sĩ
router.get(
    "/me/dashboard",
    getDoctorDashboard
);
// Lịch hẹn của bác sĩ
router.get(
    "/me/appointments",
    getDoctorAppointments
);
// Cập nhật trạng thái lịch hẹn
router.patch(
    "/me/appointments/:id/status",
    updateDoctorAppointmentStatus
);
// =====================================================
// API CÔNG KHAI
// =====================================================
// Danh sách bác sĩ
router.get(
    "/",
    getDoctors
);
// Chi tiết bác sĩ
router.get(
    "/:id",
    getDoctorById
);
// Lịch làm việc công khai của bác sĩ
router.get(
    "/:id/schedules",
    getDoctorSchedules
);


module.exports = router;