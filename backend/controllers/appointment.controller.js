const { pool } = require("../config/db");
// =====================================================
// HELPER: LẤY USER ĐANG ĐĂNG NHẬP
// =====================================================
const {
    sendSms,
    isSmsConfigured,
    isSmsSandbox,
    normalizeVietnamPhone
} = require("../services/sms.service");

function getCurrentUser(req) {
    return (
        req.session?.user ||
        req.user ||
        null
    );
}
// =====================================================
// HELPER: LẤY DOCTOR ID TỪ USER ĐANG ĐĂNG NHẬP
// =====================================================

async function getDoctorIdFromUser(user) {
    if (!user?.id) {
        return null;
    }
    const [rows] =
        await pool.query(
            `
            SELECT id
            FROM doctors
            WHERE user_id = ?
            LIMIT 1
            `,
            [user.id]
        );
    if (rows.length === 0) {
        return null;
    }
    return rows[0].id;
}

// =====================================================
// KIỂM SOÁT SỐ BÁC SĨ TRONG MỖI CHUYÊN KHOA / CA
// =====================================================

const MAX_DOCTORS_PER_SPECIALTY_SHIFT = 3;

function getDateKey(value) {
    if (value instanceof Date) {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, "0");
        const day = String(value.getDate()).padStart(2, "0");

        return `${year}-${month}-${day}`;
    }

    return String(value || "").slice(0, 10);
}

function isTodayOrFuture(dateValue) {
    const now = new Date();

    const today = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0")
    ].join("-");

    return getDateKey(dateValue) >= today;
}

/**
 * Đếm số bác sĩ khác nhau trong một chuyên khoa, ngày và ca.
 *
 * activeOnly = false:
 * Đếm lịch chưa bị từ chối, bao gồm cả lịch đang chờ duyệt.
 *
 * activeOnly = true:
 * Chỉ đếm lịch đã được duyệt và đang mở.
 */
async function countSpecialtyShiftDoctors({
    specialtyId,
    scheduleDate,
    shiftType,
    excludeScheduleId = null,
    activeOnly = false
}) {
    if (!specialtyId || !scheduleDate || !shiftType) {
        return 0;
    }

    const conditions = [
        "d.specialty_id = ?",
        "s.schedule_date = ?",
        "s.shift_type = ?"
    ];

    const params = [
        specialtyId,
        getDateKey(scheduleDate),
        shiftType
    ];

    if (activeOnly) {
        conditions.push(
            "s.approval_status = 'APPROVED'",
            "s.status = 'AVAILABLE'"
        );
    } else {
        conditions.push("s.approval_status <> 'REJECTED'");
    }

    if (
        excludeScheduleId !== null &&
        excludeScheduleId !== undefined
    ) {
        conditions.push("s.id <> ?");
        params.push(excludeScheduleId);
    }

    const [rows] = await pool.query(
        `
        SELECT COUNT(DISTINCT s.doctor_id) AS total
        FROM schedules s
        INNER JOIN doctors d
            ON d.id = s.doctor_id
        WHERE ${conditions.join(" AND ")}
        `,
        params
    );

    return Number(rows[0]?.total || 0);
}
// =====================================================
// 1. LẤY GIỜ KHÁM CÒN TRỐNG
//
// GET
// /api/doctors/:doctorId/available-slots?date=YYYY-MM-DD
// =====================================================

