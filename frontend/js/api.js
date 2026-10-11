/**
 * Gọi API và trả về dữ liệu đã parse (JSON hoặc text).
 * Ném Error với thông báo dễ hiểu nếu request thất bại.
 */
async function apiFetch(url, options = {}) {
    const config = {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...options.headers
        }
    };

    try {
        const response = await fetch(url, config);

        const contentType = response.headers.get("content-type") || "";
        const isJson = contentType.includes("application/json");
        const data = isJson ? await response.json() : await response.text();

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

        // fetch ném TypeError khi mất mạng / server không phản hồi
        if (error instanceof TypeError) {
            throw new Error("Không thể kết nối đến máy chủ.");
        }

        throw error;
    }
}