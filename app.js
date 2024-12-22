require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { MongoClient, ServerApiVersion } = require('mongodb');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const flash = require('connect-flash');
const passport = require('passport');
const path = require('path');
const fs = require('fs');

const app = express();

// Suppress deprecation warning
process.removeAllListeners('warning');

// Passport config
require('./config/passport')(passport);

// MongoDB Connection URI
const uri = "mongodb+srv://stream:telvinteum@stream.o3qip.mongodb.net/?retryWrites=true&w=majority&appName=stream";

// Create a MongoClient with a MongoClientOptions object
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// DB Config with Mongoose
mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true
    }
})
.then(async () => {
    try {
        // Connect the client to the server
        await client.connect();
        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("MongoDB Connected Successfully!");
    } catch (err) {
        console.error("Error connecting to MongoDB:", err);
    }
})
.catch(err => console.error('MongoDB connection error:', err));

// EJS
app.use(expressLayouts);
app.set('view engine', 'ejs');
app.set('layout', 'layouts/main');

// Express body parser
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Express session with MongoDB store
app.use(session({
    secret: process.env.SESSION_SECRET || 'KquWbFL6DYB7sw4FxuVXAyZnwbfArT0YpoxF1yNGKZg',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: uri,
        collectionName: 'sessions',
        ttl: 24 * 60 * 60, // 1 day
        autoRemove: 'native',
        crypto: {
            secret: process.env.SESSION_SECRET || 'KquWbFL6DYB7sw4FxuVXAyZnwbfArT0YpoxF1yNGKZg'
        }
    }),
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Connect flash
app.use(flash());

// Global variables
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.warning_msg = req.flash('warning_msg');
    res.locals.error = req.flash('error');
    res.locals.user = req.user || null;
    res.locals.isAuthenticated = req.isAuthenticated();
    res.locals.title = 'StreamVista';
    res.locals.path = req.originalUrl || '/';
    next();
});

// Create necessary directories
const directories = [
    path.join(__dirname, 'public', 'uploads', 'avatars'),
    path.join(__dirname, 'public', 'uploads', 'videos'),
    path.join(__dirname, 'public', 'uploads', 'thumbnails'),
    path.join(__dirname, 'uploads', 'temp')
];

directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
        try {
            fs.mkdirSync(dir, { recursive: true });
            // Set proper permissions
            fs.chmodSync(dir, 0o755);
        } catch (err) {
            console.error(`Error creating directory ${dir}:`, err);
        }
    }
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/', require('./routes/index'));
app.use('/users', require('./routes/users'));
app.use('/videos', require('./routes/videos'));
app.use('/playlists', require('./routes/playlists'));
app.use('/dashboard', require('./routes/dashboard'));

// Handle both /feed and /videos/feed
app.get('/feed', (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/users/login');
    }
    res.redirect('/videos/feed');
});

// Error handling middleware
app.use((req, res, next) => {
    res.status(404).render('errors/404', {
        user: req.user,
        title: '404 Not Found'
    });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('errors/500', {
        user: req.user,
        title: '500 Server Error'
    });
});

// Handle deprecation warnings
process.on('warning', (warning) => {
    if (warning.name === 'DeprecationWarning') {
        if (warning.code === 'DEP0044') {
            // Suppress this specific warning
            return;
        }
    }
});

// Cleanup on app termination
process.on('SIGINT', async () => {
    try {
        await client.close();
        console.log('MongoDB connection closed.');
        process.exit(0);
    } catch (err) {
        console.error('Error during cleanup:', err);
        process.exit(1);
    }
});

// Override util.isArray
const util = require('util');
util.isArray = Array.isArray;

const PORT = process.env.PORT || 3000;
app.listen(PORT, console.log(`Server running on port ${PORT}`)); 