async function getAvailableSlots(req, res) {
    try {
        const { doctorId } = req.params;
        const { date } = req.query;
        if (!doctorId || !date) {
            return res.status(400).json({
                success: false,
                message:
                    "Vui lòng chọn bác sĩ và ngày khám."
            });
        }
        // =================================================
        // LẤY LỊCH LÀM VIỆC
        // =================================================
        const [schedules] =
            await pool.query(
                `
                SELECT
                    id,
                    doctor_id,
                    schedule_date,
                    shift_type,
                    start_time,
                    end_time,
                    status
                FROM schedules
                WHERE doctor_id = ?
                  AND schedule_date = ?
                  AND approval_status = 'APPROVED'
                  AND status = 'AVAILABLE'
                ORDER BY start_time ASC
                `,
                [
                    doctorId,
                    date
                ]
            );
        if (schedules.length === 0) {
            return res.json({
                success: true,
                data: []
            });
        }
        // =================================================
        // LẤY CÁC LỊCH HẸN ĐÃ ĐẶT
        // =================================================
        const scheduleIds =
            schedules.map(
                schedule => schedule.id
            );
        const [appointments] =
            await pool.query(
                `
                SELECT
                    schedule_id,
                    appointment_time,
                    status
                FROM appointments
                WHERE doctor_id = ?
                  AND schedule_id IN (?)
                  AND status <> 'CANCELLED'
                `,
                [
                    doctorId,
                    scheduleIds
                ]
            );
        // =================================================
        // SET GIỜ ĐÃ ĐẶT
        // =================================================
        const bookedSlots =
            new Set(
                appointments.map(
                    appointment =>
                        `${appointment.schedule_id}_${appointment.appointment_time}`
                )
            );
        // =================================================
        // MỖI LƯỢT KHÁM = 30 PHÚT
        // =================================================
        const SLOT_MINUTES = 30;
        const slots = [];
        for (
            const schedule
            of schedules
        ) {
            const start =
                new Date(
                    `1970-01-01T${schedule.start_time}`
                );
            const end =
                new Date(
                    `1970-01-01T${schedule.end_time}`
                );
            let current =
                new Date(start);
            while (
                current.getTime()
                +
                SLOT_MINUTES * 60000
                <=
                end.getTime()
            ) {
                const hour =
                    String(
                        current.getHours()
                    ).padStart(
                        2,
                        "0"
                    );
                const minute =
                    String(
                        current.getMinutes()
                    ).padStart(
                        2,
                        "0"
                    );
                const time =
                    `${hour}:${minute}:00`;
                const key =
                    `${schedule.id}_${time}`;
                slots.push({
                    schedule_id:
                        schedule.id,
                    doctor_id:
                        Number(doctorId),
                    date:
                        schedule.schedule_date,
                    shift_type:
                        schedule.shift_type,
                    time,
                    available:
                        !bookedSlots.has(key)
                });
                current =
                    new Date(
                        current.getTime()
                        +
                        SLOT_MINUTES * 60000
                    );
            }
        }
        return res.json({
            success: true,
            data: slots
        });
    } catch (error) {
        console.error(
            "GET AVAILABLE SLOTS ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Không thể lấy giờ khám."
        });
    }
}
// =====================================================
// 2. ĐẶT LỊCH KHÁM
//
// POST /api/appointments
// =====================================================

async function createAppointment(req, res) {
    const connection =
        await pool.getConnection();
    try {
        const user =
            getCurrentUser(req);
        // =================================================
        // PHẢI ĐĂNG NHẬP
        // =================================================
        if (!user) {
            return res.status(401).json({
                success: false,
                message:
                    "Bạn cần đăng nhập trước khi đặt lịch."
            });
        }
        // =================================================
        // CHỈ BỆNH NHÂN ĐƯỢC ĐẶT LỊCH
        // =================================================
        if (
            user.role !== "PATIENT"
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Tài khoản hiện tại không phải bệnh nhân."
            });
        }
        const {
    doctor_id,
    schedule_id,
    appointment_time,
    reason,
    contact_name,
    contact_email,
    contact_phone,
    contact_address,
    sms_opt_in
} = req.body || {};

const contactName = String(contact_name ?? "").trim();
const contactEmail = String(contact_email ?? "")
    .trim()
    .toLowerCase();

const contactPhone =
    normalizeVietnamPhone(contact_phone);

const contactAddress =
    String(contact_address ?? "").trim();

