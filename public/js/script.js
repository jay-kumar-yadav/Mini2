// document.addEventListener('DOMContentLoaded', function() {
//     // Common functionality
//     setCurrentDate();
    
//     // Check if user is logged in
//     const token = getCookie('token');
//     if (!token && !window.location.pathname.includes('/login')) {
//         window.location.href = '/login';
//     }
    
//     // Page-specific functionality
//     if (window.location.pathname === '/login') {
//         setupLoginPage();
//     } else if (window.location.pathname === '/dashboard') {
//         setupDashboardPage();
//     } else if (window.location.pathname === '/mark-attendance') {
//         setupMarkAttendancePage();
//     } else if (window.location.pathname === '/view-records') {
//         setupViewRecordsPage();
//     } else if (window.location.pathname === '/export') {
//         setupExportPage();
//     }
    
//     // Logout button (present on all pages except login)
//     const logoutBtn = document.getElementById('logoutBtn');
//     if (logoutBtn) {
//         logoutBtn.addEventListener('click', logout);
//     }
// });

document.addEventListener('DOMContentLoaded', async function() {
    // Common functionality
    setCurrentDate();
    
    // First check authentication state
    const token = getCookie('token');
    const isLoginPage = window.location.pathname === '/login';
    
    // If no token and not on login page, redirect to login
    if (!token && !isLoginPage) {
        window.location.href = '/login';
        return; // Important to stop execution
    }
    
    // If token exists and we're on login page, redirect to dashboard
    if (token && isLoginPage) {
        window.location.href = '/dashboard';
        return; // Important to stop execution
    }
    
    // If we get here, we're either:
    // 1. Logged in and on a protected page, or
    // 2. Not logged in and on the login page
    
    try {
        // For protected pages, verify the token is still valid
        if (token) {
            const isValid = await verifyToken(token);
            if (!isValid) {
                // Token is invalid, clear it and redirect
                document.cookie = 'token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
                window.location.href = '/login';
                return;
            }
        }
        
        // Now setup page-specific functionality
        if (isLoginPage) {
            setupLoginPage();
        } else if (window.location.pathname === '/dashboard') {
            setupDashboardPage();
        } else if (window.location.pathname === '/mark-attendance') {
            setupMarkAttendancePage();
        } else if (window.location.pathname === '/view-records') {
            setupViewRecordsPage();
        } else if (window.location.pathname === '/export') {
            setupExportPage();
        }
        
        // Setup logout button if present
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', logout);
        }
    } catch (error) {
        console.error('Initialization error:', error);
        // Fallback to login page if something went wrong
        if (!isLoginPage) {
            window.location.href = '/login';
        }
    }
});

// Add this helper function to verify token with server
async function verifyToken(token) {
    try {
        const response = await fetch('/api/validate-token', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            credentials: 'include'
        });
        
        if (!response.ok) return false;
        
        const data = await response.json();
        return data.valid === true;
    } catch (error) {
        console.error('Token verification failed:', error);
        return false;
    }
}

// Enhanced getCookie function
function getCookie(name) {
    const cookies = document.cookie.split('; ');
    for (const cookie of cookies) {
        const [cookieName, cookieValue] = cookie.split('=');
        if (cookieName === name) {
            return decodeURIComponent(cookieValue);
        }
    }
    return null;
}

// Common functions
function setCurrentDate() {
    const dateElements = document.querySelectorAll('#currentDate');
    if (dateElements.length > 0) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const today = new Date().toLocaleDateString(undefined, options);
        dateElements.forEach(el => el.textContent = today);
    }
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

async function fetchWithAuth(url, options = {}) {
    const token = getCookie('token');
    if (!token) {
        window.location.href = '/login';
        return;
    }
    
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
    
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                ...headers,
                ...(options.headers || {})
            }
        });
        
        if (response.status === 401) {
            // Token expired or invalid
            window.location.href = '/login';
            return;
        }
        
        return response;
    } catch (err) {
        console.error('Fetch error:', err);
        showError('Network error. Please try again.');
    }
}

function showError(message) {
    const errorElement = document.getElementById('errorMessage');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.remove('hidden');
        setTimeout(() => errorElement.classList.add('hidden'), 5000);
    } else {
        alert(message);
    }
}

// Login page

function setupLoginPage() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            
            const submitBtn = loginForm.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';

            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include', // Essential for cookies
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.message || 'Login failed');
                }

                if (data.success) {
                    // Verify cookie is set before redirect
                    const checkCookie = () => {
                        const token = getCookie('token');
                        if (token) {
                            window.location.href = data.redirect;
                        } else if (Date.now() - startTime < 2000) {
                            setTimeout(checkCookie, 100);
                        } else {
                            throw new Error('Cookie not set properly');
                        }
                    };
                    
                    const startTime = Date.now();
                    checkCookie();
                } else {
                    throw new Error(data.message || 'Login failed');
                }
            } catch (err) {
                console.error('Login error:', err);
                showError(err.message || 'Login failed. Please try again.');
                submitBtn.disabled = false;
                submitBtn.textContent = originalBtnText;
            }
        });
    }
}
// Dashboard page
function setupDashboardPage() {
    // Load dashboard data
    loadDashboardData();
    
    // Set up auto-refresh every 30 seconds
    setInterval(loadDashboardData, 30000);
}

