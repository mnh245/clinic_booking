const db = require("../config/db");
/*
=====================================================
CẤU HÌNH 4 CA LÀM VIỆC
=====================================================
*/

const SHIFT_CONFIG = {
    NIGHT: {
        name: "Ca đêm",
        displayStart: "00:00",
        displayEnd: "06:00",
        start_time: "00:00:00",
        end_time: "06:00:00"
    },
    MORNING: {
        name: "Ca sáng",
        displayStart: "06:00",
        displayEnd: "12:00",
        start_time: "06:00:00",
        end_time: "12:00:00"
    },
    AFTERNOON: {
        name: "Ca chiều",
        displayStart: "12:00",
        displayEnd: "18:00",
        start_time: "12:00:00",
        end_time: "18:00:00"
    },
    EVENING: {
        name: "Ca tối",
        displayStart: "18:00",
        displayEnd: "00:00",
        /*
        Lưu 23:59:59 trong database để
        hệ thống tạo khung giờ khám hiện tại
        không bị lỗi khi giờ kết thúc = 00:00.
        */
        start_time: "18:00:00",
        end_time: "23:59:59"
    }
};
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

async function getDoctorIdFromUser(user) {
    const [rows] = await db.pool.query(
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
LẤY DANH SÁCH 4 CA

GET /api/schedules/shifts
=====================================================
*/

async function getShiftTypes(req, res) {
    try {
        const data = Object.entries(SHIFT_CONFIG).map(
            ([value, shift]) => ({
                value,
                name: shift.name,
                start_time: shift.displayStart,
                end_time: shift.displayEnd
            })
        );
        return res.json({
            success: true,
            data
        });
    } catch (error) {
        console.error(
            "GET SHIFT TYPES ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message: "Không thể lấy danh sách ca làm việc."
        });
    }
}
/*
=====================================================
LẤY LỊCH CỦA BÁC SĨ ĐANG ĐĂNG NHẬP

GET /api/schedules/my
=====================================================
*/

async function getMySchedules(req, res) {
    try {
        const user = getCurrentUser(req);
        if (!user || !isDoctor(user)) {
            return res.status(403).json({
                success: false,
                message: "Bạn không có quyền truy cập."
            });
        }
        const doctorId =
            await getDoctorIdFromUser(user);
        if (!doctorId) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy hồ sơ bác sĩ."
            });
        }
        const [rows] = await db.pool.query(
            `
            SELECT
                s.id,
                s.doctor_id,
                s.schedule_date,
                s.shift_type,
                s.start_time,
                s.end_time,
                s.status,
                s.created_at
            FROM schedules s
            WHERE s.doctor_id = ?
            ORDER BY
                s.schedule_date ASC,
                s.start_time ASC
            `,
            [doctorId]
        );
        const data = rows.map(row => {
            const shift =
                SHIFT_CONFIG[row.shift_type];
            return {
                ...row,
                shift_name:
                    shift ? shift.name : "Lịch cũ",
                display_start:
                    shift
                        ? shift.displayStart
                        : String(row.start_time).substring(0, 5),
                display_end:
                    shift
                        ? shift.displayEnd
                        : String(row.end_time).substring(0, 5)
            };
        });
        return res.json({
            success: true,
            data
        });
    } catch (error) {
        console.error(
            "GET MY SCHEDULES ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message: "Không thể lấy lịch làm việc."
        });
    }
}
/*
=====================================================
LẤY TẤT CẢ LỊCH CHO ADMIN

GET /api/schedules/admin
=====================================================
*/

