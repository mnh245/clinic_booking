"use strict";

const { pool } = require("../config/db");

const PROFILE_DETAIL_FIELDS = [
  "address",
  "blood_type",
  "insurance_number",
  "allergies",
  "medical_history",
  "emergency_contact_name",
  "emergency_contact_phone"
];

const PATIENT_ONLY_FIELDS = [
  "blood_type",
  "insurance_number",
  "allergies",
  "medical_history",
  "emergency_contact_name",
  "emergency_contact_phone"
];

const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$/;

function getCurrentUser(req) {
  return req.session?.user || req.user || null;
}

function requireRole(req, res, allowedRoles) {
  const user = getCurrentUser(req);
  if (!user) {
    res.status(401).json({
      success: false,
      message: "Bạn chưa đăng nhập."
    });
    return null;
  }
  const role = String(user.role || "").toUpperCase();
  if (!allowedRoles.includes(role)) {
    res.status(403).json({
      success: false,
      message: "Bạn không có quyền thực hiện chức năng này."
    });
    return null;
  }
  return { ...user, role };
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return false;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return date <= today && year >= 1900;
}

function validatePhone(value) {
  if (!value) return true;
  const phone = String(value).replace(/[\s().-]/g, "");
  return /^(0\d{9}|\+84\d{9})$/.test(phone);
}

function cleanNullable(value, maxLength) {
  const text = String(value ?? "").trim();
  if (maxLength && text.length > maxLength) {
    throw new Error(`Thông tin vượt quá ${maxLength} ký tự.`);
  }
  return text || null;
}
/* =====================================================
   LẤY HỒ SƠ TÀI KHOẢN
   ===================================================== */

async function readProfile(userId, executor = pool) {
  const [users] = await executor.query(
    `SELECT
       u.id,
       u.full_name,
       u.email,
       u.phone,
       u.gender,
       DATE_FORMAT(u.date_of_birth, '%Y-%m-%d') AS date_of_birth,
       u.role,
       u.created_at,
       pd.address,
       pd.blood_type,
       pd.insurance_number,
       pd.allergies,
       pd.medical_history,
       pd.emergency_contact_name,
       pd.emergency_contact_phone
     FROM users u
     LEFT JOIN user_profile_details pd
       ON pd.user_id = u.id
     WHERE u.id = ?
     LIMIT 1`,
    [userId]
  );
  if (!users.length) return null;
  const profile = users[0];
  const role = String(profile.role || "").toUpperCase();
  if (role === "DOCTOR") {
    const [doctors] = await executor.query(
      `SELECT
         d.id AS doctor_id,
         d.specialty_id,
         sp.name AS specialty_name,
         d.license_number,
         d.experience_years,
         d.qualification,
         d.introduction,
         d.avatar
       FROM doctors d
       LEFT JOIN specialties sp
         ON sp.id = d.specialty_id
       WHERE d.user_id = ?
       LIMIT 1`,
      [userId]
    );
    Object.assign(profile, doctors[0] || {});
    // Không trả dữ liệu sức khỏe bệnh nhân qua API hồ sơ bác sĩ.
    PATIENT_ONLY_FIELDS.forEach((field) => {
      delete profile[field];
    });
  }
  return profile;
}

async function getMyProfile(req, res) {
  const user = requireRole(req, res, ["PATIENT", "DOCTOR"]);
  if (!user) return;
  try {
    const profile = await readProfile(user.id);
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hồ sơ tài khoản."
      });
    }
    return res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    console.error("GET PROFILE ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Không thể tải hồ sơ. Hãy kiểm tra bảng user_profile_details đã được tạo chưa."
    });
  }
}
/* =====================================================
   CẬP NHẬT HỒ SƠ CÁ NHÂN VÀ THÔNG TIN SỨC KHỎE
   ===================================================== */

