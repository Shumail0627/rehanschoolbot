// server.js
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Create connection pool (sirf ek baar banayenge)
const pool = mysql.createPool({
  host: 'sgp47.siteground.asia',  // Changed back to SiteGround host
  user: 'uhgjpkjnkkwnq',
  password: 'password@123',
  database: 'dbmdju4fgdana6',
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: false
  },
  connectTimeout: 60000
});

// Convert pool to promise-based operations
const promisePool = pool.promise();

// Enhanced test connection function
async function testConnection() {
  let connection;
  try {
    console.log('Attempting to get connection...');
    connection = await promisePool.getConnection();
    console.log('Connection acquired successfully');

    console.log('Testing simple query...');
    const [result] = await connection.query('SELECT 1');
    console.log('Query successful:', result);

    return true;
  } catch (err) {
    console.error('Connection test failed:');
    console.error('Error Code:', err.code);
    console.error('Error Number:', err.errno);
    console.error('SQL State:', err.sqlState);
    console.error('Full Error:', err);
    return false;
  } finally {
    if (connection) {
      console.log('Releasing connection');
      connection.release();
    }
  }
}

// Run test immediately
testConnection().then(success => {
  if (success) {
    console.log('Database connection is working properly!');
  } else {
    console.log('Database connection test failed!');
  }
});

