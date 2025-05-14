document.addEventListener('DOMContentLoaded', () => {
    console.log('Dashboard loaded');
    
    // Example data that would come from your backend
    const mockUserData = {
        username: sessionStorage.getItem('loggedInUser') || 'player1',
        subscription: 'Premium',
        gamesPlayed: 42,
        totalPlayTime: '126h 35m'
    };
    
    // Logout button functionality
    const logoutButton = document.querySelector('.logout-btn');
    logoutButton.addEventListener('click', () => {
        // Clear session data
        sessionStorage.removeItem('loggedInUser');
        // Redirect to login page
        window.location.href = '../index.html';
    });
    
    // This functionality is now in the inline script in dashboard.html
    // for the sidebar toggle and menu interaction
});