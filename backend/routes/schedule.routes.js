const express = require("express");

const router = express.Router();

const scheduleController =
    require("../controllers/schedule.controller");
/*
=====================================================
LẤY DANH SÁCH 4 CA
=====================================================

GET /api/schedules/shifts
*/

router.get(
    "/schedules/shifts",
    scheduleController.getShiftTypes
);
/*
=====================================================
BÁC SĨ XEM LỊCH CỦA MÌNH
=====================================================

GET /api/schedules/my
*/

router.get(
    "/schedules/my",
    scheduleController.getMySchedules
);
/*
=====================================================
ADMIN XEM TOÀN BỘ LỊCH
=====================================================

GET /api/schedules/admin
*/

router.get(
    "/schedules/admin",
    scheduleController.getAllSchedules
);
/*
=====================================================
LẤY MỘT LỊCH
=====================================================

GET /api/schedules/:id
*/

router.get(
    "/schedules/:id",
    scheduleController.getScheduleById
);
/*
=====================================================
TẠO LỊCH
=====================================================

POST /api/schedules

DOCTOR hoặc ADMIN
*/

router.post(
    "/schedules",
    scheduleController.createSchedule
);
/*
=====================================================
SỬA LỊCH
=====================================================

PUT /api/schedules/:id
*/

router.put(
    "/schedules/:id",
    scheduleController.updateSchedule
);
/*
=====================================================
XÓA LỊCH
=====================================================

DELETE /api/schedules/:id
*/

router.delete(
    "/schedules/:id",
    scheduleController.deleteSchedule
);


module.exports = router;