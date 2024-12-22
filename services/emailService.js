const nodemailer = require('nodemailer');

// Create transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER || 'teumteum776@gmail.com',
        pass: process.env.SMTP_PASS || 'lxnqofjkeeivvjqq'
    }
});

// Send verification email
const sendVerificationEmail = async (user, token) => {
    try {
        const verificationUrl = `http://localhost:3000/users/verify/${token}`;
        
        const mailOptions = {
            from: '"StreamVista" <teumteum776@gmail.com>',
            to: user.email,
            subject: 'Verify Your StreamVista Account',
            html: `
                <h1>Welcome to StreamVista!</h1>
                <p>Hello ${user.username},</p>
                <p>Thank you for registering. Please verify your email by clicking the link below:</p>
                <a href="${verificationUrl}" style="display: inline-block; padding: 10px 20px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 5px;">Verify Email</a>
                <p>If you did not create this account, please ignore this email.</p>
                <p>This link will expire in 24 hours.</p>
            `
        };

        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Error sending verification email:', error);
        return false;
    }
};

// Send password reset email
const sendPasswordResetEmail = async (user, resetUrl) => {
    try {
        const mailOptions = {
            from: '"StreamVista" <teumteum776@gmail.com>',
            to: user.email,
            subject: 'Password Reset Request',
            html: `
                <h1>Password Reset</h1>
                <p>Hello ${user.username},</p>
                <p>You requested to reset your password. Click the link below to reset it:</p>
                <a href="${resetUrl}" style="display: inline-block; padding: 10px 20px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a>
                <p>If you did not request this reset, please ignore this email.</p>
                <p>This link will expire in 1 hour.</p>
            `
        };

        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Error sending password reset email:', error);
        return false;
    }
};

// Send password changed confirmation email
const sendPasswordChangedEmail = async (user) => {
    try {
        const mailOptions = {
            from: '"StreamVista" <teumteum776@gmail.com>',
            to: user.email,
            subject: 'Password Changed Successfully',
            html: `
                <h1>Password Changed</h1>
                <p>Hello ${user.username},</p>
                <p>Your password has been successfully changed.</p>
                <p>If you did not make this change, please contact support immediately.</p>
            `
        };

        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Error sending password changed email:', error);
        return false;
    }
};

module.exports = {
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendPasswordChangedEmail
}; 