const smsOptIn =
    sms_opt_in === true ||
    sms_opt_in === 1 ||
    sms_opt_in === "1" ||
    sms_opt_in === "true";

if (contactName.length < 2 || contactName.length > 100) {
    return res.status(400).json({
        success: false,
        message: "Họ tên phải có từ 2 đến 100 ký tự."
    });
}

if (
    contactEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)
) {
    return res.status(400).json({
        success: false,
        message: "Email người đặt không hợp lệ."
    });
}

if (!/^0\d{9}$/.test(contactPhone)) {
    return res.status(400).json({
        success: false,
        message: "Số điện thoại phải hợp lệ, ví dụ 0912345678."
    });
}

if (!contactAddress || contactAddress.length > 255) {
    return res.status(400).json({
        success: false,
        message: "Vui lòng nhập địa chỉ hợp lệ, tối đa 255 ký tự."
    });
}
        // =================================================
        // BỆNH NHÂN LẤY TỪ SESSION
        // =================================================
        const patient_id =
            Number(user.id);
        if (
            !patient_id ||
            !doctor_id ||
            !schedule_id ||
            !appointment_time
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Vui lòng nhập đầy đủ thông tin đặt lịch."
            });
        }
        // =================================================
        // NẾU FRONTEND CÒN GỬI patient_id
        // THÌ PHẢI KHỚP SESSION
        // =================================================
        if (
            req.body.patient_id &&
            Number(req.body.patient_id)
            !==
            patient_id
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Thông tin bệnh nhân không hợp lệ."
            });
        }
        await connection.beginTransaction();
        // =================================================
        // KIỂM TRA BÁC SĨ
        // =================================================
        const [doctors] =
            await connection.query(
                `
                SELECT id
                FROM doctors
                WHERE id = ?
                LIMIT 1
                `,
                [
                    Number(doctor_id)
                ]
            );
        if (doctors.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message:
                    "Không tìm thấy bác sĩ."
            });
        }
        // =================================================
        // KHÓA VÀ KIỂM TRA LỊCH
        // =================================================
        const [schedules] =
            await connection.query(
                `
                SELECT
                    id,
                    doctor_id,
                    schedule_date,
                    shift_type,
                    start_time,
                    end_time,
                    status,
                    approval_status
                FROM schedules
                WHERE id = ?
                  AND doctor_id = ?
                FOR UPDATE
                `,
                [
                    Number(schedule_id),
                    Number(doctor_id)
                ]
            );
        if (schedules.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message:
                    "Lịch làm việc không tồn tại."
            });
        }
        const schedule =
            schedules[0];
        // =================================================
        // KIỂM TRA LỊCH CÒN MỞ
        // =================================================
        // =================================================
