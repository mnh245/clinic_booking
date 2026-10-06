const db = require("../config/db");


/*
    ============================================
    LẤY CÁC GIỜ KHÁM CÒN TRỐNG
    GET /api/doctors/:doctorId/available-slots?date=YYYY-MM-DD
    ============================================
*/

async function getAvailableSlots(req, res) {
    try {
        const { doctorId } = req.params;
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng chọn ngày khám."
            });
        }

        /*
            Lấy lịch làm việc
        */

        const [schedules] = await db.pool.query(
            `
            SELECT
                id,
                doctor_id,
                schedule_date,
                start_time,
                end_time,
                status
            FROM schedules
            WHERE doctor_id = ?
              AND schedule_date = ?
              AND status = 'AVAILABLE'
            ORDER BY start_time ASC
            `,
            [doctorId, date]
        );

        if (schedules.length === 0) {
            return res.json({
                success: true,
                data: []
            });
        }

        /*
            Lấy các cuộc hẹn đã tồn tại
        */

        const [appointments] = await db.pool.query(
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
                schedules.map(schedule => schedule.id)
            ]
        );

        /*
            Chuyển các giờ đã đặt thành Set
        */

        const bookedSlots = new Set(
            appointments.map(
                appointment =>
                    `${appointment.schedule_id}_${appointment.appointment_time}`
            )
        );

        /*
            Mỗi lượt khám = 30 phút
        */

        const SLOT_MINUTES = 30;

        const slots = [];

        for (const schedule of schedules) {

            const start = new Date(
                `1970-01-01T${schedule.start_time}`
            );

            const end = new Date(
                `1970-01-01T${schedule.end_time}`
            );

            let current = new Date(start);

            while (
                current.getTime() + SLOT_MINUTES * 60000
                <= end.getTime()
            ) {

                const hour = String(
                    current.getHours()
                ).padStart(2, "0");

                const minute = String(
                    current.getMinutes()
                ).padStart(2, "0");

                const time = `${hour}:${minute}:00`;

                const key =
                    `${schedule.id}_${time}`;

                slots.push({
                    schedule_id: schedule.id,
                    doctor_id: doctorId,
                    date: schedule.schedule_date,
                    time,
                    available: !bookedSlots.has(key)
                });

                current = new Date(
                    current.getTime()
                    + SLOT_MINUTES * 60000
                );
            }
        }

        res.json({
            success: true,
            data: slots
        });

    } catch (error) {
        console.error(
            "GET AVAILABLE SLOTS ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Không thể lấy giờ khám."
        });
    }
}


/*
    ============================================
    ĐẶT LỊCH KHÁM
    POST /api/appointments
    ============================================
*/

