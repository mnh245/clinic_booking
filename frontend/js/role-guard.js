document.addEventListener("DOMContentLoaded", function () {
    const userData = localStorage.getItem("user");
    // Chưa đăng nhập
    if (!userData) {
        window.location.href = "login.html";
        return;
    }
    let user;
    try {
        user = JSON.parse(userData);
    } catch (error) {
        localStorage.removeItem("user");
        window.location.href = "login.html";
        return;
    }
    const role = user.role;
    console.log("Người dùng:", user);
    console.log("Role:", role);
    // Lấy role mà trang hiện tại yêu cầu
    const requiredRole = document.body.dataset.role;
    if (!requiredRole) {
        return;
    }
    // Cho phép nhiều role:
    // data-role="DOCTOR,ADMIN"
    const allowedRoles = requiredRole
        .split(",")
        .map(item => item.trim());
    if (!allowedRoles.includes(role)) {
        alert("Bạn không có quyền truy cập trang này.");
        // Người dùng không đúng quyền quay về trang chủ
        window.location.href = "home.html";
    }
});