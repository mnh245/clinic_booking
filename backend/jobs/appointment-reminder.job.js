"use strict";

const cron = require("node-cron");
const { pool } = require("../config/db");

const {
    sendSms,
    isSmsConfigured,
    isSmsSandbox
} = require("../services/sms.service");

let isRunning = false;

async function processAppointmentReminders() {
    // Không gửi/đánh dấu nhắc lịch trong chế độ Sandbox.
    if (!isSmsConfigured() || isSmsSandbox()) {
        return;
    }

    const appointmentAt =
        "TIMESTAMP(s.schedule_date, a.appointment_time)";

    const [appointments] = await pool.query(`
        SELECT
            a.id,
            a.contact_name,
            a.contact_phone,
            a.confirmation_sms_sent,
            a.reminder_24h_sent,
            a.reminder_2h_sent,

            DATE_FORMAT(
                s.schedule_date,
                '%d/%m/%Y'
            ) AS appointment_date_display,

            TIME_FORMAT(
                a.appointment_time,
                '%H:%i'
            ) AS appointment_time_display,

            du.full_name AS doctor_name,

            CASE
                WHEN a.confirmation_sms_sent = 0
                    THEN 'CONFIRM'

                WHEN a.reminder_2h_sent = 0
                 AND ${appointmentAt}
                    <= DATE_ADD(NOW(), INTERVAL 2 HOUR)
                    THEN '2H'

                ELSE '24H'
            END AS notification_type

        FROM appointments a

        INNER JOIN schedules s
            ON s.id = a.schedule_id

        INNER JOIN doctors d
            ON d.id = a.doctor_id

        INNER JOIN users du
            ON du.id = d.user_id

        WHERE a.status = 'CONFIRMED'
          AND a.sms_opt_in = 1
          AND a.contact_phone IS NOT NULL
          AND a.contact_phone <> ''
          AND ${appointmentAt} > NOW()

          AND (
              a.confirmation_sms_sent = 0

              OR (
                  a.reminder_2h_sent = 0
                  AND ${appointmentAt}
                      <= DATE_ADD(NOW(), INTERVAL 2 HOUR)
              )

              OR (
                  a.reminder_24h_sent = 0
                  AND ${appointmentAt}
                      > DATE_ADD(NOW(), INTERVAL 2 HOUR)
                  AND ${appointmentAt}
                      <= DATE_ADD(NOW(), INTERVAL 24 HOUR)
              )
          )

        ORDER BY ${appointmentAt} ASC
        LIMIT 100
    `);

    for (const appointment of appointments) {
        const type = appointment.notification_type;

        let flagColumn;
        let content;

        if (type === "CONFIRM") {
            flagColumn = "confirmation_sms_sent";

            content =
                `Clinic Booking: Lich kham cua ` +
                `${appointment.contact_name} da duoc xac nhan. ` +
                `Ngay ${appointment.appointment_date_display}, luc ` +
                `${appointment.appointment_time_display}, voi BS ` +
                `${appointment.doctor_name}.`;
        } else if (type === "2H") {
            flagColumn = "reminder_2h_sent";

            content =
                `Clinic Booking: Nhac lich kham cua ` +
                `${appointment.contact_name} vao luc ` +
                `${appointment.appointment_time_display}, ngay ` +
                `${appointment.appointment_date_display}. Vui long den som 15 phut.`;
        } else {
            flagColumn = "reminder_24h_sent";

            content =
                `Clinic Booking: Nhac lich kham cua ` +
                `${appointment.contact_name} vao luc ` +
                `${appointment.appointment_time_display}, ngay ` +
                `${appointment.appointment_date_display}. Vui long den som 15 phut.`;
        }

        try {
            await sendSms(
                appointment.contact_phone,
                content
            );

            await pool.query(
                `
                UPDATE appointments
                SET ${flagColumn} = 1
                WHERE id = ?
                  AND ${flagColumn} = 0
                  AND status = 'CONFIRMED'
                  AND sms_opt_in = 1
                `,
                [appointment.id]
            );

            console.log(
                `SMS ${type} accepted for appointment ${appointment.id}`
            );
        } catch (error) {
            // Không đổi cờ nếu gửi thất bại; lần kiểm tra sau có thể thử lại.
            console.error(
                `SMS ${type} failed for appointment ${appointment.id}:`,
                error.message
            );
        }
    }
}

function startAppointmentReminderJob() {
    if (!isSmsConfigured()) {
        console.warn(
            "SMS reminder chưa chạy: chưa cấu hình eSMS."
        );
        return;
    }

    if (isSmsSandbox()) {
        console.warn(
            "SMS reminder chưa chạy vì ESMS_SANDBOX=1; chế độ này không gửi SMS thật."
        );
        return;
    }

    cron.schedule(
        "* * * * *",
        async function () {
            if (isRunning) {
                return;
            }

            isRunning = true;

            try {
                await processAppointmentReminders();
            } catch (error) {
                console.error(
                    "APPOINTMENT REMINDER JOB ERROR:",
                    error.message
                );
            } finally {
                isRunning = false;
            }
        },
        {
            timezone: "Asia/Ho_Chi_Minh"
        }
    );

    console.log(
        "Appointment SMS reminder job started."
    );
}

module.exports = {
    startAppointmentReminderJob,
    processAppointmentReminders
};