// KIỂM TRA LỊCH ĐÃ ĐƯỢC ADMIN PHÊ DUYỆT
// =================================================

        if (
              String(schedule.approval_status || "").toUpperCase()
              !==
              "APPROVED"
             ) {
            await connection.rollback();

             return res.status(400).json({
                  success: false,
                  message: "Lịch khám chưa được admin phê duyệt."
             });
   }
        if (
            schedule.status
            !==
            "AVAILABLE"
        ) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message:
                    "Lịch khám này hiện không khả dụng."
            });
        }
        // =================================================
        // KIỂM TRA GIỜ NẰM TRONG CA
        // =================================================
        if (
            appointment_time <
            schedule.start_time
            ||
            appointment_time >=
            schedule.end_time
        ) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message:
                    "Giờ khám không nằm trong lịch làm việc của bác sĩ."
            });
        }
        // =================================================
        // KIỂM TRA GIỜ KHÁM PHẢI ĐÚNG MỐC 30 PHÚT
        // =================================================
        const timeParts =
            String(
                appointment_time
            )
                .split(":");
        const appointmentHour =
            Number(
                timeParts[0]
            );
        const appointmentMinute =
            Number(
                timeParts[1]
            );
        if (
            Number.isNaN(
                appointmentHour
            )
            ||
            Number.isNaN(
                appointmentMinute
            )
            ||
            !(
                appointmentMinute === 0
                ||
                appointmentMinute === 30
            )
        ) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message:
                    "Giờ khám không hợp lệ."
            });
        }
        // =================================================
        // KIỂM TRA BỆNH NHÂN TRÙNG LỊCH
        // =================================================
        const [patientExisting] =
            await connection.query(
                `
                SELECT a.id
                FROM appointments a
                JOIN schedules s
                    ON a.schedule_id = s.id
                WHERE a.patient_id = ?
                  AND s.schedule_date = ?
                  AND a.appointment_time = ?
                  AND a.status <> 'CANCELLED'
                LIMIT 1
                `,
                [
                    patient_id,
                    schedule.schedule_date,
                    appointment_time
                ]
            );
        if (
            patientExisting.length > 0
        ) {
            await connection.rollback();
            return res.status(409).json({
                success: false,
                message:
                    "Bạn đã có một lịch khám vào thời gian này."
            });
        }
        // =================================================
        // KIỂM TRA GIỜ CỦA BÁC SĨ ĐÃ BỊ ĐẶT
        // =================================================
        const [doctorExisting] =
            await connection.query(
                `
                SELECT id
                FROM appointments
                WHERE doctor_id = ?
                  AND schedule_id = ?
                  AND appointment_time = ?
                  AND status <> 'CANCELLED'
                LIMIT 1
                `,
                [
                    Number(doctor_id),
                    Number(schedule_id),
                    appointment_time
                ]
            );
        if (
            doctorExisting.length > 0
        ) {
            await connection.rollback();
            return res.status(409).json({
                success: false,
                message:
                    "Giờ khám này đã được đặt."
            });
        }
        // =================================================
        // TẠO LỊCH HẸN
        // =================================================
       const [result] = await connection.query(
    `
    INSERT INTO appointments (
        patient_id,
        doctor_id,
        schedule_id,
        appointment_time,
        reason,
        contact_name,
        contact_email,
        contact_phone,
        contact_address,
        sms_opt_in,
        status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `,
    [
        patient_id,
        Number(doctor_id),
        Number(schedule_id),
        appointment_time,
        reason ? String(reason).trim() : null,
        contactName,
        contactEmail,
        contactPhone,
        contactAddress,
        smsOptIn ? 1 : 0
    ]
);
       await connection.commit();

const appointmentId = Number(result.insertId);

let bookingSmsSent = false;
let smsMessage = "";

if (smsOptIn) {
    if (!isSmsConfigured()) {
        smsMessage =
            " Chưa gửi được SMS vì hệ thống chưa có cấu hình SMS hợp lệ.";

        console.warn(
            "BOOKING SMS SKIPPED: eSMS chưa được cấu hình."
        );
    } else {
        try {
            const smsContent =
                `Clinic Booking: Da tiep nhan yeu cau dat lich ` +
                `cua ${contactName}. Ngay ` +
                `${schedule.schedule_date_display}, luc ` +
                `${String(appointment_time).slice(0, 5)}. ` +
                `Lich dang cho xac nhan. Ma lich ${appointmentId}.`;

            await sendSms(contactPhone, smsContent);

            if (!isSmsSandbox()) {
                await pool.query(
                    `
                    UPDATE appointments
                    SET booking_sms_sent = 1
                    WHERE id = ?
                    `,
                    [appointmentId]
                );

                bookingSmsSent = true;

                smsMessage =
                    " Yêu cầu SMS đã được nhà cung cấp tiếp nhận.";
            } else {
                smsMessage =
                    " Hệ thống đang ở chế độ Sandbox nên không gửi SMS thật.";
            }
        } catch (smsError) {
            console.error(
                "BOOKING SMS FAILED:",
                smsError.message
            );

            smsMessage =
                " Lịch đã lưu nhưng gửi SMS thất bại; hãy kiểm tra log Backend.";
        }
    }
} else {
    smsMessage =
        " Bạn chưa chọn nhận thông báo SMS.";
}

