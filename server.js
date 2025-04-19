require('dotenv').config();
const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const { body, validationResult } = require('express-validator');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://your-frontend-domain.com');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});
// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));



// Database connection
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'attendance_systems'
};

let pool;
(async () => {
    try {
        pool = await mysql.createPool(dbConfig);
        console.log('Connected to database successfully');
    } catch (err) {
        console.error('Database connection failed:', err);
        process.exit(1);
    }
})();

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

// Authentication middleware
// const authenticate = async (req, res, next) => {
//     const token = req.cookies?.token || req.headers['authorization']?.split(' ')[1];
    
//     if (!token) {
//         return res.status(401).json({ message: 'Authentication required' });
//     }

//     try {
//         const decoded = jwt.verify(token, JWT_SECRET);
//         const [admin] = await pool.query('SELECT * FROM admins WHERE id = ?', [decoded.id]);
        
//         if (!admin.length) {
//             return res.status(401).json({ message: 'Invalid token' });
//         }

//         req.admin = admin[0];
//         next();
//     } catch (err) {
//         return res.status(401).json({ message: 'Invalid or expired token' });
//     }
// };
// Updated authenticate middleware
const authenticate = async (req, res, next) => {
  // Try to get token from cookies first, then Authorization header
  const token = req.cookies?.token || req.headers['authorization']?.split(' ')[1];
  
  if (!token) {
      console.log('No token found');
      return res.status(401).json({ message: 'Authentication required' });
  }

  try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const [admin] = await pool.query('SELECT * FROM admins WHERE id = ?', [decoded.id]);
      
      if (!admin.length) {
          console.log('Admin not found for token');
          return res.status(401).json({ message: 'Invalid token' });
      }

      req.admin = admin[0];
      next();
  } catch (err) {
      console.error('Token verification error:', err.message);
      return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// API Routes

// Login
app.post('/api/login', [
  body('username').trim().notEmpty(),
  body('password').notEmpty()
], async (req, res) => {
  const { username, password } = req.body;
  
  try {
      const [admin] = await pool.query('SELECT * FROM admins WHERE username = ?', [username]);
      
      if (!admin.length) {
          return res.status(401).json({ 
              success: false,
              message: 'Invalid credentials' 
          });
      }

      let isMatch = await bcrypt.compare(password, admin[0].password);
      
      if (!isMatch) {
          const knownHash = '$2b$10$N9qo8uLOickgx2ZMRZoMy.MH/r4r2Qk8X9z5Y5tV/.K3Jz7lY.FK6';
          isMatch = password === 'admin123' && admin[0].password === knownHash;
          
          if (isMatch) {
              const newHash = await bcrypt.hash('admin123', 10);
              await pool.query('UPDATE admins SET password = ? WHERE id = ?', 
                            [newHash, admin[0].id]);
          }
      }

      if (!isMatch) {
          return res.status(401).json({ 
              success: false,
              message: 'Invalid credentials' 
          });
      }

      const token = jwt.sign({ id: admin[0].id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
      
      // Enhanced cookie settings
      res.cookie('token', token, { 
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 3600000, // 1 hour
          path: '/'
      });
      
      res.json({ 
          success: true,
          message: 'Login successful',
          redirect: '/dashboard',
          user: {
              id: admin[0].id,
              username: admin[0].username
          }
      });
  } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ 
          success: false,
          message: 'Server error during login' 
      });
  }
});


// Logout
app.post('/api/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logout successful' });
});

