document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.querySelector('.login-form');
    const errorMessage = document.createElement('div');
    errorMessage.className = 'error-message';
    errorMessage.style.color = '#ff3333';
    errorMessage.style.marginTop = '10px';
    errorMessage.style.display = 'none';
    loginForm.appendChild(errorMessage);
    
    // Hardcoded users for client-side demo
    const users = [
        { username: 'admin', password: 'admin123' },
        { username: 'user1', password: 'password123' },
        { username: 'frozenanalyst', password: '123' }
    ];
    
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        // Clear previous error messages
        errorMessage.style.display = 'none';
        errorMessage.textContent = '';
        
        // Check if the user exists
        const user = users.find(u => u.username === username && u.password === password);
        
        if (user) {
            // Successful login
            console.log('Login successful');
            // Store the username in localStorage or sessionStorage if needed
            sessionStorage.setItem('loggedInUser', username);
            window.location.href = 'pages/dashboard.html';
        } else {
            // Failed login
            errorMessage.textContent = 'Invalid username or password';
            errorMessage.style.display = 'block';
        }
    });
});