const express = require("express");

const router = express.Router();

const scheduleController =
    require("../controllers/schedule.controller");
// =====================================================
// DANH SÁCH 4 CA
// =====================================================

router.get(
    "/schedules/shifts",
    scheduleController.getShiftTypes
);
// =====================================================
// LỊCH CỦA BÁC SĨ
// =====================================================

router.get(
    "/schedules/my",
    scheduleController.getMySchedules
);
// =====================================================
// ADMIN XEM TOÀN BỘ
// =====================================================

router.get(
    "/schedules/admin",
    scheduleController.getAllSchedules
);
// =====================================================
// DUYỆT / TỪ CHỐI
// Phải đặt trước /:id
// =====================================================

router.patch(
    "/schedules/:id/approve",
    scheduleController.approveSchedule
);


router.patch(
    "/schedules/:id/reject",
    scheduleController.rejectSchedule
);
// =====================================================
// CHI TIẾT
// =====================================================

router.get(
    "/schedules/:id",
    scheduleController.getScheduleById
);
// =====================================================
// TẠO
// =====================================================

router.post(
    "/schedules",
    scheduleController.createSchedule
);
// =====================================================
// CẬP NHẬT
// =====================================================

router.put(
    "/schedules/:id",
    scheduleController.updateSchedule
);
// =====================================================
// XÓA
// =====================================================

router.delete(
    "/schedules/:id",
    scheduleController.deleteSchedule
);


module.exports = router;