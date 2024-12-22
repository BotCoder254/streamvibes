# StreamVista - Professional Video Streaming Platform

StreamVista is a modern, professional video streaming platform built with Node.js, MongoDB, EJS, and Tailwind CSS. It provides a seamless experience for content creators to share their videos with the world.

## Features

- User Authentication
  - Email & Password Registration/Login
  - Social Media Authentication (Google, Facebook, Twitter)
  - Password Reset Functionality
  - Remember Me Option

- User Management
  - Profile Management
  - Account Settings
  - Avatar Upload

- Modern UI/UX
  - Responsive Design
  - Beautiful Animations
  - Professional Layout
  - Dark/Light Mode Support

## Prerequisites

- Node.js (v14 or higher)
- MongoDB
- npm or yarn

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/streamvista.git
   cd streamvista
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory and add your configurations:
   ```env
   MONGODB_URI=mongodb://localhost/streamvista
   SESSION_SECRET=your_session_secret_here
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASS=your_email_password
   PORT=3000
   ```

4. Build the CSS:
   ```bash
   npm run build:css
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

The application will be available at `http://localhost:3000`

## Project Structure

```
streamvista/
├── config/             # Configuration files
├── models/            # Database models
├── public/            # Static files
│   ├── css/          # Compiled CSS
│   ├── js/           # Client-side JavaScript
│   └── images/       # Image assets
├── routes/           # Route handlers
├── views/            # EJS templates
│   ├── layouts/      # Layout templates
│   └── partials/     # Reusable components
├── .env              # Environment variables
├── app.js            # Application entry point
└── package.json      # Project dependencies
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Node.js
- Express.js
- MongoDB
- EJS
- Tailwind CSS
- Phosphor Icons 