return res.status(201).json({
    success: true,
    message: "Đặt lịch khám thành công." + smsMessage,
    data: {
        id: appointmentId,
        patient_id,
        doctor_id: Number(doctor_id),
        schedule_id: Number(schedule_id),
        appointment_time,
        reason: reason ? String(reason).trim() : null,
        contact_name: contactName,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        contact_address: contactAddress,
        sms_opt_in: smsOptIn,
        booking_sms_sent: bookingSmsSent,
        status: "PENDING"
    }
});
    } catch (error) {
        try {
            await connection.rollback();
        } catch (rollbackError) {
            console.error(
                "ROLLBACK ERROR:",
                rollbackError
            );
        }
        console.error(
            "CREATE APPOINTMENT ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Không thể đặt lịch khám."
        });
    } finally {
        connection.release();
    }
}
// =====================================================
// 3. LẤY LỊCH KHÁM CỦA BỆNH NHÂN
//
// GET /api/patients/:patientId/appointments
// =====================================================

async function getPatientAppointments(
    req,
    res
) {
    try {
        const user =
            getCurrentUser(req);
        if (!user) {
            return res.status(401).json({
                success: false,
                message:
                    "Bạn chưa đăng nhập."
            });
        }
        const patientId =
            Number(
                req.params.patientId
            );
        if (!patientId) {
            return res.status(400).json({
                success: false,
                message:
                    "ID bệnh nhân không hợp lệ."
            });
        }
        // =================================================
        // BỆNH NHÂN CHỈ ĐƯỢC XEM LỊCH CỦA MÌNH
        // ADMIN CÓ THỂ XEM
        // =================================================
        if (
            user.role !== "ADMIN"
            &&
            Number(user.id)
            !==
            patientId
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Bạn không có quyền xem lịch của bệnh nhân này."
            });
        }
        const [rows] =
            await pool.query(
                `
                SELECT
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
                    s.schedule_date,
                    s.shift_type,
                    s.start_time,
                    s.end_time,
                    u.full_name AS doctor_name,
                    sp.name AS specialty_name
                FROM appointments a
                JOIN schedules s
                    ON a.schedule_id = s.id
                JOIN doctors d
                    ON a.doctor_id = d.id
                JOIN users u
                    ON d.user_id = u.id
                LEFT JOIN specialties sp
                    ON d.specialty_id = sp.id
                WHERE a.patient_id = ?
                ORDER BY
                    s.schedule_date DESC,
                    a.appointment_time DESC
                `,
                [
                    patientId
                ]
            );
        return res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error(
            "GET PATIENT APPOINTMENTS ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Không thể lấy lịch khám."
        });
    }
}
// =====================================================
// 4. HỦY LỊCH KHÁM CỦA BỆNH NHÂN
//
// PATCH /api/appointments/:id/cancel
// =====================================================

async function cancelAppointment(
    req,
    res
) {
    try {
        const user =
            getCurrentUser(req);
        if (!user) {
            return res.status(401).json({
                success: false,
                message:
                    "Bạn chưa đăng nhập."
            });
        }
        if (
            user.role !== "PATIENT"
            &&
            user.role !== "ADMIN"
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Bạn không có quyền hủy lịch."
            });
        }
        const appointmentId =
            Number(
                req.params.id
            );
        if (!appointmentId) {
            return res.status(400).json({
                success: false,
                message:
                    "ID lịch hẹn không hợp lệ."
            });
        }
        const [appointments] =
            await pool.query(
                `
                SELECT
                    id,
                    patient_id,
                    status
                FROM appointments
                WHERE id = ?
                LIMIT 1
                `,
                [
                    appointmentId
                ]
            );
        if (
            appointments.length === 0
        ) {
            return res.status(404).json({
                success: false,
                message:
                    "Không tìm thấy lịch hẹn."
            });
        }
        const appointment =
            appointments[0];
        if (
            user.role !== "ADMIN"
            &&
            Number(
                appointment.patient_id
            )
            !==
            Number(user.id)
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Bạn không có quyền hủy lịch hẹn này."
            });
        }
        if (
            appointment.status !==
            "PENDING"
            &&
            appointment.status !==
            "CONFIRMED"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Lịch hẹn hiện tại không thể hủy."
            });
        }
        await pool.query(
            `
            UPDATE appointments
            SET
                status = 'CANCELLED',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            `,
            [
                appointmentId
            ]
        );
        return res.json({
            success: true,
            message:
                "Đã hủy lịch khám."
        });
    } catch (error) {
        console.error(
            "CANCEL APPOINTMENT ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Không thể hủy lịch."
        });
    }
}
// =====================================================
// HELPER: KIỂM TRA BÁC SĨ CÓ QUYỀN VỚI APPOINTMENT
// =====================================================