async function getAllSchedules(req, res) {
    try {
        const user = getCurrentUser(req);
        if (!isAdmin(user)) {
            return res.status(403).json({
                success: false,
                message:
                    "Chỉ ADMIN mới được thực hiện chức năng này."
            });
        }
        const [rows] = await db.pool.query(
            `
            SELECT
                s.id,
                s.doctor_id,
                s.schedule_date,
                s.shift_type,
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
        const data = rows.map(row => {
            const shift =
                SHIFT_CONFIG[row.shift_type];
            return {
                ...row,
                shift_name:
                    shift ? shift.name : "Lịch cũ",
                display_start:
                    shift
                        ? shift.displayStart
                        : String(row.start_time).substring(0, 5),
                display_end:
                    shift
                        ? shift.displayEnd
                        : String(row.end_time).substring(0, 5)
            };
        });
        return res.json({
            success: true,
            data
        });
    } catch (error) {
        console.error(
            "GET ALL SCHEDULES ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message: "Không thể lấy danh sách lịch."
        });
    }
}
/*
=====================================================
LẤY MỘT LỊCH

GET /api/schedules/:id
=====================================================
*/

async function getScheduleById(req, res) {
    try {
        const { id } = req.params;
        const [rows] = await db.pool.query(
            `
            SELECT
                id,
                doctor_id,
                schedule_date,
                shift_type,
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
                message: "Không tìm thấy lịch."
            });
        }
        const row = rows[0];
        const shift =
            SHIFT_CONFIG[row.shift_type];
        const data = {
            ...row,
            shift_name:
                shift ? shift.name : "Lịch cũ",
            display_start:
                shift
                    ? shift.displayStart
                    : String(row.start_time).substring(0, 5),
            display_end:
                shift
                    ? shift.displayEnd
                    : String(row.end_time).substring(0, 5)
        };
        return res.json({
            success: true,
            data
        });
    } catch (error) {
        console.error(
            "GET SCHEDULE ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message: "Không thể lấy lịch."
        });
    }
}
/*
=====================================================
TẠO LỊCH THEO CA

POST /api/schedules

Body:
{
    "schedule_date": "2026-10-08",
    "shift_type": "MORNING"
}

DOCTOR:
    chỉ tạo lịch cho chính mình

ADMIN:
    có thể tạo cho bất kỳ bác sĩ nào
=====================================================
*/

