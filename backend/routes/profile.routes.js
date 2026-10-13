"use strict";

const express = require("express");
const router = express.Router();

const profileController = require("../controllers/profile.controller");
// Đăng ký tại app.js/server.js:
// app.use("/api/profile", require("./routes/profile.routes"));

router.get("/", profileController.getMyProfile);
router.put("/", profileController.updateMyProfile);

router.put(
  "/password",
  profileController.changeMyPassword
);

router.get(
  "/doctor",
  profileController.getMyDoctorProfile
);

router.put(
  "/doctor",
  profileController.updateMyDoctorProfile
);

router.get(
  "/appointments",
  profileController.getMyAppointments
);

router.get(
  "/prescriptions",
  profileController.getMyPrescriptions
);

module.exports = router;