async function getDoctorAppointment(
    appointmentId,
    user
) {
    if (!user) {
        return {
            error: {
                status: 401,
                message:
                    "Bạn chưa đăng nhập."
            }
        };
    }
    if (
        user.role !== "DOCTOR"
        &&
        user.role !== "ADMIN"
    ) {
        return {
            error: {
                status: 403,
                message:
                    "Bạn không có quyền xử lý lịch hẹn."
            }
        };
    }
    const [rows] =
        await pool.query(
            `
            SELECT
                id,
                patient_id,
                doctor_id,
                schedule_id,
                appointment_time,
                status,
                actual_arrival_time
            FROM appointments
            WHERE id = ?
            LIMIT 1
            `,
            [
                appointmentId
            ]
        );
    if (
        rows.length === 0
    ) {
        return {
            error: {
                status: 404,
                message:
                    "Không tìm thấy lịch hẹn."
            }
        };
    }
    const appointment =
        rows[0];
    if (
        user.role === "DOCTOR"
    ) {
        const doctorId =
            await getDoctorIdFromUser(
                user
            );
        if (!doctorId) {
            return {
                error: {
                    status: 403,
                    message:
                        "Tài khoản bác sĩ chưa được liên kết với hồ sơ bác sĩ."
                }
            };
        }
        if (
            Number(
                appointment.doctor_id
            )
            !==
            Number(doctorId)
        ) {
            return {
                error: {
                    status: 403,
                    message:
                        "Bạn không có quyền xử lý lịch hẹn này."
                }
            };
        }
    }
    return {
        appointment
    };
}
// =====================================================
// 5. BÁC SĨ XÁC NHẬN LỊCH
//
// POST /api/appointments/:id/confirm
// =====================================================

async function confirmAppointment(
    req,
    res
) {
    try {
        const appointmentId =
            Number(
                req.params.id
            );
        if (!appointmentId) {
            return res.status(400).json({
                success: false,
                message:
                    "ID lịch khám không hợp lệ."
            });
        }
        const check =
            await getDoctorAppointment(
                appointmentId,
                getCurrentUser(req)
            );
        if (check.error) {
            return res.status(
                check.error.status
            ).json({
                success: false,
                message:
                    check.error.message
            });
        }
        const appointment =
            check.appointment;
        if (
            appointment.status !==
            "PENDING"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Chỉ lịch khám PENDING mới có thể xác nhận."
            });
        }
        await pool.query(
            `
            UPDATE appointments
            SET
                status = 'CONFIRMED',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            `,
            [
                appointmentId
            ]
        );

let confirmationSmsSent = false;

