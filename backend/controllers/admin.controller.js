"use strict";

const bcrypt = require("bcryptjs");
const { pool } = require("../config/db");

/* =====================================================
   XÁC THỰC QUYỀN ADMIN
===================================================== */

function requireAdmin(req, res) {
    const user = req.session?.user || req.user || null;

    if (!user) {
        res.status(401).json({
            success: false,
            message: "Bạn cần đăng nhập."
        });
        return null;
    }

    if (String(user.role || "").toUpperCase() !== "ADMIN") {
        res.status(403).json({
            success: false,
            message: "Bạn không có quyền quản trị."
        });
        return null;
    }

    return user;
}

function sendError(res, status, message) {
    return res.status(status).json({
        success: false,
        message
    });
}

function normalizeText(value) {
    return String(value ?? "").trim();
}

function isValidEmail(email) {
    return (
        email.length <= 254 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    );
}

function isValidDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
        return false;
    }

    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);

    return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
    );
}

/* =====================================================
   QUẢN LÝ BÁC SĨ
===================================================== */

// GET /api/admin/doctors
async function getDoctors(req, res) {
    if (!requireAdmin(req, res)) return;

    try {
        const [rows] = await pool.query(`
            SELECT
                d.id,
                d.user_id,
                u.full_name,
                u.email,
                u.phone,
                d.specialty_id,
                sp.name AS specialty_name,
                d.license_number,
                d.experience_years,
                d.qualification,
                d.introduction,
                d.avatar,
                d.created_at
            FROM doctors d
            INNER JOIN users u
                ON u.id = d.user_id
            LEFT JOIN specialties sp
                ON sp.id = d.specialty_id
            WHERE u.role = 'DOCTOR'
            ORDER BY u.full_name ASC
        `);

        return res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error("ADMIN GET DOCTORS ERROR:", error);

        return sendError(
            res,
            500,
            "Không thể tải danh sách bác sĩ."
        );
    }
}

