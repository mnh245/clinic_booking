-- =====================================================
-- DATABASE: CLINIC BOOKING
-- =====================================================

DROP DATABASE IF EXISTS clinic_booking;

CREATE DATABASE clinic_booking
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE clinic_booking;



CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,

    full_name VARCHAR(100) NOT NULL,

    email VARCHAR(100) NOT NULL UNIQUE,

    password VARCHAR(255) NOT NULL,

    phone VARCHAR(20),

    gender ENUM('MALE', 'FEMALE', 'OTHER'),

    date_of_birth DATE,

    role ENUM('PATIENT', 'DOCTOR', 'ADMIN')
        NOT NULL DEFAULT 'PATIENT',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
);



CREATE TABLE specialties (
    id INT AUTO_INCREMENT PRIMARY KEY,

    name VARCHAR(100) NOT NULL UNIQUE,

    description TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);




CREATE TABLE doctors (
    id INT AUTO_INCREMENT PRIMARY KEY,

    user_id INT NOT NULL UNIQUE,

    specialty_id INT NOT NULL,

    license_number VARCHAR(100),

    experience_years INT DEFAULT 0,

    qualification VARCHAR(255),

    introduction TEXT,

    avatar VARCHAR(255),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_doctor_user
        FOREIGN KEY (user_id)
        REFERENCES users(id),

    CONSTRAINT fk_doctor_specialty
        FOREIGN KEY (specialty_id)
        REFERENCES specialties(id)
);



CREATE TABLE schedules (
    id INT AUTO_INCREMENT PRIMARY KEY,

    doctor_id INT NOT NULL,

    schedule_date DATE NOT NULL,

    start_time TIME NOT NULL,

    end_time TIME NOT NULL,

    status ENUM('AVAILABLE', 'CLOSED')
        NOT NULL DEFAULT 'AVAILABLE',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_schedule_doctor
        FOREIGN KEY (doctor_id)
        REFERENCES doctors(id)
);



CREATE TABLE appointments (
    id INT AUTO_INCREMENT PRIMARY KEY,

    patient_id INT NOT NULL,

    doctor_id INT NOT NULL,

    schedule_id INT NOT NULL,

    appointment_time TIME NOT NULL,

    reason TEXT,

    status ENUM(
        'PENDING',
        'CONFIRMED',
        'COMPLETED',
        'CANCELLED'
    )
    NOT NULL DEFAULT 'PENDING',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_appointment_patient
        FOREIGN KEY (patient_id)
        REFERENCES users(id),

    CONSTRAINT fk_appointment_doctor
        FOREIGN KEY (doctor_id)
        REFERENCES doctors(id),

    CONSTRAINT fk_appointment_schedule
        FOREIGN KEY (schedule_id)
        REFERENCES schedules(id)
);



CREATE TABLE reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,

    patient_id INT NOT NULL,

    doctor_id INT NOT NULL,

    appointment_id INT,

    rating TINYINT NOT NULL,

    comment TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_review_patient
        FOREIGN KEY (patient_id)
        REFERENCES users(id),

    CONSTRAINT fk_review_doctor
        FOREIGN KEY (doctor_id)
        REFERENCES doctors(id),

    CONSTRAINT fk_review_appointment
        FOREIGN KEY (appointment_id)
        REFERENCES appointments(id),

    CONSTRAINT chk_rating
        CHECK (rating BETWEEN 1 AND 5)
);