async function createAppointment(req, res) {

    const connection =
        await db.pool.getConnection();

    try {

        const {
            patient_id,
            doctor_id,
            schedule_id,
            appointment_time,
            reason
        } = req.body;


        /*
            Kiểm tra dữ liệu
        */

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


        await connection.beginTransaction();


        /*
            Kiểm tra bệnh nhân
        */

        const [patients] =
            await connection.query(
                `
                SELECT id
                FROM users
                WHERE id = ?
                  AND role = 'PATIENT'
                LIMIT 1
                `,
                [patient_id]
            );


        if (patients.length === 0) {

            await connection.rollback();

            return res.status(404).json({
                success: false,
                message:
                    "Không tìm thấy tài khoản bệnh nhân."
            });
        }


        /*
            Kiểm tra bác sĩ
        */

        const [doctors] =
            await connection.query(
                `
                SELECT id
                FROM doctors
                WHERE id = ?
                LIMIT 1
                `,
                [doctor_id]
            );


        if (doctors.length === 0) {

            await connection.rollback();

            return res.status(404).json({
                success: false,
                message:
                    "Không tìm thấy bác sĩ."
            });
        }


        /*
            Kiểm tra schedule
        */

        const [schedules] =
            await connection.query(
                `
                SELECT
                    id,
                    doctor_id,
                    schedule_date,
                    start_time,
                    end_time,
                    status
                FROM schedules
                WHERE id = ?
                  AND doctor_id = ?
                FOR UPDATE
                `,
                [
                    schedule_id,
                    doctor_id
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


        /*
            Kiểm tra lịch có mở không
        */

        if (schedule.status !== "AVAILABLE") {

            await connection.rollback();

            return res.status(400).json({
                success: false,
                message:
                    "Lịch khám này hiện không khả dụng."
            });
        }


        /*
            Kiểm tra giờ khám nằm trong lịch
        */

        if (
            appointment_time < schedule.start_time ||
            appointment_time >= schedule.end_time
        ) {

            await connection.rollback();

            return res.status(400).json({
                success: false,
                message:
                    "Giờ khám không nằm trong lịch làm việc của bác sĩ."
            });
        }


        /*
            Kiểm tra bệnh nhân đã có lịch
            cùng thời gian hay chưa
        */

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


        if (patientExisting.length > 0) {

            await connection.rollback();

            return res.status(409).json({
                success: false,
                message:
                    "Bạn đã có một lịch khám vào thời gian này."
            });
        }


        /*
            Kiểm tra giờ này đã có bệnh nhân
            đặt với bác sĩ hay chưa
        */

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
                    doctor_id,
                    schedule_id,
                    appointment_time
                ]
            );


        if (doctorExisting.length > 0) {

            await connection.rollback();

            return res.status(409).json({
                success: false,
                message:
                    "Giờ khám này đã được đặt."
            });
        }


        /*
            Tạo cuộc hẹn
        */

        const [result] =
            await connection.query(
                `
                INSERT INTO appointments
                (
                    patient_id,
                    doctor_id,
                    schedule_id,
                    appointment_time,
                    reason,
                    status
                )
                VALUES (?, ?, ?, ?, ?, 'PENDING')
                `,
                [
                    patient_id,
                    doctor_id,
                    schedule_id,
                    appointment_time,
                    reason || null
                ]
            );


        await connection.commit();


        res.status(201).json({

            success: true,

            message:
                "Đặt lịch khám thành công.",

            data: {
                id: result.insertId,
                patient_id,
                doctor_id,
                schedule_id,
                appointment_time,
                reason: reason || null,
                status: "PENDING"
            }

        });


    } catch (error) {

        await connection.rollback();

        console.error(
            "CREATE APPOINTMENT ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Không thể đặt lịch khám."
        });

    } finally {

        connection.release();

    }
}


/*
    ============================================
    LẤY LỊCH KHÁM CỦA BỆNH NHÂN
    GET /api/patients/:patientId/appointments
    ============================================
*/

async function getPatientAppointments(req, res) {

    try {

        const { patientId } =
            req.params;


        const [rows] =
            await db.pool.query(
                `
                SELECT
                    a.id,
                    a.patient_id,
                    a.doctor_id,
                    a.schedule_id,
                    a.appointment_time,
                    a.reason,
                    a.status,
                    s.schedule_date,

                    u.full_name AS doctor_name,

                    sp.name AS specialty_name

                FROM appointments a

                JOIN schedules s
                    ON a.schedule_id = s.id

                JOIN doctors d
                    ON a.doctor_id = d.id

                JOIN users u
                    ON d.user_id = u.id

                JOIN specialties sp
                    ON d.specialty_id = sp.id

                WHERE a.patient_id = ?

                ORDER BY
                    s.schedule_date DESC,
                    a.appointment_time DESC
                `,
                [patientId]
            );


        res.json({

            success: true,

            data: rows

        });


    } catch (error) {

        console.error(
            "GET PATIENT APPOINTMENTS ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "Không thể lấy lịch khám."

        });

    }
}


/*
    ============================================
    HỦY LỊCH KHÁM
    PATCH /api/appointments/:id/cancel
    ============================================
*/

async function cancelAppointment(req, res) {

    try {

        const { id } =
            req.params;


        const [result] =
            await db.pool.query(
                `
                UPDATE appointments

                SET status = 'CANCELLED'

                WHERE id = ?

                  AND status IN
                  (
                      'PENDING',
                      'CONFIRMED'
                  )
                `,
                [id]
            );


        if (result.affectedRows === 0) {

            return res.status(404).json({

                success: false,

                message:
                    "Không tìm thấy lịch hoặc lịch không thể hủy."

            });

        }


        res.json({

            success: true,

            message:
                "Đã hủy lịch khám."

        });


    } catch (error) {

        console.error(
            "CANCEL APPOINTMENT ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "Không thể hủy lịch."

        });

    }
}


module.exports = {

    getAvailableSlots,

    createAppointment,

    getPatientAppointments,

    cancelAppointment

};