async function loadDashboardData() {
    try {
        const response = await fetchWithAuth('/api/dashboard');
        if (!response) return;
        
        const data = await response.json();
        
        // Update stats
        document.getElementById('totalStudents').textContent = data.totalStudents;
        
        // Update today's attendance
        const presentToday = data.todayAttendance.find(a => a.status === 'present')?.count || 0;
        const absentToday = data.todayAttendance.find(a => a.status === 'absent')?.count || 0;
        const lateToday = data.todayAttendance.find(a => a.status === 'late')?.count || 0;
        
        document.getElementById('presentToday').textContent = presentToday;
        document.getElementById('absentToday').textContent = absentToday + lateToday; // Combine absent and late
        
        // Today's chart
        renderTodayChart(presentToday, absentToday, lateToday);
        
        // Weekly chart
        renderWeeklyChart(data.weeklyAttendance);
    } catch (err) {
        console.error('Error loading dashboard data:', err);
    }
}

function renderTodayChart(present, absent, late) {
    const ctx = document.getElementById('todayChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (window.todayChart) {
        window.todayChart.destroy();
    }
    
    window.todayChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Present', 'Absent', 'Late'],
            datasets: [{
                data: [present, absent, late],
                backgroundColor: [
                    '#10B981', // green
                    '#EF4444', // red
                    '#F59E0B' // yellow
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

function renderWeeklyChart(weeklyData) {
    const ctx = document.getElementById('weeklyChart').getContext('2d');
    
    // Process weekly data
    const dates = [];
    const presentData = [];
    const absentData = [];
    const lateData = [];
    
    // Group by date
    const dateMap = {};
    weeklyData.forEach(item => {
        if (!dateMap[item.date]) {
            dateMap[item.date] = {
                present: 0,
                absent: 0,
                late: 0
            };
        }
        dateMap[item.date][item.status] = item.count;
    });
    
    // Prepare data for chart
    Object.keys(dateMap).sort().forEach(date => {
        dates.push(new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
        presentData.push(dateMap[date].present || 0);
        absentData.push(dateMap[date].absent || 0);
        lateData.push(dateMap[date].late || 0);
    });
    
    // Destroy existing chart if it exists
    if (window.weeklyChart) {
        window.weeklyChart.destroy();
    }
    
    window.weeklyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dates,
            datasets: [
                {
                    label: 'Present',
                    data: presentData,
                    backgroundColor: '#10B981', // green
                    borderWidth: 1
                },
                {
                    label: 'Absent',
                    data: absentData,
                    backgroundColor: '#EF4444', // red
                    borderWidth: 1
                },
                {
                    label: 'Late',
                    data: lateData,
                    backgroundColor: '#F59E0B', // yellow
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    stacked: true
                },
                y: {
                    stacked: true,
                    beginAtZero: true
                }
            },
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

// Mark Attendance page
function setupMarkAttendancePage() {
    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('attendanceDate').value = today;
    
    // Load students
    loadStudentsForAttendance();
    
    // Set up date change listener
    document.getElementById('attendanceDate').addEventListener('change', function() {
        loadStudentsForAttendance();
    });
    
    // Set up save button
    document.getElementById('saveAttendanceBtn').addEventListener('click', saveAttendance);
}

async function loadStudentsForAttendance() {
    const date = document.getElementById('attendanceDate').value;
    const studentsList = document.getElementById('studentsList');
    
    if (!date) {
        showError('Please select a date');
        return;
    }
    
    try {
        // Get all students
        const studentsResponse = await fetchWithAuth('/api/students');
        if (!studentsResponse) return;
        const students = await studentsResponse.json();
        
        // Get attendance for the selected date
        const attendanceResponse = await fetchWithAuth(`/api/attendance?date=${date}`);
        if (!attendanceResponse) return;
        const attendance = await attendanceResponse.json();
        
        // Create a map of student_id to attendance status
        const attendanceMap = {};
        attendance.forEach(record => {
            attendanceMap[record.student_id] = record.status;
        });
        
        // Render students list
        studentsList.innerHTML = '';
        
        students.forEach(student => {
            const row = document.createElement('tr');
            
            // Student ID and name
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap">${student.student_id}</td>
                <td class="px-6 py-4 whitespace-nowrap">${student.name}</td>
                <td class="px-6 py-4 whitespace-nowrap">${student.class || '-'}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <select class="status-select border border-gray-300 rounded-md px-3 py-1 focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                        <option value="present" ${attendanceMap[student.student_id] === 'present' ? 'selected' : ''}>Present</option>
                        <option value="absent" ${attendanceMap[student.student_id] === 'absent' ? 'selected' : ''}>Absent</option>
                        <option value="late" ${attendanceMap[student.student_id] === 'late' ? 'selected' : ''}>Late</option>
                    </select>
                </td>
            `;
            
            studentsList.appendChild(row);
        });
    } catch (err) {
        console.error('Error loading students:', err);
        showError('Failed to load students. Please try again.');
    }
}

async function saveAttendance() {
    const date = document.getElementById('attendanceDate').value;
    const statusSelects = document.querySelectorAll('.status-select');
    
    if (!date) {
        showError('Please select a date');
        return;
    }
    
    const attendance = [];
    statusSelects.forEach(select => {
        const row = select.closest('tr');
        const studentId = row.cells[0].textContent;
        
        attendance.push({
            student_id: studentId,
            status: select.value
        });
    });
    
    try {
        const response = await fetchWithAuth('/api/attendance', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ date, attendance })
        });
        
        if (response.ok) {
            alert('Attendance saved successfully');
        } else {
            const data = await response.json();
            showError(data.message || 'Failed to save attendance');
        }
    } catch (err) {
        console.error('Error saving attendance:', err);
        showError('Failed to save attendance. Please try again.');
    }
}

// View Records page
function setupViewRecordsPage() {
    // Load students for filter dropdown
    loadStudentsForFilter();
    
    // Set up filter button
    document.getElementById('filterBtn').addEventListener('click', loadAttendanceRecords);
    
    // Load initial records (today by default)
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('filterDate').value = today;
    loadAttendanceRecords();
}

async function loadStudentsForFilter() {
    const filterStudent = document.getElementById('filterStudent');
    
    try {
        const response = await fetchWithAuth('/api/students');
        if (!response) return;
        
        const students = await response.json();
        
        // Clear existing options except "All Students"
        while (filterStudent.options.length > 1) {
            filterStudent.remove(1);
        }
        
        // Add student options
        students.forEach(student => {
            const option = document.createElement('option');
            option.value = student.student_id;
            option.textContent = `${student.name} (${student.student_id})`;
            filterStudent.appendChild(option);
        });
    } catch (err) {
        console.error('Error loading students:', err);
    }
}

async function loadAttendanceRecords() {
    const date = document.getElementById('filterDate').value;
    const studentId = document.getElementById('filterStudent').value;
    const recordsList = document.getElementById('recordsList');
    
    try {
        let url = '/api/attendance?';
        if (date) url += `date=${date}&`;
        if (studentId) url += `student_id=${studentId}`;
        
        const response = await fetchWithAuth(url);
        if (!response) return;
        
        const records = await response.json();
        
        // Render records
        recordsList.innerHTML = '';
        
        if (records.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="5" class="px-6 py-4 text-center text-gray-500">No records found</td>
            `;
            recordsList.appendChild(row);
            return;
        }
        
        records.forEach(record => {
            const row = document.createElement('tr');
            
            // Status badge
            let statusClass = '';
            if (record.status === 'present') statusClass = 'bg-green-100 text-green-800';
            else if (record.status === 'absent') statusClass = 'bg-red-100 text-red-800';
            else if (record.status === 'late') statusClass = 'bg-yellow-100 text-yellow-800';
            
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap">${record.date}</td>
                <td class="px-6 py-4 whitespace-nowrap">${record.student_id}</td>
                <td class="px-6 py-4 whitespace-nowrap">${record.name}</td>
                <td class="px-6 py-4 whitespace-nowrap">${record.class || '-'}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}">
                        ${record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                    </span>
                </td>
            `;
            
            recordsList.appendChild(row);
        });
    } catch (err) {
        console.error('Error loading records:', err);
        showError('Failed to load records. Please try again.');
    }
}

// Export page
function setupExportPage() {
    // Set default dates (last 7 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 7);
    
    document.getElementById('startDate').value = startDate.toISOString().split('T')[0];
    document.getElementById('endDate').value = endDate.toISOString().split('T')[0];
    document.getElementById('startDatePdf').value = startDate.toISOString().split('T')[0];
    document.getElementById('endDatePdf').value = endDate.toISOString().split('T')[0];
    
    // Set up export buttons
    document.getElementById('exportExcelBtn').addEventListener('click', exportToExcel);
    document.getElementById('exportPdfBtn').addEventListener('click', exportToPdf);
}

function exportToExcel() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    
    if (!startDate || !endDate) {
        showError('Please select both start and end dates');
        return;
    }
    
    window.location.href = `/api/export/excel?startDate=${startDate}&endDate=${endDate}`;
}

function exportToPdf() {
    const startDate = document.getElementById('startDatePdf').value;
    const endDate = document.getElementById('endDatePdf').value;
    
    if (!startDate || !endDate) {
        showError('Please select both start and end dates');
        return;
    }
    
    window.location.href = `/api/export/pdf?startDate=${startDate}&endDate=${endDate}`;
}

// Logout
async function logout() {
    try {
        await fetch('/api/logout', {
            method: 'POST',
            credentials: 'same-origin'
        });
        
        // Clear token and redirect to login
        document.cookie = 'token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
        window.location.href = '/login';
    } catch (err) {
        console.error('Error logging out:', err);
        showError('Failed to logout. Please try again.');
    }
}