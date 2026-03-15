// Lấy base URL (http://localhost:3000 hoặc origin hiện tại)
const baseUrl = window.location.origin === 'http://127.0.0.1:5500' || window.location.protocol === 'file:'
    ? 'http://localhost:3000'
    : window.location.origin;

// Cập nhật link đăng nhập
const loginLink = document.querySelector('.login-link a');
if (loginLink) {
    loginLink.href = `${baseUrl}/user/login.html`;
}

const registerForm = document.getElementById('registerForm');
const errorMessage = document.getElementById('errorMessage');
const successMessage = document.getElementById('successMessage');
const submitBtn = document.getElementById('submitBtn');
const dobInput = document.getElementById('dob');

// Giới hạn ngày sinh không được chọn sau ngày hiện tại
const todayStr = new Date().toISOString().split('T')[0];
if (dobInput) dobInput.max = todayStr;

if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = document.getElementById('username').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const dob = document.getElementById('dob').value; // YYYY-MM-DD

        // Ẩn thông báo cũ
        errorMessage.classList.remove('show');
        successMessage.classList.remove('show');
        // Kiểm tra mật khẩu khớp
        if (password !== confirmPassword) {
            errorMessage.textContent = 'Mật khẩu không khớp';
            errorMessage.classList.add('show');
            return;
        }

        // Kiểm tra ngày sinh không sau ngày hiện tại
        if (dob && dob > todayStr) {
            errorMessage.textContent = 'Ngày sinh không được sau ngày hiện tại';
            errorMessage.classList.add('show');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang xử lý...';

        try {
            const response = await fetch(`${baseUrl}/api/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ username, email, password, dob })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                successMessage.textContent = 'Đăng ký thành công! Chuyển hướng...';
                successMessage.classList.add('show');
                setTimeout(() => {
                    window.location.href = `${baseUrl}/user/login.html`;
                }, 1200);
            } else {
                errorMessage.textContent = data.error || 'Đăng ký thất bại';
                errorMessage.classList.add('show');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Đăng ký';
            }
        } catch (error) {
            console.error('Lỗi:', error);
            errorMessage.textContent = 'Không thể kết nối với server';
            errorMessage.classList.add('show');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Đăng ký';
        }
    });
}