// Chat API route with comprehensive features
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  const lowerMessage = message.toLowerCase();
  
  try {
    // Show all campuses
    if (lowerMessage.includes('all campuses') || lowerMessage.includes('show campuses')) {
      const query = `
        SELECT DISTINCT campus 
        FROM users 
        WHERE campus IS NOT NULL AND campus != ''
        ORDER BY campus
      `;

      const [results] = await promisePool.query(query);

      if (results.length === 0) {
        return res.json({ response: 'No campuses found in the database.' });
      }

      let response = 'All Campuses:\n\n';
      results.forEach(result => {
        response += `- ${result.campus}\n`;
      });

      return res.json({ response });
    }

    // Show campus-specific students
    else if ((lowerMessage.includes('students') && lowerMessage.includes('campus'))) {
      const campusName = extractCampusName(lowerMessage);
      if (!campusName) {
        return res.json({ 
          response: 'Please specify which campus (e.g., "show students of Munawwar campus")' 
        });
      }

      try {
        const query = `
          SELECT 
            name,
            roll_no,
            class,
            gmail as email,
            contact_father as phone
          FROM users
          WHERE LOWER(campus) = ? AND role = 'Student'
          ORDER BY class, name
        `;

        const [results] = await promisePool.query(query, [campusName.toLowerCase()]);

        if (results.length === 0) {
          return res.json({ response: `No students found in ${campusName} campus.` });
        }

        let response = `Students in ${campusName} Campus:\n`;
        let currentClass = '';

        results.forEach(student => {
          if (student.class !== currentClass) {
            currentClass = student.class || 'Unassigned';
            response += `\n📚 Class ${currentClass}:\n`;
          }
          response += `👤 ${student.name} | 📝 Roll No: ${student.roll_no} | 📧 ${student.email || 'No email'} | 📱 ${student.phone || 'No phone'}\n`;
        });

        response += `\nTotal students: ${results.length}`;
        return res.json({ response });
      } catch (error) {
        console.error('Query error:', error);
        return res.status(500).json({ 
          response: 'Sorry, there was an error processing your request. Please try again later.'
        });
      }
    }

    // Show all students
    else if (lowerMessage.includes('all students') || lowerMessage.includes('show students')) {
      const query = `
        SELECT 
          s.name,
          s.roll_number,
          c.name as class_name,
          camp.name as campus_name,
          s.phone
        FROM students s
        LEFT JOIN classes c ON s.class_id = c.id
        LEFT JOIN campus camp ON s.campus_id = camp.id
        ORDER BY camp.name, c.name, s.name
      `;

      const [results] = await promisePool.query(query);

      if (results.length === 0) {
        return res.json({ response: 'No students found in the database.' });
      }

      let response = 'All Students:\n\n';
      let currentCampus = '';
      let currentClass = '';

      for (const student of results) {
        if (student.campus_name !== currentCampus) {
          currentCampus = student.campus_name;
          response += `\n${currentCampus} Campus:\n`;
          currentClass = '';
        }
        if (student.class_name !== currentClass) {
          currentClass = student.class_name;
          response += `\nClass ${currentClass || 'Unassigned'}:\n`;
        }
        response += `- ${student.name} (Roll No: ${student.roll_number || 'N/A'})\n`;
      }

      response += `\nTotal students: ${results.length}`;
      return res.json({ response });
    }

    // Show class-wise students
    else if (lowerMessage.includes('class')) {
      const classNumber = extractClassNumber(lowerMessage);
      if (!classNumber) {
        return res.json({ response: 'Please specify which class (e.g., "students in class 10")' });
      }

      const query = `
        SELECT 
          s.name,
          s.roll_number,
          c.name as class_name,
          camp.name as campus_name
        FROM students s
        JOIN classes c ON s.class_id = c.id
        LEFT JOIN campus camp ON s.campus_id = camp.id
        WHERE c.name LIKE ?
        ORDER BY camp.name, s.name
      `;

      const [results] = await promisePool.query(query, [`%${classNumber}%`]);

      if (results.length === 0) {
        return res.json({ response: `No students found in class ${classNumber}.` });
      }

      let response = `Students in Class ${classNumber}:\n\n`;
      let currentCampus = '';

      for (const student of results) {
        if (student.campus_name !== currentCampus) {
          currentCampus = student.campus_name;
          response += `\n${currentCampus} Campus:\n`;
        }
        response += `- ${student.name} (Roll No: ${student.roll_number || 'N/A'})\n`;
      }

      return res.json({ 
        response: `${response}\n\nTotal: ${results.length} students`
      });
    }

    // Show campus-wise attendance
    else if (lowerMessage.includes('campus attendance')) {
      const campusName = extractCampusName(lowerMessage);
      if (!campusName) {
        return res.json({ 
          response: 'Please specify which campus (e.g., "show attendance of Munawwar campus")' 
        });
      }

      const query = `
        SELECT 
          s.name,
          c.name as class_name,
          COUNT(a.id) as total_present,
          (SELECT COUNT(DISTINCT date) FROM attendance) as total_days
        FROM students s
        JOIN campus camp ON s.campus_id = camp.id
        LEFT JOIN classes c ON s.class_id = c.id
        LEFT JOIN attendance a ON s.id = a.student_id AND a.status = 'present'
        WHERE LOWER(camp.name) = ?
        GROUP BY s.id, s.name, c.name
        ORDER BY c.name, s.name
      `;

      const [results] = await promisePool.query(query, [campusName.toLowerCase()]);

      if (results.length === 0) {
        return res.json({ response: `No attendance records found for ${campusName} campus.` });
      }

      let response = `Attendance Report for ${campusName} Campus:\n\n`;
      let currentClass = '';

      for (const record of results) {
        if (record.class_name !== currentClass) {
          currentClass = record.class_name;
          response += `\nClass ${currentClass || 'Unassigned'}:\n`;
        }
        const percentage = ((record.total_present / record.total_days) * 100).toFixed(1);
        response += `- ${record.name}: ${record.total_present}/${record.total_days} days (${percentage}%)\n`;
      }

      return res.json({ response });
    }

    // Search student by name
    else if (lowerMessage.includes('search') && lowerMessage.includes('student')) {
      const name = message.split('student')[1].trim();
      if (!name) {
        return res.json({ response: 'Please provide a student name to search (e.g., "search student Ahmed")' });
      }

      try {
        const query = `
          SELECT 
            name,
            roll_no,
            class,
            campus,
            gmail as email,
            contact_father as phone
          FROM users
          WHERE LOWER(name) LIKE ? AND role = 'Student'
          ORDER BY campus, class, name
        `;

        const [results] = await promisePool.query(query, [`%${name.toLowerCase()}%`]);

        if (results.length === 0) {
          return res.json({ response: `No students found with name containing "${name}".` });
        }

        let response = `Found ${results.length} student(s):\n\n`;
        
        results.forEach(student => {
          response += `👤 ${student.name} | 📝 Roll No: ${student.roll_no} | 📚 Class: ${student.class || 'Not Assigned'} | 🏫 Campus: ${student.campus} | 📧 ${student.email || 'No email'} | 📱 ${student.phone || 'No phone'}\n`;
        });

        return res.json({ response });
      } catch (error) {
        console.error('Search error:', error);
        return res.status(500).json({ 
          response: 'Sorry, there was an error processing your request. Please try again later.'
        });
      }
    }

    // Show student fees details
    else if (lowerMessage.includes('fees') && 
            (lowerMessage.includes('show') || lowerMessage.includes('for'))) {
      // Extract student name from message
      let name = '';
      if (lowerMessage.includes('for')) {
        name = message.split('for')[1].trim();
      } else {
        name = message.toLowerCase()
                     .replace('show', '')
                     .replace('fees', '')
                     .trim();
      }
      
      if (!name) {
        return res.json({ 
          response: 'Please provide a student name (e.g., "show fees for Abdul Ahad")' 
        });
      }

      try {
        // First get student details
        const studentQuery = `
          SELECT 
            id,
            name,
            roll_no,
            class,
            campus,
            admission_date
          FROM users
          WHERE LOWER(name) LIKE ? AND role = 'Student'
          LIMIT 1
        `;

        const [students] = await promisePool.query(studentQuery, [`%${name}%`]);

        if (students.length === 0) {
          return res.json({ response: `No student found with name "${name}".` });
        }

        const student = students[0];

        // Now get fees details
        const feesQuery = `
          SELECT 
            month,
            amount,
            paid_amount,
            paid_date,
            status
          FROM student_fees
          WHERE student_id = ?
          ORDER BY month DESC
        `;

        const [fees] = await promisePool.query(feesQuery, [student.id]);

        let response = `📊 Fees Record for ${student.name}:\n\n`;
        response += `📝 Roll No: ${student.roll_no}\n`;
        response += `📚 Class: ${student.class}\n`;
        response += `🏫 Campus: ${student.campus}\n`;
        if (student.admission_date) {
          response += `📅 Admission Date: ${new Date(student.admission_date).toLocaleDateString()}\n`;
        }
        response += `\n💰 Fees Details:\n`;

        let totalReceived = 0;
        let pendingMonths = [];

        if (fees.length > 0) {
          fees.forEach(fee => {
            if (fee.paid_amount) {
              totalReceived += fee.paid_amount;
            }
            
            if (fee.status === 'pending') {
              pendingMonths.push(fee.month);
            }

            response += `\nMonth: ${fee.month}\n`;
            response += `Amount: Rs.${fee.amount || 0}\n`;
            response += `Paid: Rs.${fee.paid_amount || 0}\n`;
            response += `Status: ${fee.status || 'pending'}\n`;
            if (fee.paid_date) {
              response += `Paid Date: ${new Date(fee.paid_date).toLocaleDateString()}\n`;
            }
          });

          response += `\n═══════════════════\n`;
          response += `💵 Total Fees Received: Rs.${totalReceived}\n`;
          
          if (pendingMonths.length > 0) {
            response += `⚠️ Pending Months: ${pendingMonths.join(', ')}\n`;
          } else {
            response += `✅ All fees are paid\n`;
          }
        } else {
          response += `\nNo fees records found for this student.`;
        }

        return res.json({ response });
      } catch (error) {
        console.error('Fees query error:', error);
        console.error(error.stack);
        return res.status(500).json({ 
          response: 'Sorry, there was an error processing your request. Please try again later.'
        });
      }
    }

    // Show principal of campus
    else if (lowerMessage.includes('principal') && lowerMessage.includes('campus')) {
      const campusName = extractCampusName(lowerMessage);
      if (!campusName) {
        return res.json({ 
          response: 'Please specify which campus (e.g., "show principal of Munawwar campus")' 
        });
      }

      try {
        const query = `
          SELECT 
            name,
            gmail as email,
            contact_father as phone,
            campus
          FROM users
          WHERE LOWER(campus) = ? 
          AND role = 'Principal'
          LIMIT 1
        `;

        const [results] = await promisePool.query(query, [campusName.toLowerCase()]);

        if (results.length === 0) {
          return res.json({ response: `No principal found for ${campusName} campus.` });
        }

        const principal = results[0];
        let response = `🎓 Principal of ${principal.campus} Campus:\n\n`;
        response += `👤 Name: ${principal.name}\n`;
        if (principal.email) response += `📧 Email: ${principal.email}\n`;
        if (principal.phone) response += `📱 Phone: ${principal.phone}\n`;

        return res.json({ response });
      } catch (error) {
        console.error('Query error:', error);
        return res.status(500).json({ 
          response: 'Sorry, there was an error processing your request. Please try again later.'
        });
      }
    }

    // Default help message
    else {
      return res.json({ 
        response: `I can help you with:\n\n` +
                 `Campus Related:\n` +
                 `1. "Show all campuses"\n` +
                 `2. "Show students of [campus name] campus"\n` +
                 `3. "Show attendance of [campus name] campus"\n` +
                 `4. "Show principal of [campus name] campus"\n\n` +
                 `Student Related:\n` +
                 `5. "Show all students"\n` +
                 `6. "Show students in class [number]"\n` +
                 `7. "Search student [name]"\n` +
                 `8. "Show attendance report"\n` +
                 `9. "Show fees for [STUDENT NAME]"`
      });
    }
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ 
      response: 'Sorry, there was an error processing your request. Please try again later.'
    });
  }
});