try {
    const [rows] = await pool.query(
        `
        SELECT
            a.id,
            a.contact_name,
            a.contact_phone,
            a.sms_opt_in,
            a.confirmation_sms_sent,
            DATE_FORMAT(
                s.schedule_date,
                '%d/%m/%Y'
            ) AS appointment_date_display,
            TIME_FORMAT(
                a.appointment_time,
                '%H:%i'
            ) AS appointment_time_display,
            du.full_name AS doctor_name
        FROM appointments a
        INNER JOIN schedules s
            ON s.id = a.schedule_id
        INNER JOIN doctors d
            ON d.id = a.doctor_id
        INNER JOIN users du
            ON du.id = d.user_id
        WHERE a.id = ?
        LIMIT 1
        `,
        [appointmentId]
    );

    const appointment = rows[0];

    const optedIn =
        Number(appointment?.sms_opt_in) === 1;

    const alreadySent =
        Number(appointment?.confirmation_sms_sent) === 1;

    if (
        appointment &&
        optedIn &&
        appointment.contact_phone &&
        !alreadySent &&
        isSmsConfigured()
    ) {
        const smsContent =
            `Clinic Booking: Lich kham cua ` +
            `${appointment.contact_name} da duoc xac nhan. ` +
            `Ngay ${appointment.appointment_date_display}, luc ` +
            `${appointment.appointment_time_display}, voi BS ` +
            `${appointment.doctor_name}.`;

        await sendSms(
            appointment.contact_phone,
            smsContent
        );

        if (!isSmsSandbox()) {
            await pool.query(
                `
                UPDATE appointments
                SET confirmation_sms_sent = 1
                WHERE id = ?
                `,
                [appointmentId]
            );

            confirmationSmsSent = true;
        }
    }
} catch (smsError) {
    console.error(
        "APPOINTMENT CONFIRMATION SMS FAILED:",
        smsError.message
    );
}
        
       return res.json({
    success: true,
    message: confirmationSmsSent
        ? "Xác nhận lịch khám thành công. Yêu cầu SMS xác nhận đã được tiếp nhận."
        : "Xác nhận lịch khám thành công. SMS chưa được gửi hoặc đang ở chế độ thử nghiệm."
});

    } catch (error) {
        console.error(
            "CONFIRM APPOINTMENT ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Lỗi máy chủ khi xác nhận lịch khám."
        });
    }
}
// =====================================================
// 6. GHI NHẬN BỆNH NHÂN ĐẾN KHÁM
//
// POST /api/appointments/:id/arrival
// =====================================================

async function recordArrival(
    req,
    res
) {
    try {
        const appointmentId =
            Number(
                req.params.id
            );
        if (!appointmentId) {
            return res.status(400).json({
                success: false,
                message:
                    "ID lịch khám không hợp lệ."
            });
        }
        const check =
            await getDoctorAppointment(
                appointmentId,
                getCurrentUser(req)
            );
        if (check.error) {
            return res.status(
                check.error.status
            ).json({
                success: false,
                message:
                    check.error.message
            });
        }
        const appointment =
            check.appointment;
        if (
            appointment.status !==
            "CONFIRMED"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Chỉ lịch khám CONFIRMED mới có thể ghi nhận đến khám."
            });
        }
        if (
            appointment.actual_arrival_time
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Bệnh nhân đã được ghi nhận đến khám."
            });
        }
        // =================================================
        // THỜI GIAN HIỆN TẠI
        // =================================================
        const now =
            new Date();
        const currentHour =
            now.getHours();
        const currentMinute =
            now.getMinutes();
        const [appointmentHour, appointmentMinute] =
            String(
                appointment.appointment_time
            )
                .split(":")
                .map(Number);
        const currentTotalMinutes =
            currentHour * 60
            +
            currentMinute;
        const appointmentTotalMinutes =
            appointmentHour * 60
            +
            appointmentMinute;
        const lateMinutes =
            Math.max(
                0,
                currentTotalMinutes
                -
                appointmentTotalMinutes
            );
        const actualArrivalTime =
            `${String(currentHour).padStart(2, "0")}:` +
            `${String(currentMinute).padStart(2, "0")}:00`;
        await pool.query(
            `
            UPDATE appointments
            SET
                actual_arrival_time = ?,
                late_minutes = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            `,
            [
                actualArrivalTime,
                lateMinutes,
                appointmentId
            ]
        );
        return res.json({
            success: true,
            message:
                lateMinutes > 0
                    ? `Bệnh nhân đã đến muộn ${lateMinutes} phút.`
                    : "Bệnh nhân đã đến đúng giờ.",
            data: {
                actual_arrival_time:
                    actualArrivalTime,
                late_minutes:
                    lateMinutes
            }
        });
    } catch (error) {
        console.error(
            "RECORD ARRIVAL ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Lỗi máy chủ khi ghi nhận bệnh nhân đến."
        });
    }
}
// =====================================================
// 7. ĐÁNH DẤU KHÔNG ĐẾN
//
// POST /api/appointments/:id/no-show
// =====================================================

