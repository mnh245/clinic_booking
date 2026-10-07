const db = require("../config/db");
/*
=====================================================
LẤY USER ĐANG ĐĂNG NHẬP
=====================================================
*/

function getCurrentUser(req) {
    if (req.session && req.session.user) {
        return req.session.user;
    }
    if (req.user) {
        return req.user;
    }
    return null;
}
/*
=====================================================
KIỂM TRA QUYỀN
=====================================================
*/

function isAdmin(user) {
    return user &&
        String(user.role).toUpperCase() === "ADMIN";
}


function isDoctor(user) {
    return user &&
        String(user.role).toUpperCase() === "DOCTOR";
}
/*
=====================================================
LẤY ID DOCTOR TỪ USER
=====================================================
*/

async function getDoctorIdFromUser(
    user
) {
    const [rows] =
        await db.pool.query(
            `
            SELECT id
            FROM doctors
            WHERE user_id = ?
            LIMIT 1
            `,
            [user.id]
        );
    if (!rows.length) {
        return null;
    }
    return rows[0].id;
}
/*
=====================================================
LẤY LỊCH CỦA BÁC SĨ ĐANG ĐĂNG NHẬP

GET /api/schedules/my
=====================================================
*/

async function getMySchedules(
    req,
    res
) {
    try {
        const user =
            getCurrentUser(req);
        if (!user || !isDoctor(user)) {
            return res.status(403).json({
                success: false,
                message:
                    "Bạn không có quyền truy cập."
            });
        }
        const doctorId =
            await getDoctorIdFromUser(
                user
            );
        if (!doctorId) {
            return res.status(404).json({
                success: false,
                message:
                    "Không tìm thấy hồ sơ bác sĩ."
            });
        }
        const [rows] =
            await db.pool.query(
                `
                SELECT
                    id,
                    doctor_id,
                    schedule_date,
                    start_time,
                    end_time,
                    status,
                    created_at
                FROM schedules
                WHERE doctor_id = ?
                ORDER BY
                    schedule_date ASC,
                    start_time ASC
                `,
                [doctorId]
            );
        return res.json({
            success: true,
            data: rows
        });
    }
    catch (error) {
        console.error(
            "GET MY SCHEDULES ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Không thể lấy lịch làm việc."
        });
    }
}
/*
=====================================================
LẤY TẤT CẢ LỊCH CHO ADMIN

GET /api/schedules/admin
=====================================================
*/

async function getAllSchedules(
    req,
    res
) {
    try {
        const user =
            getCurrentUser(req);
        if (!isAdmin(user)) {
            return res.status(403).json({
                success: false,
                message:
                    "Chỉ ADMIN mới được thực hiện chức năng này."
            });
        }
        const [rows] =
            await db.pool.query(
                `
                SELECT
                    s.id,
                    s.doctor_id,
                    s.schedule_date,
                    s.start_time,
                    s.end_time,
                    s.status,
                    s.created_at,
                    d.user_id,
                    u.full_name,
                    sp.name AS specialty_name
                FROM schedules s
                INNER JOIN doctors d
                    ON d.id = s.doctor_id
                INNER JOIN users u
                    ON u.id = d.user_id
                INNER JOIN specialties sp
                    ON sp.id = d.specialty_id
                ORDER BY
                    s.schedule_date ASC,
                    s.start_time ASC,
                    u.full_name ASC
                `
            );
        return res.json({
            success: true,
            data: rows
        });
    }
    catch (error) {
        console.error(
            "GET ALL SCHEDULES ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Không thể lấy danh sách lịch."
        });
    }
}
/*
=====================================================
LẤY MỘT LỊCH

GET /api/schedules/:id
=====================================================
*/

async function getScheduleById(
    req,
    res
) {
    try {
        const {
            id
        } = req.params;
        const [rows] =
            await db.pool.query(
                `
                SELECT
                    id,
                    doctor_id,
                    schedule_date,
                    start_time,
                    end_time,
                    status,
                    created_at
                FROM schedules
                WHERE id = ?
                LIMIT 1
                `,
                [id]
            );
        if (!rows.length) {
            return res.status(404).json({
                success: false,
                message:
                    "Không tìm thấy lịch."
            });
        }
        return res.json({
            success: true,
            data: rows[0]
        });
    }
    catch (error) {
        console.error(
            "GET SCHEDULE ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Không thể lấy lịch."
        });
    }
}
/*
=====================================================
TẠO LỊCH

POST /api/schedules

DOCTOR:
    chỉ tạo cho chính mình

ADMIN:
    tạo cho bất kỳ bác sĩ nào
=====================================================
*/