// POST /api/admin/doctors
async function createDoctor(req, res) {
    if (!requireAdmin(req, res)) return;

    let connection;

    try {
        const body = req.body || {};

        const fullName = normalizeText(body.full_name);
        const email = normalizeText(body.email).toLowerCase();
        const phone = normalizeText(body.phone) || null;
        const password = String(body.password || "");
        const specialtyId = Number(body.specialty_id);
        const licenseNumber = normalizeText(body.license_number);
        const experienceYears = Number(body.experience_years ?? 0);
        const qualification = normalizeText(body.qualification) || null;
        const introduction = normalizeText(body.introduction) || null;
        const avatar = normalizeText(body.avatar) || null;

        if (fullName.length < 2 || fullName.length > 100) {
            return sendError(
                res,
                400,
                "Họ tên phải có từ 2 đến 100 ký tự."
            );
        }

        if (!isValidEmail(email)) {
            return sendError(res, 400, "Email không hợp lệ.");
        }

        if (password.length < 8) {
            return sendError(
                res,
                400,
                "Mật khẩu phải có ít nhất 8 ký tự."
            );
        }

        if (
            phone &&
            (
                phone.length > 20 ||
                !/^(?:0\d{9}|\+?84\d{9})$/.test(
                    phone.replace(/[\s().-]/g, "")
                )
            )
        ) {
            return sendError(
                res,
                400,
                "Số điện thoại bác sĩ không hợp lệ."
            );
        }

        if (!Number.isInteger(specialtyId) || specialtyId <= 0) {
            return sendError(
                res,
                400,
                "Vui lòng chọn chuyên khoa."
            );
        }

        if (!licenseNumber || licenseNumber.length > 100) {
            return sendError(
                res,
                400,
                "Vui lòng nhập số giấy phép hành nghề."
            );
        }

        if (
            !Number.isInteger(experienceYears) ||
            experienceYears < 0 ||
            experienceYears > 70
        ) {
            return sendError(
                res,
                400,
                "Số năm kinh nghiệm phải từ 0 đến 70."
            );
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [existingUsers] = await connection.query(
            "SELECT id FROM users WHERE email = ? LIMIT 1",
            [email]
        );

        if (existingUsers.length) {
            await connection.rollback();

            return sendError(
                res,
                409,
                "Email đã được sử dụng."
            );
        }

        const [specialties] = await connection.query(
            "SELECT id FROM specialties WHERE id = ? LIMIT 1",
            [specialtyId]
        );

        if (!specialties.length) {
            await connection.rollback();

            return sendError(
                res,
                400,
                "Chuyên khoa không tồn tại."
            );
        }

        const [existingLicenses] = await connection.query(
            "SELECT id FROM doctors WHERE license_number = ? LIMIT 1",
            [licenseNumber]
        );

        if (existingLicenses.length) {
            await connection.rollback();

            return sendError(
                res,
                409,
                "Số giấy phép hành nghề đã tồn tại."
            );
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [userResult] = await connection.query(
            `
            INSERT INTO users (
                full_name,
                email,
                password,
                phone,
                role
            )
            VALUES (?, ?, ?, ?, 'DOCTOR')
            `,
            [fullName, email, hashedPassword, phone]
        );

        const [doctorResult] = await connection.query(
            `
            INSERT INTO doctors (
                user_id,
                specialty_id,
                license_number,
                experience_years,
                qualification,
                introduction,
                avatar
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [
                userResult.insertId,
                specialtyId,
                licenseNumber,
                experienceYears,
                qualification,
                introduction,
                avatar
            ]
        );

        await connection.commit();

        return res.status(201).json({
            success: true,
            message: "Thêm bác sĩ thành công.",
            data: {
                id: doctorResult.insertId,
                user_id: userResult.insertId
            }
        });
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (_) {}
        }

        console.error("ADMIN CREATE DOCTOR ERROR:", error);

        if (error.code === "ER_DUP_ENTRY") {
            return sendError(
                res,
                409,
                "Email hoặc số giấy phép hành nghề đã tồn tại."
            );
        }

        return sendError(
            res,
            500,
            "Không thể thêm bác sĩ."
        );
    } finally {
        connection?.release();
    }
}

// PUT /api/admin/doctors/:id
async function updateDoctor(req, res) {
    if (!requireAdmin(req, res)) return;

    let connection;

    try {
        const doctorId = Number(req.params.id);
        const body = req.body || {};

        const fullName = normalizeText(body.full_name);
        const email = normalizeText(body.email).toLowerCase();
        const phone = normalizeText(body.phone) || null;
        const specialtyId = Number(body.specialty_id);
        const licenseNumber = normalizeText(body.license_number);
        const experienceYears = Number(body.experience_years ?? 0);
        const qualification = normalizeText(body.qualification) || null;
        const introduction = normalizeText(body.introduction) || null;
        const avatar = normalizeText(body.avatar) || null;
        const password = String(body.password || "");

        if (!Number.isInteger(doctorId) || doctorId <= 0) {
            return sendError(res, 400, "ID bác sĩ không hợp lệ.");
        }

        if (fullName.length < 2 || fullName.length > 100) {
            return sendError(res, 400, "Họ tên bác sĩ không hợp lệ.");
        }

        if (!isValidEmail(email)) {
            return sendError(res, 400, "Email không hợp lệ.");
        }

        if (
            phone &&
            (
                phone.length > 20 ||
                !/^(?:0\d{9}|\+?84\d{9})$/.test(
                    phone.replace(/[\s().-]/g, "")
                )
            )
        ) {
            return sendError(res, 400, "Số điện thoại không hợp lệ.");
        }

        if (!Number.isInteger(specialtyId) || specialtyId <= 0) {
            return sendError(res, 400, "Chuyên khoa không hợp lệ.");
        }

        if (!licenseNumber || licenseNumber.length > 100) {
            return sendError(
                res,
                400,
                "Vui lòng nhập số giấy phép hành nghề."
            );
        }

        if (
            !Number.isInteger(experienceYears) ||
            experienceYears < 0 ||
            experienceYears > 70
        ) {
            return sendError(
                res,
                400,
                "Số năm kinh nghiệm phải từ 0 đến 70."
            );
        }

        if (password && password.length < 8) {
            return sendError(
                res,
                400,
                "Mật khẩu mới phải có ít nhất 8 ký tự."
            );
        }

        if (
            qualification &&
            qualification.length > 150
        ) {
            return sendError(
                res,
                400,
                "Trình độ chuyên môn tối đa 150 ký tự."
            );
        }

        if (
            introduction &&
            introduction.length > 1000
        ) {
            return sendError(
                res,
                400,
                "Giới thiệu tối đa 1.000 ký tự."
            );
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [doctors] = await connection.query(
            `
            SELECT id, user_id
            FROM doctors
            WHERE id = ?
            LIMIT 1
            `,
            [doctorId]
        );

        if (!doctors.length) {
            await connection.rollback();
            return sendError(res, 404, "Không tìm thấy bác sĩ.");
        }

        const doctor = doctors[0];

        const [duplicateEmails] = await connection.query(
            `
            SELECT id
            FROM users
            WHERE email = ?
              AND id <> ?
            LIMIT 1
            `,
            [email, doctor.user_id]
        );

        if (duplicateEmails.length) {
            await connection.rollback();
            return sendError(res, 409, "Email đã được sử dụng.");
        }

        const [duplicateLicenses] = await connection.query(
            `
            SELECT id
            FROM doctors
            WHERE license_number = ?
              AND id <> ?
            LIMIT 1
            `,
            [licenseNumber, doctorId]
        );

        if (duplicateLicenses.length) {
            await connection.rollback();

            return sendError(
                res,
                409,
                "Số giấy phép hành nghề đã tồn tại."
            );
        }

        const [specialties] = await connection.query(
            "SELECT id FROM specialties WHERE id = ? LIMIT 1",
            [specialtyId]
        );

        if (!specialties.length) {
            await connection.rollback();
            return sendError(res, 400, "Chuyên khoa không tồn tại.");
        }

        await connection.query(
            `
            UPDATE users
            SET full_name = ?,
                email = ?,
                phone = ?
            WHERE id = ?
              AND role = 'DOCTOR'
            `,
            [
                fullName,
                email,
                phone,
                doctor.user_id
            ]
        );

        await connection.query(
            `
            UPDATE doctors
            SET specialty_id = ?,
                license_number = ?,
                experience_years = ?,
                qualification = ?,
                introduction = ?,
                avatar = ?
            WHERE id = ?
            `,
            [
                specialtyId,
                licenseNumber,
                experienceYears,
                qualification,
                introduction,
                avatar,
                doctorId
            ]
        );

        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);

            await connection.query(
                "UPDATE users SET password = ? WHERE id = ?",
                [hashedPassword, doctor.user_id]
            );
        }

        await connection.commit();

        return res.json({
            success: true,
            message: "Cập nhật bác sĩ thành công."
        });
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (_) {}
        }

        console.error("ADMIN UPDATE DOCTOR ERROR:", error);

        if (error.code === "ER_DUP_ENTRY") {
            return sendError(
                res,
                409,
                "Email hoặc số giấy phép hành nghề đã tồn tại."
            );
        }

        return sendError(
            res,
            500,
            "Không thể cập nhật bác sĩ."
        );
    } finally {
        connection?.release();
    }
}

// DELETE /api/admin/doctors/:id
async function deleteDoctor(req, res) {
    if (!requireAdmin(req, res)) return;

    let connection;

    try {
        const doctorId = Number(req.params.id);

        if (!Number.isInteger(doctorId) || doctorId <= 0) {
            return sendError(res, 400, "ID bác sĩ không hợp lệ.");
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [rows] = await connection.query(
            `
            SELECT id, user_id
            FROM doctors
            WHERE id = ?
            LIMIT 1
            FOR UPDATE
            `,
            [doctorId]
        );

        if (!rows.length) {
            await connection.rollback();
            return sendError(res, 404, "Không tìm thấy bác sĩ.");
        }

        const doctor = rows[0];

        const [scheduleCountRows] = await connection.query(
            "SELECT COUNT(*) AS total FROM schedules WHERE doctor_id = ?",
            [doctorId]
        );

        const [appointmentCountRows] = await connection.query(
            "SELECT COUNT(*) AS total FROM appointments WHERE doctor_id = ?",
            [doctorId]
        );

        const schedulesCount = Number(
            scheduleCountRows[0]?.total || 0
        );

        const appointmentsCount = Number(
            appointmentCountRows[0]?.total || 0
        );

        if (schedulesCount > 0 || appointmentsCount > 0) {
            await connection.rollback();

            return sendError(
                res,
                409,
                "Không thể xóa bác sĩ vì đã có lịch làm việc hoặc lịch hẹn. Hãy giữ hồ sơ để bảo toàn lịch sử."
            );
        }

        await connection.query(
            "DELETE FROM doctors WHERE id = ?",
            [doctorId]
        );

        await connection.query(
            "DELETE FROM users WHERE id = ? AND role = 'DOCTOR'",
            [doctor.user_id]
        );

        await connection.commit();

        return res.json({
            success: true,
            message: "Đã xóa bác sĩ và tài khoản liên quan."
        });
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (_) {}
        }

        console.error("ADMIN DELETE DOCTOR ERROR:", error);

        return sendError(
            res,
            500,
            "Không thể xóa bác sĩ."
        );
    } finally {
        connection?.release();
    }
}

/* =====================================================
   QUẢN LÝ CHUYÊN KHOA
===================================================== */

// GET /api/admin/specialties
async function getSpecialties(req, res) {
    if (!requireAdmin(req, res)) return;

    try {
        const [rows] = await pool.query(`
            SELECT
                s.id,
                s.name,
                s.description,
                COUNT(d.id) AS doctor_count
            FROM specialties s
            LEFT JOIN doctors d
                ON d.specialty_id = s.id
            GROUP BY
                s.id,
                s.name,
                s.description
            ORDER BY s.name ASC
        `);

        return res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error("ADMIN GET SPECIALTIES ERROR:", error);

        return sendError(
            res,
            500,
            "Không thể tải danh sách chuyên khoa."
        );
    }
}

// POST /api/admin/specialties
async function createSpecialty(req, res) {
    if (!requireAdmin(req, res)) return;

    try {
        const name = normalizeText(req.body?.name);
        const description =
            normalizeText(req.body?.description) || null;

        if (name.length < 2 || name.length > 100) {
            return sendError(
                res,
                400,
                "Tên chuyên khoa phải có từ 2 đến 100 ký tự."
            );
        }

        if (description && description.length > 1000) {
            return sendError(
                res,
                400,
                "Mô tả chuyên khoa tối đa 1.000 ký tự."
            );
        }

        const [existing] = await pool.query(
            "SELECT id FROM specialties WHERE name = ? LIMIT 1",
            [name]
        );

        if (existing.length) {
            return sendError(
                res,
                409,
                "Tên chuyên khoa đã tồn tại."
            );
        }

        const [result] = await pool.query(
            `
            INSERT INTO specialties (name, description)
            VALUES (?, ?)
            `,
            [name, description]
        );

        return res.status(201).json({
            success: true,
            message: "Thêm chuyên khoa thành công.",
            data: {
                id: result.insertId,
                name,
                description,
                doctor_count: 0
            }
        });
    } catch (error) {
        console.error("ADMIN CREATE SPECIALTY ERROR:", error);

        if (error.code === "ER_DUP_ENTRY") {
            return sendError(
                res,
                409,
                "Tên chuyên khoa đã tồn tại."
            );
        }

        return sendError(res, 500, "Không thể thêm chuyên khoa.");
    }
}

// PUT /api/admin/specialties/:id
async function updateSpecialty(req, res) {
    if (!requireAdmin(req, res)) return;

    try {
        const id = Number(req.params.id);
        const name = normalizeText(req.body?.name);
        const description =
            normalizeText(req.body?.description) || null;

        if (!Number.isInteger(id) || id <= 0) {
            return sendError(res, 400, "ID chuyên khoa không hợp lệ.");
        }

        if (name.length < 2 || name.length > 100) {
            return sendError(
                res,
                400,
                "Tên chuyên khoa phải có từ 2 đến 100 ký tự."
            );
        }

        if (description && description.length > 1000) {
            return sendError(
                res,
                400,
                "Mô tả chuyên khoa tối đa 1.000 ký tự."
            );
        }

        const [existing] = await pool.query(
            `
            SELECT id
            FROM specialties
            WHERE name = ?
              AND id <> ?
            LIMIT 1
            `,
            [name, id]
        );

        if (existing.length) {
            return sendError(
                res,
                409,
                "Tên chuyên khoa đã được sử dụng."
            );
        }

        const [result] = await pool.query(
            `
            UPDATE specialties
            SET name = ?, description = ?
            WHERE id = ?
            `,
            [name, description, id]
        );

        if (!result.affectedRows) {
            const [found] = await pool.query(
                "SELECT id FROM specialties WHERE id = ? LIMIT 1",
                [id]
            );

            if (!found.length) {
                return sendError(res, 404, "Không tìm thấy chuyên khoa.");
            }
        }

        return res.json({
            success: true,
            message: "Cập nhật chuyên khoa thành công."
        });
    } catch (error) {
        console.error("ADMIN UPDATE SPECIALTY ERROR:", error);

        if (error.code === "ER_DUP_ENTRY") {
            return sendError(
                res,
                409,
                "Tên chuyên khoa đã được sử dụng."
            );
        }

        return sendError(
            res,
            500,
            "Không thể cập nhật chuyên khoa."
        );
    }
}

// DELETE /api/admin/specialties/:id
async function deleteSpecialty(req, res) {
    if (!requireAdmin(req, res)) return;

    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return sendError(res, 400, "ID chuyên khoa không hợp lệ.");
        }

        const [doctors] = await pool.query(
            "SELECT COUNT(*) AS total FROM doctors WHERE specialty_id = ?",
            [id]
        );

        if (Number(doctors[0]?.total || 0) > 0) {
            return sendError(
                res,
                409,
                "Không thể xóa chuyên khoa đang được bác sĩ sử dụng."
            );
        }

        const [result] = await pool.query(
            "DELETE FROM specialties WHERE id = ?",
            [id]
        );

        if (!result.affectedRows) {
            return sendError(res, 404, "Không tìm thấy chuyên khoa.");
        }

        return res.json({
            success: true,
            message: "Đã xóa chuyên khoa."
        });
    } catch (error) {
        console.error("ADMIN DELETE SPECIALTY ERROR:", error);

        return sendError(
            res,
            500,
            "Không thể xóa chuyên khoa."
        );
    }
}

/* =====================================================
   THỐNG KÊ, BÁO CÁO LỊCH KHÁM
===================================================== */

// GET /api/admin/appointment-report?from=YYYY-MM-DD&to=YYYY-MM-DD
async function getAppointmentReport(req, res) {
    if (!requireAdmin(req, res)) return;

    try {
        const from = normalizeText(req.query.from);
        const to = normalizeText(req.query.to);
        const status = normalizeText(req.query.status).toUpperCase();
        const doctorId = normalizeText(req.query.doctor_id);

        const allowedStatuses = [
            "PENDING",
            "CONFIRMED",
            "COMPLETED",
            "CANCELLED",
            "NO_SHOW"
        ];

        if (!isValidDate(from) || !isValidDate(to) || from > to) {
            return sendError(
                res,
                400,
                "Khoảng ngày báo cáo không hợp lệ."
            );
        }

        if (status && !allowedStatuses.includes(status)) {
            return sendError(
                res,
                400,
                "Trạng thái lịch khám không hợp lệ."
            );
        }

        const baseConditions = [
            "s.schedule_date >= ?",
            "s.schedule_date <= ?"
        ];

        const baseParams = [from, to];

        if (doctorId) {
            const id = Number(doctorId);

            if (!Number.isInteger(id) || id <= 0) {
                return sendError(res, 400, "ID bác sĩ không hợp lệ.");
            }

            baseConditions.push("a.doctor_id = ?");
            baseParams.push(id);
        }

        const baseWhere = baseConditions.join(" AND ");

        const [summaryRows] = await pool.query(
            `
            SELECT
                COUNT(*) AS total,
                COALESCE(SUM(a.status = 'PENDING'), 0) AS pending,
                COALESCE(SUM(a.status = 'CONFIRMED'), 0) AS confirmed,
                COALESCE(SUM(a.status = 'COMPLETED'), 0) AS completed,
                COALESCE(SUM(a.status = 'CANCELLED'), 0) AS cancelled,
                COALESCE(SUM(a.status = 'NO_SHOW'), 0) AS no_show
            FROM appointments a
            INNER JOIN schedules s
                ON s.id = a.schedule_id
            WHERE ${baseWhere}
            `,
            baseParams
        );

        const rowConditions = [...baseConditions];
        const rowParams = [...baseParams];

        if (status) {
            rowConditions.push("a.status = ?");
            rowParams.push(status);
        }

        const [rows] = await pool.query(
            `
            SELECT
                a.id,
                DATE_FORMAT(s.schedule_date, '%Y-%m-%d')
                    AS appointment_date,
                TIME_FORMAT(a.appointment_time, '%H:%i')
                    AS appointment_time,
                a.status,
                a.reason,
                a.contact_phone,
                a.contact_email,
                COALESCE(
                    NULLIF(a.contact_name, ''),
                    pu.full_name
                ) AS patient_name,
                COALESCE(
                    NULLIF(a.contact_phone, ''),
                    pu.phone
                ) AS patient_phone,
                du.full_name AS doctor_name,
                sp.name AS specialty_name
            FROM appointments a
            INNER JOIN schedules s
                ON s.id = a.schedule_id
            INNER JOIN users pu
                ON pu.id = a.patient_id
            INNER JOIN doctors d
                ON d.id = a.doctor_id
            INNER JOIN users du
                ON du.id = d.user_id
            LEFT JOIN specialties sp
                ON sp.id = d.specialty_id
            WHERE ${rowConditions.join(" AND ")}
            ORDER BY
                s.schedule_date DESC,
                a.appointment_time DESC,
                a.id DESC
            `,
            rowParams
        );

        const rawSummary = summaryRows[0] || {};

        const summary = {
            total: Number(rawSummary.total || 0),
            pending: Number(rawSummary.pending || 0),
            confirmed: Number(rawSummary.confirmed || 0),
            completed: Number(rawSummary.completed || 0),
            cancelled: Number(rawSummary.cancelled || 0),
            no_show: Number(rawSummary.no_show || 0)
        };

        return res.json({
            success: true,
            data: {
                summary,
                rows
            }
        });
    } catch (error) {
        console.error("ADMIN APPOINTMENT REPORT ERROR:", error);

        return sendError(
            res,
            500,
            "Không thể tạo báo cáo lịch khám. Hãy kiểm tra cấu trúc bảng appointments, schedules và users."
        );
    }
}

module.exports = {
    getDoctors,
    createDoctor,
    updateDoctor,
    deleteDoctor,

    getSpecialties,
    createSpecialty,
    updateSpecialty,
    deleteSpecialty,

    getAppointmentReport
};