async function updateMyProfile(req, res) {
  const user = requireRole(req, res, ["PATIENT", "DOCTOR"]);
  if (!user) return;
  const body =
    req.body && typeof req.body === "object"
      ? req.body
      : {};
  if (
    user.role === "DOCTOR" &&
    PATIENT_ONLY_FIELDS.some((field) => hasOwn(body, field))
  ) {
    return res.status(403).json({
      success: false,
      message: "Bác sĩ không thể cập nhật thông tin sức khỏe của bệnh nhân tại đây."
    });
  }
  const userUpdates = [];
  const userValues = [];
  if (hasOwn(body, "full_name")) {
    const fullName = String(body.full_name ?? "").trim();
    if (fullName.length < 2 || fullName.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Họ và tên phải có từ 2 đến 100 ký tự."
      });
    }
    userUpdates.push("full_name = ?");
    userValues.push(fullName);
  }
  if (hasOwn(body, "phone")) {
    const phone = String(body.phone ?? "").trim();
    if (!validatePhone(phone)) {
      return res.status(400).json({
        success: false,
        message: "Số điện thoại không hợp lệ (ví dụ 0901234567)."
      });
    }
    userUpdates.push("phone = ?");
    userValues.push(phone || null);
  }
  if (hasOwn(body, "gender")) {
    const gender = String(body.gender ?? "").trim().toUpperCase();
    if (
      gender &&
      !["MALE", "FEMALE", "OTHER"].includes(gender)
    ) {
      return res.status(400).json({
        success: false,
        message: "Giới tính không hợp lệ."
      });
    }
    userUpdates.push("gender = ?");
    userValues.push(gender || null);
  }
  if (hasOwn(body, "date_of_birth")) {
    const birthDate = String(body.date_of_birth ?? "").trim();
    if (birthDate && !validDate(birthDate)) {
      return res.status(400).json({
        success: false,
        message: "Ngày sinh không hợp lệ hoặc nằm trong tương lai."
      });
    }
    userUpdates.push("date_of_birth = ?");
    userValues.push(birthDate || null);
  }
  const detailFields = user.role === "PATIENT"
    ? PROFILE_DETAIL_FIELDS
    : ["address"];
  const suppliedDetailFields = detailFields.filter(
    (field) => hasOwn(body, field)
  );
  try {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      if (userUpdates.length) {
        userValues.push(user.id);
        await connection.query(
          `UPDATE users
           SET ${userUpdates.join(", ")},
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          userValues
        );
      }
      if (suppliedDetailFields.length) {
        const [currentRows] = await connection.query(
          `SELECT ${PROFILE_DETAIL_FIELDS.join(", ")}
           FROM user_profile_details
           WHERE user_id = ?
           FOR UPDATE`,
          [user.id]
        );
        const merged = { ...(currentRows[0] || {}) };
        for (const field of suppliedDetailFields) {
          const max = {
            address: 255,
            blood_type: 3,
            insurance_number: 30,
            allergies: 500,
            medical_history: 1000,
            emergency_contact_name: 100,
            emergency_contact_phone: 30
          }[field];
          const incoming = field === "blood_type"
            ? String(body[field] ?? "").trim().toUpperCase()
            : body[field];
          merged[field] = cleanNullable(incoming, max);
        }
        if (
          hasOwn(body, "blood_type") &&
          merged.blood_type &&
          !["A", "B", "AB", "O"].includes(
            merged.blood_type.toUpperCase()
          )
        ) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: "Nhóm máu không hợp lệ."
          });
        }
        if (
          hasOwn(body, "emergency_contact_phone") &&
          merged.emergency_contact_phone &&
          !validatePhone(merged.emergency_contact_phone)
        ) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: "Số điện thoại người liên hệ khẩn cấp không hợp lệ."
          });
        }
        const columns = PROFILE_DETAIL_FIELDS;
        const values = columns.map((field) => merged[field] ?? null);
        const updates = columns
          .map((field) => `${field} = VALUES(${field})`)
          .join(", ");
        await connection.query(
          `INSERT INTO user_profile_details
             (user_id, ${columns.join(", ")})
           VALUES (?, ${columns.map(() => "?").join(", ")})
           ON DUPLICATE KEY UPDATE
             ${updates},
             updated_at = CURRENT_TIMESTAMP`,
          [user.id, ...values]
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    if (req.session?.user && hasOwn(body, "full_name")) {
      req.session.user.full_name = String(body.full_name).trim();
    }
    const profile = await readProfile(user.id);
    return res.json({
      success: true,
      message: "Đã lưu thông tin hồ sơ.",
      data: profile
    });
  } catch (error) {
    console.error("UPDATE PROFILE ERROR:", error);
    if (error.message?.startsWith("Thông tin vượt quá")) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: "Không thể lưu hồ sơ. Hãy kiểm tra bảng user_profile_details và cấu trúc database."
    });
  }
}
/* =====================================================
   HỒ SƠ CHUYÊN MÔN BÁC SĨ
   ===================================================== */

async function getMyDoctorProfile(req, res) {
  const user = requireRole(req, res, ["DOCTOR"]);
  if (!user) return;
  try {
    const profile = await readProfile(user.id);
    if (!profile?.doctor_id) {
      return res.status(404).json({
        success: false,
        message: "Tài khoản chưa được liên kết với hồ sơ bác sĩ."
      });
    }
    const safeDoctor = {
      id: profile.doctor_id,
      doctor_id: profile.doctor_id,
      user_id: profile.id,
      specialty_id: profile.specialty_id,
      specialty_name: profile.specialty_name,
      license_number: profile.license_number,
      experience_years: profile.experience_years,
      qualification: profile.qualification,
      introduction: profile.introduction,
      avatar: profile.avatar
    };
    return res.json({
      success: true,
      data: safeDoctor
    });
  } catch (error) {
    console.error("GET MY DOCTOR PROFILE ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Không thể tải hồ sơ chuyên môn bác sĩ."
    });
  }
}

async function updateMyDoctorProfile(req, res) {
  const user = requireRole(req, res, ["DOCTOR"]);
  if (!user) return;
  const body =
    req.body && typeof req.body === "object"
      ? req.body
      : {};
  const qualification = String(body.qualification ?? "").trim();
  const introduction = String(body.introduction ?? "").trim();
  const avatar = String(body.avatar ?? "").trim();
  if (qualification.length > 150) {
    return res.status(400).json({
      success: false,
      message: "Trình độ/học vị tối đa 150 ký tự."
    });
  }
  if (introduction.length > 1000) {
    return res.status(400).json({
      success: false,
      message: "Phần giới thiệu tối đa 1000 ký tự."
    });
  }
  if (avatar) {
    try {
      const parsed = new URL(avatar);
      if (!/^https?:$/.test(parsed.protocol)) {
        throw new Error("protocol");
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Đường dẫn ảnh không hợp lệ."
      });
    }
  }
  try {
    const [doctorRows] = await pool.query(
      "SELECT id FROM doctors WHERE user_id = ? LIMIT 1",
      [user.id]
    );
    if (!doctorRows.length) {
      return res.status(404).json({
        success: false,
        message: "Tài khoản chưa được liên kết với hồ sơ bác sĩ."
      });
    }
    const doctorId = doctorRows[0].id;
    await pool.query(
      `UPDATE doctors
       SET qualification = ?,
           introduction = ?,
           avatar = ?
       WHERE id = ? AND user_id = ?`,
      [
        qualification || null,
        introduction || null,
        avatar || null,
        doctorId,
        user.id
      ]
    );
    const [rows] = await pool.query(
      `SELECT
          d.id,
          d.user_id,
          d.specialty_id,
          sp.name AS specialty_name,
          d.license_number,
          d.experience_years,
          d.qualification,
          d.introduction,
          d.avatar
       FROM doctors d
       LEFT JOIN specialties sp ON sp.id = d.specialty_id
       WHERE d.id = ? AND d.user_id = ?
       LIMIT 1`,
      [doctorId, user.id]
    );
    return res.json({
      success: true,
      message: "Đã cập nhật thông tin chuyên môn.",
      data: rows[0]
    });
  } catch (error) {
    console.error("UPDATE MY DOCTOR PROFILE ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Không thể lưu thông tin chuyên môn."
    });
  }
}
/* =====================================================
   LỊCH HẸN VÀ LỊCH SỬ KHÁM CỦA BỆNH NHÂN
   ===================================================== */

async function getMyAppointments(req, res) {
  const user = requireRole(req, res, ["PATIENT"]);
  if (!user) return;
  try {
    const [rows] = await pool.query(
      `SELECT
          a.id,
          a.patient_id,
          a.doctor_id,
          a.schedule_id,
          a.appointment_time,
          a.reason,
          a.status,
          a.actual_arrival_time,
          a.late_minutes,
          a.note,
          DATE_FORMAT(s.schedule_date, '%Y-%m-%d') AS schedule_date,
          s.shift_type,
          s.start_time,
          s.end_time,
          du.full_name AS doctor_name,
          sp.name AS specialty_name
       FROM appointments a
       INNER JOIN schedules s ON s.id = a.schedule_id
       INNER JOIN doctors d ON d.id = a.doctor_id
       INNER JOIN users du ON du.id = d.user_id
       LEFT JOIN specialties sp ON sp.id = d.specialty_id
       WHERE a.patient_id = ?
       ORDER BY s.schedule_date DESC,
                a.appointment_time DESC,
                a.id DESC`,
      [user.id]
    );
    return res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error("GET MY APPOINTMENTS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Không thể tải lịch sử khám. Hãy kiểm tra bảng appointments, schedules và doctors."
    });
  }
}
/* =====================================================
   ĐƠN THUỐC CỦA BỆNH NHÂN ĐANG ĐĂNG NHẬP
   ===================================================== */

async function getMyPrescriptions(req, res) {
  const user = requireRole(req, res, ["PATIENT"]);
  if (!user) return;
  try {
    const [rows] = await pool.query(
      `SELECT
          p.id AS prescription_id,
          DATE_FORMAT(p.prescription_date, '%Y-%m-%d') AS prescription_date,
          p.note AS prescription_note,
          mr.id AS medical_record_id,
          mr.diagnosis,
          mr.symptoms,
          mr.examination_notes,
          mr.treatment_plan,
          a.id AS appointment_id,
          DATE_FORMAT(s.schedule_date, '%Y-%m-%d') AS schedule_date,
          a.appointment_time,
          du.full_name AS doctor_name,
          sp.name AS specialty_name,
          pi.id AS item_id,
          pi.medicine_name,
          pi.dosage,
          pi.frequency,
          pi.duration,
          pi.quantity,
          pi.instructions
       FROM prescriptions p
       INNER JOIN medical_records mr ON mr.id = p.medical_record_id
       INNER JOIN appointments a ON a.id = mr.appointment_id
       INNER JOIN schedules s ON s.id = a.schedule_id
       INNER JOIN doctors d ON d.id = mr.doctor_id
       INNER JOIN users du ON du.id = d.user_id
       LEFT JOIN specialties sp ON sp.id = d.specialty_id
       LEFT JOIN prescription_items pi ON pi.prescription_id = p.id
       WHERE mr.patient_id = ?
       ORDER BY p.prescription_date DESC,
                p.id DESC,
                pi.id ASC`,
      [user.id]
    );
    return res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error("GET MY PRESCRIPTIONS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Không thể tải đơn thuốc. Kiểm tra các bảng medical_records, prescriptions và prescription_items đã được tạo chưa."
    });
  }
}
/* =====================================================
   ĐỔI MẬT KHẨU
   ===================================================== */

function loadBcrypt() {
  try {
    return require("bcryptjs");
  } catch (_) {
    // Thử package bcrypt nếu dự án đang dùng package này.
  }
  try {
    return require("bcrypt");
  } catch (_) {
    return null;
  }
}

async function changeMyPassword(req, res) {
  const user = requireRole(req, res, ["PATIENT", "DOCTOR"]);
  if (!user) return;
  const currentPassword =
    String(req.body?.current_password || "");
  const newPassword =
    String(req.body?.new_password || "");
  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message: "Vui lòng nhập mật khẩu hiện tại và mật khẩu mới."
    });
  }
  if (
    newPassword.length < 8 ||
    !/[A-Za-z]/.test(newPassword) ||
    !/\d/.test(newPassword)
  ) {
    return res.status(400).json({
      success: false,
      message: "Mật khẩu mới tối thiểu 8 ký tự và cần có cả chữ lẫn số."
    });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({
      success: false,
      message: "Mật khẩu mới phải khác mật khẩu hiện tại."
    });
  }
  try {
    const [rows] = await pool.query(
      "SELECT password FROM users WHERE id = ? LIMIT 1",
      [user.id]
    );
    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài khoản."
      });
    }
    const storedPassword = String(rows[0].password || "");
    const bcrypt = loadBcrypt();
    let matches = false;
    if (BCRYPT_HASH.test(storedPassword)) {
      if (!bcrypt) {
        return res.status(500).json({
          success: false,
          message: "Máy chủ thiếu bcrypt/bcryptjs để xác minh mật khẩu."
        });
      }
      matches = await bcrypt.compare(
        currentPassword,
        storedPassword
      );
    } else {
      // Chỉ tương thích nếu hệ thống hiện tại đang lưu mật khẩu nguyên văn.
      matches = currentPassword === storedPassword;
    }
    if (!matches) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu hiện tại không chính xác."
      });
    }
    let nextPassword;
    if (BCRYPT_HASH.test(storedPassword)) {
      if (!bcrypt) {
        return res.status(500).json({
          success: false,
          message: "Không thể mã hóa mật khẩu mới do thiếu bcrypt/bcryptjs."
        });
      }
      nextPassword = await bcrypt.hash(newPassword, 10);
    } else {
      // Giữ tương thích với cách đăng nhập hiện tại nếu DB đang lưu nguyên văn.
      nextPassword = newPassword;
    }
    await pool.query(
      `UPDATE users
       SET password = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [nextPassword, user.id]
    );
    return res.json({
      success: true,
      message: "Đổi mật khẩu thành công."
    });
  } catch (error) {
    console.error("CHANGE PASSWORD ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Không thể đổi mật khẩu."
    });
  }
}

module.exports = {
  getMyProfile,
  updateMyProfile,
  getMyDoctorProfile,
  updateMyDoctorProfile,
  getMyAppointments,
  getMyPrescriptions,
  changeMyPassword
};