async function createSchedule(
    req,
    res
) {
    try {
        const user =
            getCurrentUser(req);
        if (
            !user ||
            (!isDoctor(user) && !isAdmin(user))
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Bạn không có quyền tạo lịch."
            });
        }
        const {
            doctor_id,
            schedule_date,
            start_time,
            end_time
        } = req.body;
        if (
            !schedule_date ||
            !start_time ||
            !end_time
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Vui lòng nhập đầy đủ thông tin."
            });
        }
        let doctorId;
        if (isDoctor(user)) {
            doctorId =
                await getDoctorIdFromUser(
                    user
                );
        }
        else {
            doctorId =
                doctor_id;
        }
        if (!doctorId) {
            return res.status(400).json({
                success: false,
                message:
                    "Chưa xác định được bác sĩ."
            });
        }
        if (
            String(start_time) >=
            String(end_time)
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Giờ kết thúc phải lớn hơn giờ bắt đầu."
            });
        }
        /*
        Kiểm tra bác sĩ
        */
        const [doctors] =
            await db.pool.query(
                `
                SELECT id
                FROM doctors
                WHERE id = ?
                LIMIT 1
                `,
                [doctorId]
            );
        if (!doctors.length) {
            return res.status(404).json({
                success: false,
                message:
                    "Không tìm thấy bác sĩ."
            });
        }
        /*
        Kiểm tra trùng lịch
        */
        const [existing] =
            await db.pool.query(
                `
                SELECT id
                FROM schedules
                WHERE doctor_id = ?
                  AND schedule_date = ?
                  AND status <> 'CLOSED'
                  AND start_time < ?
                  AND end_time > ?
                LIMIT 1
                `,
                [
                    doctorId,
                    schedule_date,
                    end_time,
                    start_time
                ]
            );
        if (existing.length) {
            return res.status(409).json({
                success: false,
                message:
                    "Lịch làm việc bị trùng với lịch đã có."
            });
        }
        /*
        Tạo lịch
        */
        const [result] =
            await db.pool.query(
                `
                INSERT INTO schedules
                (
                    doctor_id,
                    schedule_date,
                    start_time,
                    end_time,
                    status
                )
                VALUES
                (?, ?, ?, ?, 'AVAILABLE')
                `,
                [
                    doctorId,
                    schedule_date,
                    start_time,
                    end_time
                ]
            );
        return res.status(201).json({
            success: true,
            message:
                "Tạo lịch làm việc thành công.",
            data: {
                id: result.insertId,
                doctor_id: doctorId,
                schedule_date,
                start_time,
                end_time,
                status: "AVAILABLE"
            }
        });
    }
    catch (error) {
        console.error(
            "CREATE SCHEDULE ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Không thể tạo lịch làm việc."
        });
    }
}
/*
=====================================================
CẬP NHẬT LỊCH

PUT /api/schedules/:id
=====================================================
*/

async function updateSchedule(
    req,
    res
) {
    try {
        const user =
            getCurrentUser(req);
        if (
            !user ||
            (!isDoctor(user) && !isAdmin(user))
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Bạn không có quyền chỉnh sửa lịch."
            });
        }
        const {
            id
        } = req.params;
        const {
            schedule_date,
            start_time,
            end_time
        } = req.body;
        const [rows] =
            await db.pool.query(
                `
                SELECT *
                FROM schedules
                WHERE id = ?
                LIMIT 1
                `,
                [id]
            );
        if (!rows.length) {
            return res.status(404).json({
                success: false,
                message:
                    "Không tìm thấy lịch."
            });
        }
        const schedule =
            rows[0];
        /*
        Nếu là DOCTOR,
        chỉ được sửa lịch của mình.
        */
        if (isDoctor(user)) {
            const doctorId =
                await getDoctorIdFromUser(
                    user
                );
            if (
                Number(doctorId) !==
                Number(schedule.doctor_id)
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "Bạn không được sửa lịch của bác sĩ khác."
                });
            }
        }
        if (
            String(start_time) >=
            String(end_time)
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Giờ kết thúc phải lớn hơn giờ bắt đầu."
            });
        }
        await db.pool.query(
            `
            UPDATE schedules
            SET
                schedule_date = ?,
                start_time = ?,
                end_time = ?
            WHERE id = ?
            `,
            [
                schedule_date,
                start_time,
                end_time,
                id
            ]
        );
        return res.json({
            success: true,
            message:
                "Cập nhật lịch thành công."
        });
    }
    catch (error) {
        console.error(
            "UPDATE SCHEDULE ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Không thể cập nhật lịch."
        });
    }
}
/*
=====================================================
XÓA LỊCH

DELETE /api/schedules/:id
=====================================================
*/

async function deleteSchedule(
    req,
    res
) {
    try {
        const user =
            getCurrentUser(req);
        if (
            !user ||
            (!isDoctor(user) && !isAdmin(user))
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Bạn không có quyền xóa lịch."
            });
        }
        const {
            id
        } = req.params;
        const [rows] =
            await db.pool.query(
                `
                SELECT *
                FROM schedules
                WHERE id = ?
                LIMIT 1
                `,
                [id]
            );
        if (!rows.length) {
            return res.status(404).json({
                success: false,
                message:
                    "Không tìm thấy lịch."
            });
        }
        const schedule =
            rows[0];
        if (isDoctor(user)) {
            const doctorId =
                await getDoctorIdFromUser(
                    user
                );
            if (
                Number(doctorId) !==
                Number(schedule.doctor_id)
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "Bạn không được xóa lịch của bác sĩ khác."
                });
            }
        }
        /*
        Không cho xóa lịch đã có
        cuộc hẹn.
        */
        const [appointments] =
            await db.pool.query(
                `
                SELECT id
                FROM appointments
                WHERE schedule_id = ?
                  AND status <> 'CANCELLED'
                LIMIT 1
                `,
                [id]
            );
        if (appointments.length) {
            return res.status(409).json({
                success: false,
                message:
                    "Lịch này đã có bệnh nhân đặt. Không thể xóa."
            });
        }
        await db.pool.query(
            `
            DELETE FROM schedules
            WHERE id = ?
            `,
            [id]
        );
        return res.json({
            success: true,
            message:
                "Xóa lịch thành công."
        });
    }
    catch (error) {
        console.error(
            "DELETE SCHEDULE ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Không thể xóa lịch."
        });
    }
}


module.exports = {
    getMySchedules,
    getAllSchedules,
    getScheduleById,
    createSchedule,
    updateSchedule,
    deleteSchedule
};