async function markNoShow(
    req,
    res
) {
    try {
        const appointmentId =
            Number(
                req.params.id
            );
        if (!appointmentId) {
            return res.status(400).json({
                success: false,
                message:
                    "ID lịch khám không hợp lệ."
            });
        }
        const check =
            await getDoctorAppointment(
                appointmentId,
                getCurrentUser(req)
            );
        if (check.error) {
            return res.status(
                check.error.status
            ).json({
                success: false,
                message:
                    check.error.message
            });
        }
        const appointment =
            check.appointment;
        if (
            appointment.status !==
            "CONFIRMED"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Chỉ lịch khám CONFIRMED mới có thể đánh dấu không đến."
            });
        }
        if (
            appointment.actual_arrival_time
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Bệnh nhân đã đến khám nên không thể đánh dấu NO_SHOW."
            });
        }
        await pool.query(
            `
            UPDATE appointments
            SET
                status = 'NO_SHOW',
                note =
                    COALESCE(
                        note,
                        'Bệnh nhân không đến khám'
                    ),
                updated_at =
                    CURRENT_TIMESTAMP
            WHERE id = ?
            `,
            [
                appointmentId
            ]
        );
        return res.json({
            success: true,
            message:
                "Đã đánh dấu bệnh nhân không đến khám."
        });
    } catch (error) {
        console.error(
            "NO SHOW ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Lỗi máy chủ khi xử lý NO_SHOW."
        });
    }
}
// =====================================================
// 8. HOÀN THÀNH KHÁM
//
// POST /api/appointments/:id/complete
// =====================================================

async function completeAppointment(
    req,
    res
) {
    try {
        const appointmentId =
            Number(
                req.params.id
            );
        if (!appointmentId) {
            return res.status(400).json({
                success: false,
                message:
                    "ID lịch khám không hợp lệ."
            });
        }
        const check =
            await getDoctorAppointment(
                appointmentId,
                getCurrentUser(req)
            );
        if (check.error) {
            return res.status(
                check.error.status
            ).json({
                success: false,
                message:
                    check.error.message
            });
        }
        const appointment =
            check.appointment;
        if (
            appointment.status !==
            "CONFIRMED"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Chỉ lịch khám CONFIRMED mới có thể hoàn thành."
            });
        }
        if (
            !appointment.actual_arrival_time
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Chưa ghi nhận bệnh nhân đến khám."
            });
        }
        await pool.query(
            `
            UPDATE appointments
            SET
                status = 'COMPLETED',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            `,
            [
                appointmentId
            ]
        );
        return res.json({
            success: true,
            message:
                "Cuộc hẹn đã được đánh dấu hoàn thành."
        });
    } catch (error) {
        console.error(
            "COMPLETE APPOINTMENT ERROR:",
            error
        );
        return res.status(500).json({
            success: false,
            message:
                "Lỗi máy chủ khi hoàn thành cuộc hẹn."
        });
    }
}
// =====================================================
// EXPORT
// =====================================================

module.exports = {
    getAvailableSlots,
    createAppointment,
    getPatientAppointments,
    cancelAppointment,
    confirmAppointment,
    recordArrival,
    markNoShow,
    completeAppointment
};