// Login API
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // First, log the attempt for debugging
    console.log('Login attempt:', { email });

    const query = `
      SELECT 
        id,
        name,
        role,
        campus,
        gmail as email
      FROM users 
      WHERE gmail = ? 
      LIMIT 1
    `;

    const [results] = await promisePool.query(query, [email]);
    console.log('Query results:', results); // Debug log

    if (results.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    const user = results[0];
    
    // Check if password matches (add your password verification logic here)
    // For now, let's log what we're checking
    console.log('Checking password:', {
      provided: password,
      stored: user.password // If password is stored in the users table
    });

    return res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        campus: user.campus,
        email: user.email
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error during login' 
    });
  }
});

// Helper function to extract campus name
function extractCampusName(message) {
  const campusKeywords = ['munawwar', 'korangi', 'islamabad', 'online'];
  
  for (const campus of campusKeywords) {
    if (message.toLowerCase().includes(campus)) {
      return campus;
    }
  }

  const match = message.match(/(?:students|attendance) of\s+(\w+)\s+campus/i);
  return match ? match[1].toLowerCase() : null;
}

// Helper function to extract class number
function extractClassNumber(message) {
  const match = message.match(/class\s+(\d+)/i);
  return match ? match[1] : null;
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({ 
    response: 'An unexpected error occurred. Please try again later.' 
  });
});

const PORT = 3002;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}\n`);
  console.log('Available commands:');
  console.log('Campus Commands:');
  console.log('1. "Show all campuses"');
  console.log('2. "Show students of [campus name] campus"');
  console.log('3. "Show attendance of [campus name] campus"');
  console.log('4. "Show principal of [campus name] campus"');
  console.log('\nStudent Commands:');
  console.log('5. "Show all students"');
  console.log('6. "Show students in class X"');
  console.log('7. "Search student NAME"');
  console.log('8. "Show fees for [STUDENT NAME]"');
});