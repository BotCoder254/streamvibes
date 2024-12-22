const nodemailer = require('nodemailer');
const ejs = require('ejs');
const path = require('path');

// Create transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// Send email function
async function sendEmail({ to, subject, template, context }) {
    try {
        // Render email template
        const templatePath = path.join(__dirname, '..', 'views', 'emails', `${template}.ejs`);
        const html = await ejs.renderFile(templatePath, {
            ...context,
            baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`
        });

        // Send email
        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to,
            subject,
            html
        });

        console.log('Email sent successfully');
    } catch (error) {
        console.error('Email sending error:', error);
        throw error;
    }
}

module.exports = { sendEmail }; 