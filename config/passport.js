const LocalStrategy = require('passport-local').Strategy;
const User = require('../models/User');
const bcrypt = require('bcryptjs');

module.exports = function(passport) {
    passport.use(new LocalStrategy({
        usernameField: 'email',
        passwordField: 'password'
    }, async (email, password, done) => {
        try {
            console.log('Attempting login for:', email);
            
            // Find user by email
            const user = await User.findOne({ email: email.toLowerCase() });
            
            if (!user) {
                console.log('No user found with email:', email);
                return done(null, false, { message: 'No account found with that email address' });
            }

            // Check if email is verified
            if (!user.isVerified) {
                console.log('User not verified:', email);
                return done(null, false, { message: 'Please verify your email address before logging in' });
            }

            // Check password
            const isMatch = await user.comparePassword(password);
            console.log('Password match result:', isMatch);

            if (!isMatch) {
                return done(null, false, { message: 'Incorrect password' });
            }

            // Successful login
            console.log('Login successful for user:', user.email);
            return done(null, user);
        } catch (error) {
            console.error('Authentication error:', error);
            return done(error);
        }
    }));

    passport.serializeUser((user, done) => {
        try {
            console.log('Serializing user:', user._id);
            done(null, user._id.toString());
        } catch (error) {
            console.error('Serialization error:', error);
            done(error);
        }
    });

    passport.deserializeUser(async (id, done) => {
        try {
            console.log('Deserializing user:', id);
            const user = await User.findById(id)
                .select('-password -verificationToken -verificationTokenExpires -resetPasswordToken -resetPasswordExpires');
            
            if (!user) {
                console.log('User not found during deserialization:', id);
                return done(null, false);
            }

            // Convert to plain object and ensure _id is a string
            const userObject = user.toObject();
            userObject._id = userObject._id.toString();

            console.log('User deserialized successfully:', userObject._id);
            done(null, userObject);
        } catch (error) {
            console.error('Deserialization error:', error);
            done(error);
        }
    });
}; 