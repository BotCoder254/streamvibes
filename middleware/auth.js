const ensureAuthenticated = async (req, res, next) => {
    console.log('Auth middleware - isAuthenticated:', req.isAuthenticated());
    console.log('Auth middleware - session:', req.session);
    console.log('Auth middleware - user:', req.user);
    console.log('Auth middleware - passport:', req.session.passport);

    // If user is already authenticated, proceed
    if (req.isAuthenticated() && req.user) {
        return next();
    }

    // Try to restore session if we have passport user data
    if (req.session && req.session.passport && req.session.passport.user) {
        try {
            const User = require('../models/User');
            const user = await User.findById(req.session.passport.user)
                .select('-password -verificationToken -verificationTokenExpires -resetPasswordToken -resetPasswordExpires');

            if (user) {
                req.user = user;
                return next();
            }
        } catch (err) {
            console.error('Session restoration error:', err);
        }
    }

    // If we reach here, authentication failed
    req.flash('error_msg', 'Please log in to view this resource');
    res.redirect('/users/login');
};

const forwardAuthenticated = (req, res, next) => {
    if (!req.isAuthenticated()) {
        return next();
    }
    res.redirect('/dashboard');
};

module.exports = {
    ensureAuthenticated,
    forwardAuthenticated
}; 