async function createSchedule(req, res) {
    try {
        const user = getCurrentUser(req);
        if (
            !user ||
            (!isDoctor(user) && !isAdmin(user))
        ) {
            return res.status(403).json({
                success: false,
                message: "Bạn không có quyền tạo lịch."
            });
        }
        const {
            doctor_id,
            schedule_date,
            shift_type
        } = req.body;
        /*
        =============================================
        KIỂM TRA NGÀY
        =============================================
        */
        if (!schedule_date) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng chọn ngày làm việc."
            });
        }
        /*
        =============================================
        KIỂM TRA CA
        =============================================
        */
        if (!shift_type) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng chọn ca làm việc."
            });
        }
        const shift =
            SHIFT_CONFIG[
                String(shift_type).toUpperCase()
            ];
        if (!shift) {
            return res.status(400).json({
                success: false,
                message:
                    "Ca làm việc không hợp lệ."
            });
        }
        const normalizedShift =
            String(shift_type).toUpperCase();
        /*
        =============================================
        XÁC ĐỊNH BÁC SĨ
        =============================================
        */
        let doctorId;
        if (isDoctor(user)) {
            doctorId =
                await getDoctorIdFromUser(user);
        } else {
            doctorId = doctor_id;
        }
        if (!doctorId) {
            return res.status(400).json({
                success: false,
                message:
                    "Chưa xác định được bác sĩ."
            });
        }
        /*
        =============================================
        KIỂM TRA BÁC SĨ
        =============================================
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
                message: "Không tìm thấy bác sĩ."
            });
        }
        /*
        =============================================
        KIỂM TRA TRÙNG CA
        =============================================
        Một bác sĩ không được tạo cùng một
        ca trong cùng một ngày.
        */
        const [existing] =
            await db.pool.query(
                `
                SELECT id
                FROM schedules
                WHERE doctor_id = ?
                  AND schedule_date = ?
                  AND shift_type = ?
                  AND status <> 'CLOSED'
                LIMIT 1
                `,
                [
                    doctorId,
                    schedule_date,
                    normalizedShift
                ]
            );
        if (existing.length) {
            return res.status(409).json({
                success: false,
                message:
                    "Bác sĩ đã có lịch ở ca này trong ngày."
            });
        }
        /*
        =============================================
        KIỂM TRA TRÙNG THỜI GIAN
        =============================================
        Giữ thêm kiểm tra này để bảo vệ dữ liệu
        lịch cũ đang tồn tại.
        */
        const [overlapping] =
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
                    shift.end_time,
                    shift.start_time
                ]
            );
        if (overlapping.length) {
            return res.status(409).json({
                success: false,
                message:
                    "Ca làm việc bị trùng với lịch đã có."
            });
        }
        /*
        =============================================
        TẠO LỊCH
        =============================================
        */
        const [result] =
            await db.pool.query(
                `
                INSERT INTO schedules
                (
                    doctor_id,
                    schedule_date,
                    shift_type,
                    start_time,
                    end_time,
                    status
                )
                VALUES
                (?, ?, ?, ?, ?, 'AVAILABLE')
                `,
                [
                    doctorId,
                    schedule_date,
                    normalizedShift,
                    shift.start_time,
                    shift.end_time
                ]
            );
        return res.status(201).json({
            success: true,
            message:
                `Tạo ${shift.name.toLowerCase()} thành công.`,
            data: {
                id: result.insertId,
                doctor_id: doctorId,
                schedule_date,
                shift_type: normalizedShift,
                shift_name: shift.name,
                start_time: shift.start_time,
                end_time: shift.end_time,
                display_start: shift.displayStart,
                display_end: shift.displayEnd,
                status: "AVAILABLE"
            }
        });
    } catch (error) {
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

Có thể cập nhật:
- ngày
- ca
=====================================================
*/

async function updateSchedule(req, res) {
    try {
        const user = getCurrentUser(req);
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
        const { id } = req.params;
        const {
            schedule_date,
            shift_type
        } = req.body;
        /*
        =============================================
        LẤY LỊCH HIỆN TẠI
        =============================================
        */
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
                message: "Không tìm thấy lịch."
            });
        }
        const schedule = rows[0];
        /*
        =============================================
        KIỂM TRA QUYỀN DOCTOR
        =============================================
        */
        if (isDoctor(user)) {
            const doctorId =
                await getDoctorIdFromUser(user);
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
        /*
        =============================================
        XÁC ĐỊNH NGÀY
        =============================================
        */
        const newDate =
            schedule_date ||
            schedule.schedule_date;
        /*
        =============================================
        XÁC ĐỊNH CA
        =============================================
        */
        const newShiftType =
            String(
                shift_type ||
                schedule.shift_type ||
                ""
            ).toUpperCase();
        const shift =
            SHIFT_CONFIG[newShiftType];
        /*
        Nếu đây là lịch cũ chưa có shift_type
        thì bắt buộc phải chọn ca.
        */
        if (!shift) {
            return res.status(400).json({
                success: false,
                message:
                    "Vui lòng chọn ca làm việc hợp lệ."
            });
        }
        /*
        =============================================
        KIỂM TRA TRÙNG
        =============================================
        */
        const [existing] =
            await db.pool.query(
                `
                SELECT id
                FROM schedules
                WHERE doctor_id = ?
                  AND schedule_date = ?
                  AND shift_type = ?
                  AND id <> ?
                  AND status <> 'CLOSED'
                LIMIT 1
                `,
                [
                    schedule.doctor_id,
                    newDate,
                    newShiftType,
                    id
                ]
            );
        if (existing.length) {
            return res.status(409).json({
                success: false,
                message:
                    "Bác sĩ đã có ca này trong ngày."
            });
        }
        /*
        =============================================
        CẬP NHẬT
        =============================================
        */
        await db.pool.query(
            `
            UPDATE schedules
            SET
                schedule_date = ?,
                shift_type = ?,
                start_time = ?,
                end_time = ?
            WHERE id = ?
            `,
            [
                newDate,
                newShiftType,
                shift.start_time,
                shift.end_time,
                id
            ]
        );
        return res.json({
            success: true,
            message: "Cập nhật lịch thành công.",
            data: {
                id: Number(id),
                schedule_date: newDate,
                shift_type: newShiftType,
                shift_name: shift.name,
                display_start: shift.displayStart,
                display_end: shift.displayEnd
            }
        });
    } catch (error) {
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

async function deleteSchedule(req, res) {
    try {
        const user = getCurrentUser(req);
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
        const { id } = req.params;
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
                message: "Không tìm thấy lịch."
            });
        }
        const schedule = rows[0];
        /*
        =============================================
        DOCTOR CHỈ ĐƯỢC XÓA LỊCH CỦA MÌNH
        =============================================
        */
        if (isDoctor(user)) {
            const doctorId =
                await getDoctorIdFromUser(user);
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
        =============================================
        KHÔNG XÓA LỊCH ĐÃ CÓ BỆNH NHÂN
        =============================================
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
        /*
        =============================================
        XÓA
        =============================================
        */
        await db.pool.query(
            `
            DELETE FROM schedules
            WHERE id = ?
            `,
            [id]
        );
        return res.json({
            success: true,
            message: "Xóa lịch thành công."
        });
    } catch (error) {
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
/*
=====================================================
EXPORT
=====================================================
*/

module.exports = {
    getShiftTypes,
    getMySchedules,
    getAllSchedules,
    getScheduleById,
    createSchedule,
    updateSchedule,
    deleteSchedule
};