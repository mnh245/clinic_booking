/**
 * Gọi API và trả về dữ liệu JSON hoặc text.
 */
async function apiFetch(url, options = {}) {
    const config = {
        ...options,

        // Gửi cookie session cùng yêu cầu API
        credentials: "include",

        // Tránh dùng phản hồi cache cũ khi kiểm tra session
        cache: "no-store",

        headers: {
            "Content-Type": "application/json",
            ...options.headers
        }
    };

    try {
        const response = await fetch(url, config);

        const contentType = response.headers.get("content-type") || "";
        const isJson = contentType.includes("application/json");

        const data = isJson
            ? await response.json()
            : await response.text();

        if (!response.ok) {
            const message =
                typeof data === "object" && data?.message
                    ? data.message
                    : `API trả về lỗi ${response.status}`;

            throw new Error(message);
        }

        return data;
    } catch (error) {
        console.error("API ERROR:", error);

        if (error instanceof TypeError) {
            throw new Error("Không thể kết nối đến máy chủ.");
        }

        throw error;
    }
}