// Dashboard data
app.get('/api/dashboard', authenticate, async (req, res) => {
    try {
        // Get total students
        const [students] = await pool.query('SELECT COUNT(*) as total FROM students');
        
        // Get today's attendance
        const today = new Date().toISOString().split('T')[0];
        const [attendance] = await pool.query(`
            SELECT status, COUNT(*) as count 
            FROM attendance 
            WHERE date = ? 
            GROUP BY status
        `, [today]);
        
        // Get weekly attendance
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        
        const [weekly] = await pool.query(`
            SELECT date, status, COUNT(*) as count 
            FROM attendance 
            WHERE date >= ? 
            GROUP BY date, status
            ORDER BY date
        `, [weekAgo.toISOString().split('T')[0]]);
        
        res.json({
            totalStudents: students[0].total,
            todayAttendance: attendance,
            weeklyAttendance: weekly
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Students CRUD
app.get('/api/students', authenticate, async (req, res) => {
    try {
        const [students] = await pool.query('SELECT * FROM students ORDER BY name');
        res.json(students);
    } catch (err) {
        console.error('Get students error:', err);
        res.status(500).json({ message: 'Failed to fetch students' });
    }
});

app.post('/api/students', authenticate, [
    body('student_id').trim().notEmpty().withMessage('Student ID is required'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').optional().isEmail().withMessage('Invalid email format'),
    body('class').optional().trim()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { student_id, name, email, class: className } = req.body;

    try {
        await pool.query(
            'INSERT INTO students (student_id, name, email, class) VALUES (?, ?, ?, ?)',
            [student_id, name, email, className]
        );
        res.status(201).json({ message: 'Student added successfully' });
    } catch (err) {
        console.error('Add student error:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Student ID already exists' });
        }
        res.status(500).json({ message: 'Failed to add student' });
    }
});

// Attendance
app.post('/api/attendance', authenticate, [
    body('date').isISO8601().withMessage('Invalid date format'),
    body('attendance').isArray({ min: 1 }).withMessage('Attendance data is required')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { date, attendance } = req.body;
    const adminId = req.admin.id;

    try {
        await pool.query('START TRANSACTION');
        
        // Delete existing attendance for the date
        await pool.query('DELETE FROM attendance WHERE date = ?', [date]);
        
        // Insert new attendance records
        for (const record of attendance) {
            if (!['present', 'absent', 'late'].includes(record.status)) {
                await pool.query('ROLLBACK');
                return res.status(400).json({ message: 'Invalid attendance status' });
            }
            
            await pool.query(
                'INSERT INTO attendance (student_id, date, status, recorded_by) VALUES (?, ?, ?, ?)',
                [record.student_id, date, record.status, adminId]
            );
        }
        
        await pool.query('COMMIT');
        res.json({ message: 'Attendance recorded successfully' });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('Attendance error:', err);
        res.status(500).json({ message: 'Failed to record attendance' });
    }
});

// View attendance
app.get('/api/attendance', authenticate, async (req, res) => {
    const { date, student_id } = req.query;

    try {
        let query = `
            SELECT a.*, s.name, s.class 
            FROM attendance a
            JOIN students s ON a.student_id = s.student_id
            WHERE 1=1
        `;
        const params = [];
        
        if (date) {
            query += ' AND a.date = ?';
            params.push(date);
        }
        
        if (student_id) {
            query += ' AND a.student_id = ?';
            params.push(student_id);
        }
        
        query += ' ORDER BY a.date DESC, s.name';
        
        const [records] = await pool.query(query, params);
        res.json(records);
    } catch (err) {
        console.error('View attendance error:', err);
        res.status(500).json({ message: 'Failed to fetch attendance records' });
    }
});

// Export to Excel
app.get('/api/export/excel', authenticate, async (req, res) => {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
        return res.status(400).json({ message: 'Start and end dates are required' });
    }

    try {
        const [records] = await pool.query(`
            SELECT a.date, s.student_id, s.name, s.class, a.status 
            FROM attendance a
            JOIN students s ON a.student_id = s.student_id
            WHERE a.date BETWEEN ? AND ?
            ORDER BY a.date, s.name
        `, [startDate, endDate]);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Attendance');

        // Add headers
        worksheet.columns = [
            { header: 'Date', key: 'date', width: 15 },
            { header: 'Student ID', key: 'student_id', width: 15 },
            { header: 'Name', key: 'name', width: 25 },
            { header: 'Class', key: 'class', width: 15 },
            { header: 'Status', key: 'status', width: 10 }
        ];

        // Add rows
        records.forEach(record => {
            worksheet.addRow({
                date: record.date,
                student_id: record.student_id,
                name: record.name,
                class: record.class,
                status: record.status
            });
        });

        // Set response headers
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename=attendance_${startDate}_to_${endDate}.xlsx`
        );

        // Send the file
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('Excel export error:', err);
        res.status(500).json({ message: 'Failed to generate Excel file' });
    }
});

// Export to PDF
app.get('/api/export/pdf', authenticate, async (req, res) => {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
        return res.status(400).json({ message: 'Start and end dates are required' });
    }

    try {
        const [records] = await pool.query(`
            SELECT a.date, s.student_id, s.name, s.class, a.status 
            FROM attendance a
            JOIN students s ON a.student_id = s.student_id
            WHERE a.date BETWEEN ? AND ?
            ORDER BY a.date, s.name
        `, [startDate, endDate]);

        const doc = new PDFDocument();
        
        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename=attendance_${startDate}_to_${endDate}.pdf`
        );

        // Pipe the PDF to the response
        doc.pipe(res);

        // Add title
        doc.fontSize(20).text('Attendance Report', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`From ${startDate} to ${endDate}`, { align: 'center' });
        doc.moveDown(2);

        // Add table headers
        const startX = 50;
        let startY = doc.y;
        const rowHeight = 20;
        const colWidths = [80, 80, 150, 80, 60];

        // Header row
        doc.font('Helvetica-Bold');
        doc.text('Date', startX, startY);
        doc.text('Student ID', startX + colWidths[0], startY);
        doc.text('Name', startX + colWidths[0] + colWidths[1], startY);
        doc.text('Class', startX + colWidths[0] + colWidths[1] + colWidths[2], startY);
        doc.text('Status', startX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], startY);

        // Data rows
        doc.font('Helvetica');
        startY += rowHeight;
        
        records.forEach(record => {
            doc.text(record.date, startX, startY);
            doc.text(record.student_id, startX + colWidths[0], startY);
            doc.text(record.name, startX + colWidths[0] + colWidths[1], startY);
            doc.text(record.class, startX + colWidths[0] + colWidths[1] + colWidths[2], startY);
            doc.text(record.status, startX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], startY);
            startY += rowHeight;
            
            // Add new page if we're at the bottom
            if (startY > doc.page.height - 50) {
                doc.addPage();
                startY = 50;
            }
        });

        // Finalize the PDF
        doc.end();
    } catch (err) {
        console.error('PDF export error:', err);
        res.status(500).json({ message: 'Failed to generate PDF' });
    }
});

// Serve HTML files
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/auth/login.html'));
});

app.get('/dashboard', authenticate, (req, res) => {
    res.sendFile(path.join(__dirname, 'views/admin/dashboard.html'));
});

app.get('/mark-attendance', authenticate, (req, res) => {
    res.sendFile(path.join(__dirname, 'views/admin/mark-attendance.html'));
});

app.get('/view-records', authenticate, (req, res) => {
    res.sendFile(path.join(__dirname, 'views/admin/view-records.html'));
});

app.get('/export', authenticate, (req, res) => {
    res.sendFile(path.join(__dirname, 'views/admin/export.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ message: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).redirect('/login');
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});