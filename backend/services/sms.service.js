"use strict";

const SMS_API_URL =
    "https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/";

function isSmsSandbox() {
    return String(process.env.ESMS_SANDBOX ?? "1") !== "0";
}

function isSmsConfigured() {
    const apiKey = process.env.ESMS_API_KEY?.trim();
    const secretKey = process.env.ESMS_SECRET_KEY?.trim();
    const smsType = String(process.env.ESMS_SMS_TYPE || "2");
    const brandname = process.env.ESMS_BRANDNAME?.trim();
    return Boolean(
        apiKey &&
        secretKey &&
        (smsType !== "2" || brandname)
    );
}

function normalizeVietnamPhone(phone) {
    let value = String(phone ?? "")
        .trim()
        .replace(/[^\d+]/g, "");
    if (value.startsWith("+84")) {
        value = "0" + value.slice(3);
    } else if (value.startsWith("84")) {
        value = "0" + value.slice(2);
    }
    return value;
}

async function sendSms(phone, content) {
    if (!isSmsConfigured()) {
        throw new Error(
            "Chưa cấu hình API SMS hoặc Brandname eSMS."
        );
    }
    const targetPhone = normalizeVietnamPhone(phone);
    if (!/^0\d{9}$/.test(targetPhone)) {
        throw new Error(
            "Số điện thoại nhận SMS không hợp lệ."
        );
    }
    const payload = {
        ApiKey: process.env.ESMS_API_KEY.trim(),
        SecretKey: process.env.ESMS_SECRET_KEY.trim(),
        Phone: targetPhone,
        Content: String(content),
        SmsType: String(process.env.ESMS_SMS_TYPE || "2"),
        IsUnicode: "1",
        Sandbox: isSmsSandbox() ? "1" : "0"
    };
    if (process.env.ESMS_BRANDNAME?.trim()) {
        payload.Brandname =
            process.env.ESMS_BRANDNAME.trim();
    }
    const response = await fetch(SMS_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000)
    });
    const responseText = await response.text();
    let data;
    try {
        data = JSON.parse(responseText);
    } catch {
        throw new Error(
            "Phản hồi từ nhà cung cấp SMS không phải JSON hợp lệ."
        );
    }
    const resultCode = String(
        data.CodeResult ?? data.CodeResponse ?? ""
    );
    if (!response.ok || resultCode !== "100") {
        throw new Error(
            data.ErrorMessage ||
            `eSMS từ chối yêu cầu, mã lỗi: ${resultCode || "không xác định"}.`
        );
    }
    // Mã 100 cho biết yêu cầu đã được nhà cung cấp tiếp nhận;
    // không bảo đảm tin nhắn đã đến điện thoại.
    return data;
}

module.exports = {
    sendSms,
    isSmsConfigured,
    isSmsSandbox,
    normalizeVietnamPhone
};