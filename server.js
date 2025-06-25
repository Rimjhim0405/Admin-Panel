const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://rimjhimnagar2004:<db_password>@cluster0.7ljyn8d.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error('MongoDB connection error:', error.message);
        console.log('\n🚨 MONGODB CONNECTION FAILED!');
        console.log('📋 Possible solutions:');
        console.log('1. Make sure MongoDB is installed and running on your system');
        console.log('2. Start MongoDB with: mongod --dbpath "C:\\data\\db" (Windows)');
        console.log('3. Or use MongoDB Atlas (cloud) - update MONGODB_URI in .env file');        
        console.log('4. Check if port 27017 is available\n');
        
        // Don't exit the process, let the server run but show connection status
        // process.exit(1);
    }
};

// Connect to database
connectDB();

const db = mongoose.connection;
db.on('error', (error) => {
    console.error('MongoDB connection error:', error.message);
});
db.once('open', function() {
    console.log('✅ Connected to MongoDB successfully!');
});

// User Schema
const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: 2
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    type: {
        type: String,
        required: true,
        enum: ['salesman', 'picker']
    }
}, {
    timestamps: true
});

/*// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});
*/
const User = mongoose.model('User', userSchema);

// Middleware to check database connection
const checkDBConnection = (req, res, next) => {
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ 
            error: 'Database connection unavailable',
            message: 'Please ensure MongoDB is running'
        });
    }
    next();
};

// Routes

// Get all users by type
app.get('/api/users/:type', checkDBConnection, async (req, res) => {
    try {
        const { type } = req.params;
        
        if (!['salesman', 'picker'].includes(type)) {
            return res.status(400).json({ error: 'Invalid user type' });
        }
        
        const users = await User.find({ type }).select('-__v');
        
        const usersWithDecryptedPasswords = users.map(user => ({
            _id: user._id,
            name: user.name,
            email: user.email,
            password: user.password, 
            type: user.type,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        }));
        
        res.json(usersWithDecryptedPasswords);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Get all users (for dashboard overview)
app.get('/api/users', checkDBConnection, async (req, res) => {
    try {
        const salesman = await User.find({ type: 'salesman' }).select('-__v');
        const picker = await User.find({ type: 'picker' }).select('-__v');
        
        const formatUsers = (users) => users.map(user => ({
            _id: user._id,
            name: user.name,
            email: user.email,
            password: user.password,
            type: user.type,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        }));
        
        res.json({
            salesman: formatUsers(salesman),
            picker: formatUsers(picker)
        });
    } catch (error) {
        console.error('Error fetching all users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Add new user
app.post('/api/users', checkDBConnection, async (req, res) => {
    try {
        const { name, email, password, type } = req.body;
        
        // Validation
        if (!name || !email || !password || !type) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        
        if (!['salesman', 'picker'].includes(type)) {
            return res.status(400).json({ error: 'Invalid user type' });
        }
        
        // Check for duplicate email
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already exists' });
        }
        
        // Create new user
        const user = new User({
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password,
            type
        });
        
        await user.save();
        
        // Return user without sensitive data
        const userResponse = {
            _id: user._id,
            name: user.name,
            email: user.email,
            password: user.password,
            type: user.type,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        };
        
        res.status(201).json({
            message: 'User created successfully',
            user: userResponse
        });
    } catch (error) {
        console.error('Error creating user:', error);
        if (error.code === 11000) {
            res.status(400).json({ error: 'Email already exists' });
        } else {
            res.status(500).json({ error: 'Failed to create user' });
        }
    }
});

// Update user
app.put('/api/users/:id', checkDBConnection, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, password, type } = req.body;
        
        // Validation
        if (!name || !email || !type) {
            return res.status(400).json({ error: 'Name, email, and type are required' });
        }
        
        if (!['salesman', 'picker'].includes(type)) {
            return res.status(400).json({ error: 'Invalid user type' });
        }
        
        // Check if user exists
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Check for duplicate email (excluding current user)
        const existingUser = await User.findOne({ 
            email: email.toLowerCase(), 
            _id: { $ne: id } 
        });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already exists' });
        }
        
        // Update user fields
        user.name = name.trim();
        user.email = email.toLowerCase().trim();
        user.type = type;
        
        // Only update password if provided and different
        if (password && password !== user.password) {
            user.password = password; // This will trigger the pre-save hook to hash it
        }
        
        await user.save();
        
        const userResponse = {
            _id: user._id,
            name: user.name,
            email: user.email,
            password: user.password,
            type: user.type,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        };
        
        res.json({
            message: 'User updated successfully',
            user: userResponse
        });
    } catch (error) {
        console.error('Error updating user:', error);
        if (error.code === 11000) {
            res.status(400).json({ error: 'Email already exists' });
        } else {
            res.status(500).json({ error: 'Failed to update user' });
        }
    }
});

// Delete user
app.delete('/api/users/:id', checkDBConnection, async (req, res) => {
    try {
        const { id } = req.params;
        
        const user = await User.findByIdAndDelete(id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// Health check - now includes database status
app.get('/api/health', (req, res) => {
    const dbStatus = mongoose.connection.readyState;
    const statusMap = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
    };
    
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        database: {
            status: statusMap[dbStatus],
            connected: dbStatus === 1
        }
    });
});

const PORT = process.env.PORT || 5000; 
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    
    if (mongoose.connection.readyState !== 1) {
        console.log('\n⚠️  Warning: MongoDB not connected');
        console.log('The server is running but database operations will fail');
    }
});
