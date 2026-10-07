const express = require("express");

const router =
    express.Router();


const scheduleController =
    require("../controllers/schedule.controller");
/*
=====================================================
BÁC SĨ XEM LỊCH CỦA MÌNH
=====================================================
*/

router.get(
    "/my",
    scheduleController.getMySchedules
);
/*
=====================================================
ADMIN XEM TOÀN BỘ LỊCH
=====================================================
*/

router.get(
    "/admin",
    scheduleController.getAllSchedules
);
/*
=====================================================
LẤY MỘT LỊCH
=====================================================
*/

router.get(
    "/:id",
    scheduleController.getScheduleById
);
/*
=====================================================
TẠO LỊCH
DOCTOR hoặc ADMIN
=====================================================
*/

router.post(
    "/",
    scheduleController.createSchedule
);
/*
=====================================================
SỬA LỊCH
=====================================================
*/

router.put(
    "/:id",
    scheduleController.updateSchedule
);
/*
=====================================================
XÓA LỊCH
=====================================================
*/

router.delete(
    "/:id",
    scheduleController.deleteSchedule
);


module.exports = router;